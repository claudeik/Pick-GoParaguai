import type { Contexto } from '../contexto.ts';
import type { Consulta } from '../db.ts';
import { devolverEstoque } from './pagamentos.ts';
import { transitar, travarPedido } from './registro.ts';

// Rotinas periódicas. Cada pedido é tratado na própria transação, com o pedido
// travado, para não disputar com o webhook do Pix ou com a operação.

/** Pix vencido: pedido EXPIRADO e estoque devolvido. Um Pix que chegue depois vira RECEBIDO_FORA_DO_PRAZO. */
export async function expirarCobrancas(ctx: Contexto): Promise<number> {
  const vencidas = await ctx.db.query<{ id: string; pedido_id: string }>(
    `select id, pedido_id from pagamento where estado = 'PENDENTE' and expira_em < $1 order by expira_em limit 200`,
    [ctx.agora()],
  );
  let n = 0;
  for (const v of vencidas.rows) {
    await ctx.db.tx(async (q) => {
      const p = await travarPedido(q, v.pedido_id);
      const pag = await q.query<{ estado: string }>('select estado from pagamento where id = $1 for update', [v.id]);
      if (pag.rows[0]?.estado !== 'PENDENTE') return;
      await q.query(`update pagamento set estado = 'EXPIRADO' where id = $1`, [v.id]);
      if (p.estado === 'AGUARDANDO_PIX') {
        await transitar(q, p, 'EXPIRADO', 'sistema');
        await devolverEstoque(q, p.id);
        n++;
      }
    });
  }
  return n;
}

/** Pronto há mais que o prazo e não retirado: aciona a jornada de lembrete e a política de reembolso [DECISÃO]. */
export async function marcarNaoRetirados(ctx: Contexto): Promise<number> {
  const limite = new Date(ctx.agora().getTime() - ctx.config.prazoRetiradaHoras * 3_600_000);
  const r = await ctx.db.query<{ id: string }>(
    `select id from pedido where estado = 'PRONTO_RETIRADA' and pronto_em < $1 limit 200`,
    [limite],
  );
  let n = 0;
  for (const { id } of r.rows) {
    await ctx.db.tx(async (q) => {
      const p = await travarPedido(q, id);
      if (p.estado !== 'PRONTO_RETIRADA') return;
      await transitar(q, p, 'NAO_RETIRADO', 'sistema');
      n++;
    });
  }
  return n;
}

export interface EventoPublicado {
  id: string;
  tipo: string;
  payload: Record<string, unknown>;
}

/**
 * Publica o outbox: os consumidores (CRM, log; depois o barramento da seção 5.2)
 * rodam na mesma transação que marca o evento como publicado, então cada evento
 * é tratado uma vez só. Cada evento tem a própria transação: um erro conta uma
 * tentativa e não trava os demais; depois de 10 tentativas o evento fica parado
 * para análise (ultimo_erro).
 */
export async function publicarEventos(
  ctx: Contexto,
  entregar: (e: EventoPublicado, q: Consulta) => Promise<void> | void,
  aoFalhar: (e: EventoPublicado, erro: unknown) => void = () => undefined,
): Promise<number> {
  const r = await ctx.db.query<EventoPublicado>(
    `select id, tipo, payload from evento where publicado_em is null and tentativas < 10 order by seq limit 200`,
  );
  let n = 0;
  for (const e of r.rows) {
    try {
      await ctx.db.tx(async (q) => {
        const ainda = await q.query('select 1 from evento where id = $1 and publicado_em is null for update', [e.id]);
        if (!ainda.rows[0]) return;
        await entregar(e, q);
        await q.query('update evento set publicado_em = now() where id = $1', [e.id]);
        n++;
      });
    } catch (erro) {
      await ctx.db.query('update evento set tentativas = tentativas + 1, ultimo_erro = $2 where id = $1', [e.id, String(erro).slice(0, 1000)]);
      aoFalhar(e, erro);
    }
  }
  return n;
}
