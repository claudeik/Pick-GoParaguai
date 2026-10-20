import type { Consulta } from '../db.ts';
import { conflito, invalido, naoEncontrado } from '../erros.ts';

// Controle de estoque do Portal Paraguai (ERP): saldo por item e depósito,
// custo médio ponderado (por item, em guaranis, sem IVA recuperável) e
// movimentações imutáveis: correção é sempre um movimento novo.

export type TipoMovimento =
  | 'ENTRADA_COMPRA'
  | 'SAIDA_VENDA'
  | 'DEVOLUCAO_VENDA'
  | 'ESTORNO_COMPRA'
  | 'AJUSTE_ENTRADA'
  | 'AJUSTE_SAIDA'
  | 'CONSUMO_INTERNO'
  | 'TRANSFERENCIA_SAIDA'
  | 'TRANSFERENCIA_ENTRADA'
  | 'INVENTARIO';

/** Entradas que trazem custo próprio e mexem no custo médio. */
const ENTRADA_COM_CUSTO = new Set<TipoMovimento>(['ENTRADA_COMPRA', 'AJUSTE_ENTRADA']);

const q3 = (x: number) => Math.round(x * 1000) / 1000;
const q4 = (x: number) => Math.round(x * 10_000) / 10_000;

interface ItemLinha {
  id: string;
  codigo: string;
  descricao: string;
  controla_estoque: boolean;
  custo_medio_pyg: number;
  ativo: boolean;
}

export interface Movimento {
  itemId: string;
  depositoId: string;
  tipo: TipoMovimento;
  /** Positiva entra, negativa sai. */
  quantidade: number;
  /** Custo unitário em guaranis: obrigatório nas entradas com custo e no estorno de compra. */
  custoUnitarioPyg?: number;
  documentoTipo?: string;
  documentoId?: string;
  observacao?: string;
  autor: string;
}

export async function movimentar(q: Consulta, m: Movimento) {
  const qtd = q3(m.quantidade);
  if (!qtd) throw invalido('quantidade zero');
  const item = (await q.query<ItemLinha>('select * from erp_item where id = $1 for update', [m.itemId])).rows[0];
  if (!item) throw naoEncontrado('item');
  if (!item.controla_estoque) throw invalido(`${item.descricao} não controla estoque`);
  const dep = await q.query('select 1 from erp_deposito where id = $1 and ativo', [m.depositoId]);
  if (!dep.rows[0]) throw naoEncontrado('depósito');

  await q.query('insert into erp_saldo (item_id, deposito_id) values ($1, $2) on conflict do nothing', [m.itemId, m.depositoId]);
  const saldo = (await q.query<{ quantidade: number }>('select quantidade from erp_saldo where item_id = $1 and deposito_id = $2 for update', [m.itemId, m.depositoId])).rows[0]!.quantidade;
  const novoSaldo = q3(saldo + qtd);
  if (novoSaldo < 0) {
    throw conflito('estoque-insuficiente', `${item.descricao}: saldo ${saldo} no depósito, saída de ${-qtd}`, { item: item.codigo, saldo });
  }

  // Custo médio considera o item em todos os depósitos.
  const totalItem = (await q.query<{ n: number }>('select coalesce(sum(quantidade), 0)::float8 as n from erp_saldo where item_id = $1', [m.itemId])).rows[0]!.n;
  let medio = Number(item.custo_medio_pyg);
  let custo = medio;
  if (ENTRADA_COM_CUSTO.has(m.tipo) && qtd > 0) {
    if (m.custoUnitarioPyg === undefined || m.custoUnitarioPyg < 0) throw invalido('informe o custo unitário da entrada');
    custo = m.custoUnitarioPyg;
    medio = totalItem + qtd > 0 ? (totalItem * medio + qtd * custo) / (totalItem + qtd) : custo;
  } else if (m.tipo === 'ESTORNO_COMPRA') {
    // Desfaz a entrada pelo custo dela.
    custo = m.custoUnitarioPyg ?? medio;
    const resto = totalItem + qtd;
    medio = resto > 0 ? Math.max(0, (totalItem * medio + qtd * custo) / resto) : medio;
  }
  medio = q4(medio);

  await q.query('update erp_saldo set quantidade = $3 where item_id = $1 and deposito_id = $2', [m.itemId, m.depositoId, novoSaldo]);
  if (medio !== Number(item.custo_medio_pyg)) await q.query('update erp_item set custo_medio_pyg = $2 where id = $1', [m.itemId, medio]);
  const r = await q.query<{ id: string }>(
    `insert into erp_movimento (item_id, deposito_id, tipo, quantidade, custo_unitario_pyg, saldo_apos, custo_medio_apos, documento_tipo, documento_id, observacao, autor)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning *`,
    [m.itemId, m.depositoId, m.tipo, qtd, q4(custo), novoSaldo, medio, m.documentoTipo ?? null, m.documentoId ?? null, m.observacao ?? null, m.autor],
  );
  return r.rows[0]!;
}

export async function transferir(q: Consulta, d: { itemId: string; origemId: string; destinoId: string; quantidade: number; observacao?: string; autor: string }) {
  if (d.origemId === d.destinoId) throw invalido('origem e destino iguais');
  if (d.quantidade <= 0) throw invalido('quantidade precisa ser positiva');
  const saida = await movimentar(q, { itemId: d.itemId, depositoId: d.origemId, tipo: 'TRANSFERENCIA_SAIDA', quantidade: -d.quantidade, observacao: d.observacao, autor: d.autor });
  const entrada = await movimentar(q, {
    itemId: d.itemId,
    depositoId: d.destinoId,
    tipo: 'TRANSFERENCIA_ENTRADA',
    quantidade: d.quantidade,
    documentoTipo: 'transferencia',
    documentoId: (saida as { id: string }).id,
    observacao: d.observacao,
    autor: d.autor,
  });
  return { saida, entrada };
}

/** Abre a contagem: fotografa o saldo de todos os itens com estoque no depósito. */
export async function abrirInventario(q: Consulta, depositoId: string, autor: string, observacao?: string) {
  const dep = await q.query('select 1 from erp_deposito where id = $1 and ativo', [depositoId]);
  if (!dep.rows[0]) throw naoEncontrado('depósito');
  const aberto = await q.query(`select 1 from erp_inventario where deposito_id = $1 and estado = 'ABERTO'`, [depositoId]);
  if (aberto.rows[0]) throw conflito('inventario-aberto', 'já há um inventário aberto neste depósito');
  const inv = (await q.query<{ id: string }>('insert into erp_inventario (deposito_id, aberto_por, observacao) values ($1, $2, $3) returning *', [depositoId, autor, observacao ?? null])).rows[0]!;
  await q.query(
    `insert into erp_inventario_item (inventario_id, item_id, quantidade_sistema)
     select $1, i.id, coalesce(s.quantidade, 0) from erp_item i
     left join erp_saldo s on s.item_id = i.id and s.deposito_id = $2
     where i.controla_estoque and i.ativo`,
    [inv.id, depositoId],
  );
  return inv;
}

/** Fecha a contagem: cada diferença vira um movimento de INVENTARIO pelo custo médio. */
export async function fecharInventario(q: Consulta, id: string, autor: string) {
  const inv = (await q.query<{ id: string; deposito_id: string; estado: string }>('select * from erp_inventario where id = $1 for update', [id])).rows[0];
  if (!inv) throw naoEncontrado('inventário');
  if (inv.estado !== 'ABERTO') throw conflito('inventario-fechado', 'inventário já fechado');
  const itens = (
    await q.query<{ item_id: string; quantidade_sistema: number; quantidade_contada: number | null }>('select * from erp_inventario_item where inventario_id = $1', [id])
  ).rows;
  let ajustes = 0;
  for (const i of itens) {
    if (i.quantidade_contada === null) continue; // não contado: não mexe
    const diferenca = q3(Number(i.quantidade_contada) - Number(i.quantidade_sistema));
    if (!diferenca) continue;
    await movimentar(q, { itemId: i.item_id, depositoId: inv.deposito_id, tipo: 'INVENTARIO', quantidade: diferenca, documentoTipo: 'inventario', documentoId: id, observacao: 'diferença de contagem', autor });
    ajustes++;
  }
  await q.query(`update erp_inventario set estado = 'FECHADO', fechado_por = $2, fechado_em = now() where id = $1`, [id, autor]);
  return { ajustes, contados: itens.filter((i) => i.quantidade_contada !== null).length, total: itens.length };
}
