import { z } from 'zod';
import { ehDaLoja, exigirPermissao } from '../auth.ts';
import { validar, type Modulo } from '../contexto.ts';
import type { Consulta } from '../db.ts';
import { proibido } from '../erros.ts';

// T9 · T10 · RF-25 a RF-27: painéis calculados a partir do ledger, que é a
// fonte oficial; nada aqui recalcula comissão por fora.

interface ValoresLoja {
  loja_id: string;
  loja_nome: string;
  bruto_brl_centavos: number;
  comissao_portal_brl_centavos: number;
  comissao_epyx_brl_centavos: number;
  ajustes_brl_centavos: number;
  subsidios_brl_centavos: number;
  liquido_brl_centavos: number;
}

/** Repasse, comissões e ajustes por loja, já descontados os estornos. */
async function valoresPorLoja(q: Consulta, lojaId?: string): Promise<ValoresLoja[]> {
  const r = await q.query<ValoresLoja>(
    `with l as (
       select loja_id,
         sum(case tipo when 'REPASSE_LOJA' then valor_centavos when 'ESTORNO_REPASSE_LOJA' then -valor_centavos else 0 end) as repasse,
         sum(case tipo when 'COMISSAO_PORTAL' then valor_centavos when 'ESTORNO_COMISSAO_PORTAL' then -valor_centavos else 0 end) as portal,
         sum(case tipo when 'COMISSAO_EPYX' then valor_centavos when 'ESTORNO_COMISSAO_EPYX' then -valor_centavos else 0 end) as epyx,
         sum(case when tipo = 'AJUSTE_OCORRENCIA' and conta_debito like 'loja:%' then valor_centavos else 0 end) as ajustes,
         sum(case tipo when 'SUBSIDIO_CAMPANHA' then valor_centavos when 'ESTORNO_SUBSIDIO_CAMPANHA' then -valor_centavos else 0 end) as subsidios
       from lancamento where loja_id is not null ${lojaId ? 'and loja_id = $1' : ''}
       group by loja_id
     )
     select lj.id as loja_id, lj.nome as loja_nome,
       coalesce(l.repasse + l.portal + l.epyx, 0)::bigint as bruto_brl_centavos,
       coalesce(l.portal, 0)::bigint as comissao_portal_brl_centavos,
       coalesce(l.epyx, 0)::bigint as comissao_epyx_brl_centavos,
       coalesce(l.ajustes, 0)::bigint as ajustes_brl_centavos,
       coalesce(l.subsidios, 0)::bigint as subsidios_brl_centavos,
       coalesce(l.repasse - l.ajustes + l.subsidios, 0)::bigint as liquido_brl_centavos
     from loja lj left join l on l.loja_id = lj.id
     ${lojaId ? 'where lj.id = $1' : ''}
     order by bruto_brl_centavos desc, lj.nome`,
    lojaId ? [lojaId] : [],
  );
  return r.rows;
}

const filtroLancamentos = z.object({
  pedido_id: z.uuid().optional(),
  limite: z.coerce.number().int().min(1).max(1000).default(200),
});

const csv = (v: unknown) => {
  const s = v instanceof Date ? v.toISOString() : String(v ?? '');
  return /[;"\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export const rotasRelatorios: Modulo = (app, { db }) => {
  app.get<{ Params: { id: string } }>('/v1/relatorios/lojas/:id', async (req) => {
    const u = exigirPermissao(req, 'financeiro.loja');
    if (ehDaLoja(u) && u.loja_id !== req.params.id) throw proibido('relatório de outra loja');
    const [v] = await valoresPorLoja(db, req.params.id);
    const modos = await db.query<{ modo: string; n: number }>(
      `select p.modo, count(*)::int as n from pedido p
       where exists (select 1 from pedido_item i where i.pedido_id = p.id and i.loja_id = $1)
         and p.estado not in ('CRIADO', 'AGUARDANDO_PIX', 'EXPIRADO', 'CANCELADO', 'REEMBOLSADO')
       group by p.modo`,
      [req.params.id],
    );
    return {
      loja_id: req.params.id,
      bruto_brl_centavos: v?.bruto_brl_centavos ?? 0,
      comissao_portal_brl_centavos: v?.comissao_portal_brl_centavos ?? 0,
      comissao_epyx_brl_centavos: v?.comissao_epyx_brl_centavos ?? 0,
      ajustes_brl_centavos: v?.ajustes_brl_centavos ?? 0,
      subsidios_brl_centavos: v?.subsidios_brl_centavos ?? 0,
      liquido_brl_centavos: v?.liquido_brl_centavos ?? 0,
      pedidos_por_modo: Object.fromEntries(modos.rows.map((m) => [m.modo, m.n])),
    };
  });

  app.get('/v1/relatorios/plataforma', async (req) => {
    exigirPermissao(req, 'financeiro.plataforma');
    const saldos = await db.query<{ conta: string; saldo: number }>(
      `select conta, sum(v)::bigint as saldo from (
         select conta_credito as conta, valor_centavos as v from lancamento
         union all select conta_debito, -valor_centavos from lancamento
       ) x group by conta order by conta`,
    );
    const gmv = await db.query<{ v: number }>(`select coalesce(sum(valor_brl_centavos), 0)::bigint as v from pagamento where estado = 'CONFIRMADO'`);
    const estados = await db.query<{ estado: string; n: number }>('select estado, count(*)::int as n from pedido group by estado');
    return {
      gmv_brl_centavos: gmv.rows[0]!.v,
      saldos_por_conta: Object.fromEntries(saldos.rows.map((s) => [s.conta, s.saldo])),
      por_loja: await valoresPorLoja(db),
      pedidos_por_estado: Object.fromEntries(estados.rows.map((e) => [e.estado, e.n])),
    };
  });

  app.get('/v1/lancamentos', async (req) => {
    exigirPermissao(req, 'financeiro.plataforma');
    const f = validar(filtroLancamentos, req.query);
    const r = await db.query(
      `select l.id, l.criado_em, l.transacao_id, l.conta_debito, l.conta_credito, l.valor_centavos, l.tipo, l.loja_id,
              l.ocorrencia_id, p.id as pedido_id, p.codigo as pedido_codigo
       from lancamento l
       left join pagamento g on g.id = l.pagamento_id
       left join ocorrencia o on o.id = l.ocorrencia_id
       left join pedido p on p.id = coalesce(g.pedido_id, o.pedido_id)
       ${f.pedido_id ? 'where p.id = $2' : ''}
       order by l.criado_em desc, l.tipo limit $1`,
      f.pedido_id ? [f.limite, f.pedido_id] : [f.limite],
    );
    return { lancamentos: r.rows };
  });

  // RF-27: conciliação do extrato Pix com o ledger. Diferença diferente de zero é alerta.
  app.get('/v1/relatorios/conciliacao.csv', async (req, rep) => {
    exigirPermissao(req, 'financeiro.plataforma');
    const r = await db.query<Record<string, unknown>>(
      `select g.txid, g.end_to_end_id, g.estado, p.codigo as pedido, g.valor_brl_centavos, g.confirmado_em,
         coalesce((select sum(valor_centavos) from lancamento l where l.pagamento_id = g.id and l.conta_debito = 'pix:recebimentos'), 0)::bigint as lancado
       from pagamento g join pedido p on p.id = g.pedido_id
       where g.end_to_end_id is not null order by g.confirmado_em`,
    );
    const linhas = [
      'txid;end_to_end_id;estado;pedido;valor_pix;lancado_ledger;diferenca;confirmado_em',
      ...r.rows.map((l) =>
        [
          l.txid,
          l.end_to_end_id,
          l.estado,
          l.pedido,
          ((l.valor_brl_centavos as number) / 100).toFixed(2),
          ((l.lancado as number) / 100).toFixed(2),
          (((l.valor_brl_centavos as number) - (l.lancado as number)) / 100).toFixed(2),
          l.confirmado_em,
        ]
          .map(csv)
          .join(';'),
      ),
    ];
    return rep
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', 'attachment; filename="conciliacao-pix.csv"')
      .send(linhas.join('\n'));
  });
};
