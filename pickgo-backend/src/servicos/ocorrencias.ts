import { randomUUID } from 'node:crypto';
import { ator } from '../auth.ts';
import type { Consulta } from '../db.ts';
import { contas } from '../dominio/dinheiro.ts';
import { REGRA, type Resolucao, type Responsavel, type TipoOcorrencia } from '../dominio/ocorrencias.ts';
import { conflito, invalido, naoEncontrado } from '../erros.ts';
import { auditar, publicar, type Ator } from './registro.ts';

// Ocorrências da seção 3.3.2: toda ocorrência guarda quem, quando, tipo,
// responsável e resolução. O acerto na fatura de repasse vira lançamento novo
// no ledger, nunca alteração de lançamento antigo.

export interface OcorrenciaLinha {
  id: string;
  pedido_id: string;
  item_id: string | null;
  loja_id: string | null;
  tipo: TipoOcorrencia;
  responsavel: Responsavel;
  estado: 'ABERTA' | 'RESOLVIDA';
  descricao: string | null;
  resolucao: Resolucao | null;
  valor_ajuste_centavos: number | null;
  aberta_por: string;
  aberta_em: string;
  resolvida_por: string | null;
  resolvida_em: string | null;
}

const nomeAtor = (a: Ator) => (a === 'sistema' ? 'sistema' : ator(a));

export async function inserirOcorrencia(
  q: Consulta,
  a: Ator,
  o: {
    pedidoId: string;
    itemId?: string | null;
    lojaId: string | null;
    tipo: TipoOcorrencia;
    responsavel?: Responsavel;
    descricao?: string | null;
    /** Resolve na abertura (ex.: ticket encaminhado à loja). */
    resolucao?: Resolucao;
  },
): Promise<OcorrenciaLinha> {
  const responsavel = o.responsavel ?? REGRA[o.tipo].responsavel;
  const r = await q.query<OcorrenciaLinha>(
    `insert into ocorrencia (pedido_id, item_id, loja_id, tipo, responsavel, descricao, aberta_por,
       estado, resolucao, resolvida_por, resolvida_em)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning *`,
    [
      o.pedidoId,
      o.itemId ?? null,
      o.lojaId,
      o.tipo,
      responsavel,
      o.descricao ?? null,
      nomeAtor(a),
      o.resolucao ? 'RESOLVIDA' : 'ABERTA',
      o.resolucao ?? null,
      o.resolucao ? 'sistema' : null,
      o.resolucao ? new Date() : null,
    ],
  );
  const oc = r.rows[0]!;
  await publicar(q, 'OcorrenciaAberta', { ocorrencia_id: oc.id, pedido_id: oc.pedido_id, tipo: oc.tipo, responsavel }, oc.pedido_id);
  if (o.resolucao === 'TICKET_LOJA') {
    // O CRM (Fase 3) consome este evento para abrir o ticket e encaminhar à loja.
    await publicar(q, 'TicketEncaminhadoLoja', { ocorrencia_id: oc.id, pedido_id: oc.pedido_id, loja_id: oc.loja_id }, oc.pedido_id);
  }
  await auditar(q, a, 'ocorrencia.abrir', 'ocorrencia', oc.id, { tipo: oc.tipo, responsavel, pedido_id: oc.pedido_id });
  return oc;
}

/** Fecha a ocorrência de defeito no teste quando o item trocado é aprovado. */
export async function resolverDefeitoTrocado(q: Consulta, itemId: string, a: Ator) {
  const r = await q.query<{ id: string }>(
    `update ocorrencia set estado = 'RESOLVIDA', resolucao = 'TROCA', resolvida_por = $2, resolvida_em = now()
     where item_id = $1 and tipo = 'DEFEITO_TESTE' and estado = 'ABERTA' returning id`,
    [itemId, nomeAtor(a)],
  );
  for (const o of r.rows) await auditar(q, a, 'ocorrencia.resolver', 'ocorrencia', o.id, { resolucao: 'TROCA' });
}

export async function resolverOcorrencia(
  q: Consulta,
  id: string,
  a: Ator,
  d: { resolucao: Resolucao; valorAjuste?: number; responsavel?: Responsavel },
): Promise<OcorrenciaLinha> {
  const r = await q.query<OcorrenciaLinha>('select * from ocorrencia where id = $1 for update', [id]);
  const oc = r.rows[0];
  if (!oc) throw naoEncontrado('ocorrência');
  if (oc.estado !== 'ABERTA') throw conflito('ocorrencia-resolvida', 'ocorrência já resolvida');
  if (oc.tipo === 'DEFEITO_TESTE') {
    throw conflito('resolucao-automatica', 'defeito no teste fecha quando a loja troca o item e o novo teste é aprovado');
  }
  if (!REGRA[oc.tipo].resolucoes.includes(d.resolucao)) {
    throw invalido(`resolução ${d.resolucao} não vale para ${oc.tipo}`, { permitidas: REGRA[oc.tipo].resolucoes });
  }

  let responsavel = oc.responsavel;
  if (responsavel === 'A_DEFINIR') {
    if (!d.responsavel || d.responsavel === 'A_DEFINIR') throw invalido('informe o responsável (LOJA, PORTAL ou LOJA_E_PORTAL)');
    responsavel = d.responsavel;
  }

  let valor: number | null = null;
  if (d.resolucao === 'ACERTO_FATURA') {
    valor = d.valorAjuste ?? 0;
    if (!Number.isInteger(valor) || valor <= 0) throw invalido('acerto na fatura exige valor_ajuste_centavos maior que zero');
    const ped = await q.query<{ subtotal_brl_centavos: number }>('select subtotal_brl_centavos from pedido where id = $1', [oc.pedido_id]);
    if (valor > ped.rows[0]!.subtotal_brl_centavos) throw invalido('o ajuste não pode passar do valor dos produtos do pedido');
    if ((responsavel === 'LOJA' || responsavel === 'LOJA_E_PORTAL') && !oc.loja_id) {
      throw invalido('ocorrência sem loja: não há fatura de repasse para ajustar');
    }
    await lancarAjuste(q, oc, responsavel, valor);
  }

  const atualizada = await q.query<OcorrenciaLinha>(
    `update ocorrencia set estado = 'RESOLVIDA', resolucao = $2, responsavel = $3, valor_ajuste_centavos = $4,
       resolvida_por = $5, resolvida_em = now() where id = $1 returning *`,
    [id, d.resolucao, responsavel, valor, nomeAtor(a)],
  );
  await publicar(q, 'OcorrenciaResolvida', { ocorrencia_id: id, resolucao: d.resolucao, responsavel, valor }, oc.pedido_id);
  await auditar(q, a, 'ocorrencia.resolver', 'ocorrencia', id, { resolucao: d.resolucao, responsavel, valor });
  return atualizada.rows[0]!;
}

/** Debita quem responde pela ocorrência; na divisão loja e Portal, metade de cada (o centavo ímpar fica com a loja). */
async function lancarAjuste(q: Consulta, oc: OcorrenciaLinha, responsavel: Responsavel, valor: number) {
  const pag = await q.query<{ id: string }>(
    `select id from pagamento where pedido_id = $1 and estado = 'CONFIRMADO' order by criado_em desc limit 1`,
    [oc.pedido_id],
  );
  const pagamentoId = pag.rows[0]?.id ?? null;
  const transacao = randomUUID();
  const partes: { conta: string; valor: number }[] =
    responsavel === 'LOJA'
      ? [{ conta: contas.repasseLoja(oc.loja_id!), valor }]
      : responsavel === 'PORTAL'
        ? [{ conta: contas.comissaoPortal, valor }]
        : [
            { conta: contas.repasseLoja(oc.loja_id!), valor: valor - Math.floor(valor / 2) },
            { conta: contas.comissaoPortal, valor: Math.floor(valor / 2) },
          ];
  for (const p of partes.filter((x) => x.valor > 0)) {
    await q.query(
      `insert into lancamento (transacao_id, pagamento_id, ocorrencia_id, loja_id, conta_debito, conta_credito, valor_centavos, tipo)
       values ($1, $2, $3, $4, $5, $6, $7, 'AJUSTE_OCORRENCIA')`,
      [transacao, pagamentoId, oc.id, oc.loja_id, p.conta, contas.ajustesOcorrencias, p.valor],
    );
  }
}
