import { randomUUID } from 'node:crypto';
import type { Consulta } from '../db.ts';
import type { Config } from '../config.ts';
import { calcularSplit, contas, type ParteDoSplit } from '../dominio/dinheiro.ts';
import { conflito } from '../erros.ts';
import { auditar, publicar, transitar, travarPedido, type Ator } from './registro.ts';

interface PagamentoLinha {
  id: string;
  pedido_id: string;
  txid: string;
  estado: string;
  valor_brl_centavos: number;
  end_to_end_id: string | null;
}

export type ResultadoConfirmacao =
  | 'confirmado'
  | 'ja_processado'
  | 'desconhecido'
  | 'valor_divergente'
  | 'fora_do_prazo';

/** Grava o split como lançamentos de dupla entrada debitando os recebimentos do Pix. */
async function lancarSplit(q: Consulta, pagamentoId: string, partes: ParteDoSplit[]) {
  const transacao = randomUUID();
  for (const p of partes) {
    await q.query(
      `insert into lancamento (transacao_id, pagamento_id, loja_id, conta_debito, conta_credito, valor_centavos, tipo)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [transacao, pagamentoId, p.lojaId, contas.pixRecebimentos, p.conta, p.valor, p.tipo],
    );
  }
  return transacao;
}

/**
 * Processa um Pix recebido. Idempotente: o mesmo txid confirmado duas vezes
 * gera um único conjunto de lançamentos (critério de aceite 14.2).
 */
export async function confirmarPix(
  q: Consulta,
  cfg: Config,
  pix: { txid: string; endToEndId: string; valorCentavos: number },
): Promise<ResultadoConfirmacao> {
  const r = await q.query<PagamentoLinha>('select * from pagamento where txid = $1 for update', [pix.txid]);
  const pag = r.rows[0];
  if (!pag) {
    await auditar(q, 'sistema', 'pix.txid_desconhecido', 'pagamento', pix.txid, pix);
    return 'desconhecido';
  }
  if (pag.estado === 'CONFIRMADO' || pag.estado === 'RECEBIDO_FORA_DO_PRAZO' || pag.estado === 'ESTORNADO') {
    return 'ja_processado';
  }
  if (pix.valorCentavos !== pag.valor_brl_centavos) {
    await auditar(q, 'sistema', 'pix.valor_divergente', 'pagamento', pag.id, {
      esperado: pag.valor_brl_centavos,
      recebido: pix.valorCentavos,
    });
    await publicar(q, 'PagamentoFalhou', { pagamento_id: pag.id, motivo: 'valor_divergente' }, pag.pedido_id);
    return 'valor_divergente';
  }

  const pedido = await travarPedido(q, pag.pedido_id);

  // Pix chegou depois de a cobrança expirar: o dinheiro entrou e precisa ser devolvido.
  if (pag.estado === 'EXPIRADO' || pedido.estado !== 'AGUARDANDO_PIX') {
    await q.query(
      `update pagamento set estado = 'RECEBIDO_FORA_DO_PRAZO', end_to_end_id = $2, confirmado_em = now() where id = $1`,
      [pag.id, pix.endToEndId],
    );
    await lancarSplit(q, pag.id, [
      { conta: contas.estornosAPagar, valor: pix.valorCentavos, tipo: 'RECEBIDO_FORA_DO_PRAZO', lojaId: null },
    ]);
    await publicar(q, 'PagamentoForaDoPrazo', { pagamento_id: pag.id, pedido_id: pedido.id }, pedido.id);
    await auditar(q, 'sistema', 'pix.fora_do_prazo', 'pagamento', pag.id, { pedido_estado: pedido.estado });
    return 'fora_do_prazo';
  }

  await q.query(`update pagamento set estado = 'CONFIRMADO', end_to_end_id = $2, confirmado_em = now() where id = $1`, [
    pag.id,
    pix.endToEndId,
  ]);

  const itens = await q.query<{ loja_id: string; total: number }>(
    'select loja_id, sum(subtotal_brl_centavos) as total from pedido_item where pedido_id = $1 group by loja_id',
    [pedido.id],
  );
  const porLoja = new Map(itens.rows.map((i) => [i.loja_id, i.total]));
  const totais = {
    subtotal: pedido.subtotal_brl_centavos as number,
    taxaPix: pedido.taxa_pix_brl_centavos as number,
    taxaCambio: pedido.taxa_cambio_brl_centavos as number,
    total: pedido.total_brl_centavos as number,
  };
  const partes = calcularSplit(porLoja, totais, cfg);
  const soma = partes.reduce((s, p) => s + p.valor, 0);
  if (soma !== pag.valor_brl_centavos) {
    throw new Error(`split de ${soma} não fecha com o pagamento de ${pag.valor_brl_centavos}`);
  }
  const transacao = await lancarSplit(q, pag.id, partes);
  await publicar(q, 'SplitLiquidado', { pagamento_id: pag.id, transacao_id: transacao, partes }, pedido.id);
  await lancarSubsidios(q, pag.id, pedido.id, transacao);

  const pago = await transitar(q, pedido, 'PAGO', 'sistema');
  if (pago.modo === 'SCAN_GO') await transitar(q, pago, 'LIBERADO_SAIDA', 'sistema');
  else if (pago.modo === 'RETIRADA_PORTAL' || pago.modo === 'RETIRADA_LOJA') {
    await transitar(q, pago, 'EM_SEPARACAO', 'sistema');
  }
  return 'confirmado';
}

/**
 * Desconto de campanha pago pelo Portal (RF-29): o cliente pagou o preço da oferta,
 * e o Portal completa o repasse da loja com a parte dele do desconto. Na divisão,
 * metade de cada (o centavo ímpar fica com a loja). Desconto da loja não gera lançamento.
 */
async function lancarSubsidios(q: Consulta, pagamentoId: string, pedidoId: string, transacao: string) {
  const r = await q.query<{ loja_id: string; pagador_desconto: string; desconto: number }>(
    `select loja_id, pagador_desconto, sum(desconto_brl_centavos)::bigint as desconto from pedido_item
     where pedido_id = $1 and desconto_brl_centavos > 0 and pagador_desconto in ('PORTAL', 'DIVIDIDO') group by loja_id, pagador_desconto`,
    [pedidoId],
  );
  for (const d of r.rows) {
    const valor = d.pagador_desconto === 'PORTAL' ? d.desconto : Math.floor(d.desconto / 2);
    if (valor <= 0) continue;
    await q.query(
      `insert into lancamento (transacao_id, pagamento_id, loja_id, conta_debito, conta_credito, valor_centavos, tipo)
       values ($1, $2, $3, $4, $5, $6, 'SUBSIDIO_CAMPANHA')`,
      [transacao, pagamentoId, d.loja_id, contas.campanhasPortal, contas.repasseLoja(d.loja_id), valor],
    );
  }
}

/** Estorno total: lançamentos inversos, nunca alteração dos antigos. */
export async function estornarPagamento(q: Consulta, pagamentoId: string, a: Ator) {
  const r = await q.query<PagamentoLinha>('select * from pagamento where id = $1 for update', [pagamentoId]);
  const pag = r.rows[0];
  if (!pag) return null;
  if (pag.estado !== 'CONFIRMADO') {
    throw conflito('pagamento-nao-estornavel', `pagamento em ${pag.estado} não pode ser estornado`);
  }
  const pedido = await travarPedido(q, pag.pedido_id);
  // A máquina de estados decide se o pedido pode ser reembolsado (PAGO ou RETIRADO).
  const reembolsado = await transitar(q, pedido, 'REEMBOLSADO', a);

  const linhas = await q.query<{ loja_id: string | null; conta_credito: string; valor_centavos: number; tipo: string }>(
    `select loja_id, conta_credito, valor_centavos, tipo from lancamento
     where pagamento_id = $1 and conta_debito = $2`,
    [pag.id, contas.pixRecebimentos],
  );
  const transacao = randomUUID();
  for (const l of linhas.rows) {
    await q.query(
      `insert into lancamento (transacao_id, pagamento_id, loja_id, conta_debito, conta_credito, valor_centavos, tipo)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [transacao, pag.id, l.loja_id, l.conta_credito, contas.estornosAPagar, l.valor_centavos, `ESTORNO_${l.tipo}`],
    );
  }
  // O subsídio de campanha volta para o Portal.
  const subsidios = await q.query<{ loja_id: string; conta_debito: string; conta_credito: string; valor_centavos: number }>(
    `select loja_id, conta_debito, conta_credito, valor_centavos from lancamento where pagamento_id = $1 and tipo = 'SUBSIDIO_CAMPANHA'`,
    [pag.id],
  );
  for (const l of subsidios.rows) {
    await q.query(
      `insert into lancamento (transacao_id, pagamento_id, loja_id, conta_debito, conta_credito, valor_centavos, tipo)
       values ($1, $2, $3, $4, $5, $6, 'ESTORNO_SUBSIDIO_CAMPANHA')`,
      [transacao, pag.id, l.loja_id, l.conta_credito, l.conta_debito, l.valor_centavos],
    );
  }
  await q.query(`update pagamento set estado = 'ESTORNADO' where id = $1`, [pag.id]);
  await devolverEstoque(q, pedido.id);
  await publicar(q, 'PagamentoEstornado', { pagamento_id: pag.id, valor: pag.valor_brl_centavos }, pedido.id);
  await auditar(q, a, 'pagamento.estorno', 'pagamento', pag.id, { valor: pag.valor_brl_centavos });
  return { pedido: reembolsado, transacao_id: transacao };
}

/** Devolve o estoque do produto e as unidades da oferta usadas pelo pedido. */
export async function devolverEstoque(q: Consulta, pedidoId: string) {
  await q.query(
    `update oferta o set quantidade_restante = o.quantidade_restante + u.qtd
     from (select oferta_id, sum(quantidade) as qtd from oferta_uso where pedido_id = $1 and not devolvido group by oferta_id) u
     where o.id = u.oferta_id`,
    [pedidoId],
  );
  await q.query('update oferta_uso set devolvido = true where pedido_id = $1', [pedidoId]);
  await q.query(
    `update produto p set estoque = p.estoque + i.qtd, atualizado_em = now()
     from (select produto_id, sum(quantidade) as qtd from pedido_item where pedido_id = $1 group by produto_id) i
     where p.id = i.produto_id`,
    [pedidoId],
  );
}
