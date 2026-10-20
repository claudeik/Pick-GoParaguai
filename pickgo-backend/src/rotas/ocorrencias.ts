import { z } from 'zod';
import { ehDaLoja, exigirClienteOu, exigirPermissao } from '../auth.ts';
import { validar, type Modulo } from '../contexto.ts';
import { RESOLUCOES, TIPOS_OCORRENCIA } from '../dominio/ocorrencias.ts';
import { conflito, invalido, naoEncontrado, proibido } from '../erros.ts';
import { inserirOcorrencia, resolverOcorrencia, type OcorrenciaLinha } from '../servicos/ocorrencias.ts';
import { idempotente, travarPedido } from '../servicos/registro.ts';

// RF-15, RF-45 e RF-48 · regra 3.3.2.

const RESPONSAVEIS = ['LOJA', 'PORTAL', 'LOJA_E_PORTAL', 'A_DEFINIR'] as const;

const filtro = z.object({
  pedido_id: z.uuid().optional(),
  estado: z.enum(['ABERTA', 'RESOLVIDA']).optional(),
  limite: z.coerce.number().int().min(1).max(500).default(200),
});

const nova = z.object({
  pedido_id: z.uuid(),
  item_id: z.uuid().optional(),
  tipo: z.enum(TIPOS_OCORRENCIA),
  descricao: z.string().min(1).max(1000),
  responsavel: z.enum(RESPONSAVEIS).optional(),
});

const resolucao = z.object({
  resolucao: z.enum(RESOLUCOES),
  valor_ajuste_centavos: z.number().int().positive().optional(),
  responsavel: z.enum(RESPONSAVEIS).optional(),
});

const PAGOS_NAO_RETIRADOS = ['PAGO', 'EM_SEPARACAO', 'EM_COLETA', 'EM_TESTE_LOJA', 'PRONTO_RETIRADA', 'LIBERADO_SAIDA', 'NAO_RETIRADO'];

export const rotasOcorrencias: Modulo = (app, { db }) => {
  app.get('/v1/ocorrencias', async (req) => {
    const u = exigirClienteOu(req, 'ocorrencias.ver');
    const f = validar(filtro, req.query);
    const cond: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, v: unknown) => {
      params.push(v);
      cond.push(sql.replaceAll('?', `$${params.length}`));
    };
    if (ehDaLoja(u)) add('o.loja_id = ?', u.loja_id);
    if (u.perfil === 'cliente') add('p.cliente_id = ?', u.sub);
    if (f.pedido_id) add('o.pedido_id = ?', f.pedido_id);
    if (f.estado) add('o.estado = ?', f.estado);
    params.push(f.limite);
    const r = await db.query<OcorrenciaLinha & { pedido_codigo: string }>(
      `select o.*, p.codigo as pedido_codigo from ocorrencia o join pedido p on p.id = o.pedido_id
       ${cond.length ? 'where ' + cond.join(' and ') : ''}
       order by (o.estado = 'ABERTA') desc, o.aberta_em desc limit $${params.length}`,
      params,
    );
    return { ocorrencias: r.rows };
  });

  app.post('/v1/ocorrencias', async (req, rep) => {
    const u = exigirClienteOu(req, 'ocorrencias.abrir');
    const d = validar(nova, req.body);
    if (d.tipo === 'DEFEITO_TESTE') throw invalido('defeito no teste é registrado pela loja no teste do item');
    if (u.perfil === 'cliente' && d.tipo !== 'DEFEITO_POS_SAIDA') throw proibido('o cliente só pode relatar defeito depois da retirada');

    const criadas = await db.tx(async (q) => {
      const p = await travarPedido(q, d.pedido_id);
      if (u.perfil === 'cliente' && p.cliente_id !== u.sub) throw naoEncontrado('pedido');
      const itens = (await q.query<{ id: string; loja_id: string }>('select id, loja_id from pedido_item where pedido_id = $1', [p.id])).rows;
      const item = d.item_id ? itens.find((i) => i.id === d.item_id) : undefined;
      if (d.item_id && !item) throw invalido('item não pertence ao pedido');
      const lojas = [...new Set(itens.map((i) => i.loja_id))];

      if (d.tipo === 'DEFEITO_POS_SAIDA') {
        // Depois da saída a garantia é da loja: o ticket vai à loja, sem ônus nem lançamento contra o Portal.
        if (!p.qr_usado_em) throw conflito('antes-da-saida', 'o pedido ainda não saiu; registre como ocorrência da conferência');
        const alvo = item ? [item.loja_id] : lojas;
        const r: OcorrenciaLinha[] = [];
        for (const lojaId of alvo) {
          r.push(
            await inserirOcorrencia(q, u, {
              pedidoId: p.id,
              itemId: item?.id ?? null,
              lojaId,
              tipo: d.tipo,
              descricao: d.descricao,
              resolucao: 'TICKET_LOJA',
            }),
          );
        }
        return r;
      }

      if (!PAGOS_NAO_RETIRADOS.includes(p.estado) && d.tipo !== 'DIVERGENCIA_SAIDA') {
        throw conflito('estado-invalido', `pedido em ${p.estado} não aceita esta ocorrência`);
      }
      if (p.qr_usado_em) throw conflito('depois-da-saida', 'o pedido já saiu; depois da saída vale o defeito pós-saída (ticket da loja)');
      const lojaId = item?.loja_id ?? (lojas.length === 1 ? lojas[0]! : null);
      if (!lojaId && d.tipo !== 'DIVERGENCIA_SAIDA') throw invalido('pedido com várias lojas: informe o item');
      return [
        await inserirOcorrencia(q, u, {
          pedidoId: p.id,
          itemId: item?.id ?? null,
          lojaId,
          tipo: d.tipo,
          descricao: d.descricao,
          responsavel: d.tipo === 'DIVERGENCIA_SAIDA' ? (d.responsavel ?? 'A_DEFINIR') : undefined,
        }),
      ];
    });
    return rep.code(201).send({ ...criadas[0], ocorrencias: criadas });
  });

  app.post<{ Params: { id: string } }>('/v1/ocorrencias/:id/resolver', async (req) => {
    const u = exigirPermissao(req, 'ocorrencias.resolver');
    const d = validar(resolucao, req.body);
    const id = z.uuid().parse(req.params.id);
    const r = await idempotente(db, `ocorrencia:${u.sub}`, req.headers['idempotency-key'] as string, async (q) => ({
      status: 200,
      corpo: await resolverOcorrencia(q, id, u, {
        resolucao: d.resolucao,
        valorAjuste: d.valor_ajuste_centavos,
        responsavel: d.responsavel,
      }),
    }));
    return r.corpo;
  });
};
