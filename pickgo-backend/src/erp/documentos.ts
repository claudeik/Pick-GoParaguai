import { z } from 'zod';
import type { Config } from '../config.ts';
import type { Consulta } from '../db.ts';
import { conflito, invalido, naoEncontrado } from '../erros.ts';
import { movimentar } from './estoque.ts';
import { emPyg, ivaIncluido, numeroFormatado, totaisFiscais, totalLinha, type Iva } from './fiscal.ts';
import { baixar, cancelarTitulosDe, criarTitulos, parcelasIguais, type MeioBaixa } from './financeiro.ts';

// Documentos do ERP: compra (entrada de produtos), fatura e nota de crédito do
// Portal, anulação e faturas de comissão das lojas.

const data = z.iso.date();
const MEIOS = ['TRANSFERENCIA', 'EFECTIVO', 'CHEQUE', 'PIX', 'TARJETA'] as const;

const linha = z.object({
  item_id: z.uuid().optional(),
  descricao: z.string().trim().min(2).max(200).optional(),
  quantidade: z.number().positive().max(1_000_000),
  /** Preço unitário com IVA, na unidade mínima da moeda. */
  preco_unitario: z.number().int().min(0),
  iva: z.enum(['10', '5', 'EXENTO']).optional(),
});

const pagamento = z.object({
  condicao: z.enum(['CONTADO', 'CREDITO']),
  /** À vista: como foi pago. */
  meio: z.enum(MEIOS).default('TRANSFERENCIA'),
  /** A prazo: número de parcelas, primeiro vencimento e intervalo. */
  parcelas: z.number().int().min(1).max(60).default(1),
  primeiro_vencimento: data.optional(),
  intervalo_dias: z.number().int().min(1).max(365).default(30),
});

export const novaCompra = pagamento.extend({
  fornecedor_id: z.uuid(),
  timbrado: z.string().regex(/^\d{8}$/, 'timbrado com 8 dígitos'),
  numero: z.string().regex(/^\d{3}-\d{3}-\d{7}$/, 'número no formato 001-001-0000123'),
  data,
  moeda: z.enum(['PYG', 'USD']).default('PYG'),
  tipo_cambio: z.number().int().positive().default(1),
  deposito_id: z.uuid().optional(),
  itens: z.array(linha.extend({ item_id: z.uuid() })).min(1).max(200),
  observacao: z.string().max(1000).optional(),
});

export const novaFatura = pagamento.extend({
  terceiro_id: z.uuid(),
  data,
  moeda: z.enum(['PYG', 'USD']).default('PYG'),
  tipo_cambio: z.number().int().positive().default(1),
  deposito_id: z.uuid().optional(),
  itens: z.array(linha).min(1).max(200),
  observacao: z.string().max(1000).optional(),
});

interface ItemErp {
  id: string;
  descricao: string;
  iva: Iva;
  tipo: string;
  controla_estoque: boolean;
  ativo: boolean;
}

async function itensDe(q: Consulta, ids: string[]) {
  const r = await q.query<ItemErp>('select * from erp_item where id = any($1::uuid[])', [ids]);
  return new Map(r.rows.map((i) => [i.id, i]));
}

function vencimentos(d: z.infer<typeof pagamento>, dataDoc: string, total: number) {
  if (d.condicao === 'CONTADO') return [{ vencimento: dataDoc, valor: total }];
  return parcelasIguais(total, d.parcelas, d.primeiro_vencimento ?? dataDoc, d.intervalo_dias);
}

const somarDias = (dataDoc: string, dias: number) => {
  const x = new Date(`${dataDoc}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + dias);
  return x.toISOString().slice(0, 10);
};

/** Compra do fornecedor: estoque pelo custo sem IVA, contas a pagar e livro de compras. */
export async function registrarCompra(q: Consulta, d: z.infer<typeof novaCompra>, autor: string) {
  const f = (await q.query<{ fornecedor: boolean; ativo: boolean }>('select fornecedor, ativo from erp_terceiro where id = $1', [d.fornecedor_id])).rows[0];
  if (!f?.fornecedor || !f.ativo) throw invalido('fornecedor inexistente, inativo ou não marcado como fornecedor');
  if (d.moeda === 'PYG' && d.tipo_cambio !== 1) throw invalido('em guaranis o tipo de câmbio é 1');
  if (d.moeda === 'USD' && d.tipo_cambio < 1000) throw invalido('informe o tipo de câmbio em guaranis por dólar');
  const itens = await itensDe(q, d.itens.map((i) => i.item_id));
  const linhas = d.itens.map((l) => {
    const item = itens.get(l.item_id!);
    if (!item || !item.ativo) throw invalido('item inexistente ou inativo');
    if (item.tipo === 'SERVICO' && !Number.isInteger(l.quantidade)) throw invalido('serviço com quantidade inteira');
    const iva = (l.iva ?? item.iva) as Iva;
    return { ...l, item, iva, descricao: l.descricao ?? item.descricao, total: totalLinha(l.quantidade, l.preco_unitario) };
  });
  if (linhas.some((l) => l.item.controla_estoque) && !d.deposito_id) throw invalido('informe o depósito de entrada');
  const t = totaisFiscais(linhas);
  if (t.total <= 0) throw invalido('compra sem valor');

  const repetida = await q.query(`select 1 from erp_compra where fornecedor_id = $1 and timbrado = $2 and numero = $3`, [d.fornecedor_id, d.timbrado, d.numero]);
  if (repetida.rows[0]) throw conflito('compra-repetida', 'esta fatura do fornecedor já foi registrada');
  const c = (
    await q.query<{ id: string }>(
      `insert into erp_compra (fornecedor_id, timbrado, numero, data, condicao, moeda, tipo_cambio, deposito_id, total_10, iva_10, total_5, iva_5, exento, total, observacao, autor)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) returning *`,
      [d.fornecedor_id, d.timbrado, d.numero, d.data, d.condicao, d.moeda, d.tipo_cambio, d.deposito_id ?? null, t.total_10, t.iva_10, t.total_5, t.iva_5, t.exento, t.total, d.observacao ?? null, autor],
    )
  ).rows[0]!;
  for (const l of linhas) {
    await q.query(
      'insert into erp_compra_item (compra_id, item_id, descricao, quantidade, preco_unitario, iva, total) values ($1, $2, $3, $4, $5, $6, $7)',
      [c.id, l.item.id, l.descricao, l.quantidade, l.preco_unitario, l.iva, l.total],
    );
    if (l.item.controla_estoque) {
      // Custo sem o IVA, que é crédito fiscal do Portal.
      const custo = emPyg(l.total - ivaIncluido(l.total, l.iva), d.moeda, d.tipo_cambio) / l.quantidade;
      await movimentar(q, { itemId: l.item.id, depositoId: d.deposito_id!, tipo: 'ENTRADA_COMPRA', quantidade: l.quantidade, custoUnitarioPyg: custo, documentoTipo: 'compra', documentoId: c.id, autor });
    }
  }
  const ids = await criarTitulos(q, {
    tipo: 'PAGAR',
    terceiroId: d.fornecedor_id,
    compraId: c.id,
    descricao: `Compra ${d.numero}`,
    emissao: d.data,
    moeda: d.moeda,
    parcelas: vencimentos(d, d.data, t.total),
  });
  if (d.condicao === 'CONTADO') await baixar(q, ids[0]!, { data: d.data, valor: t.total, meio: d.meio, automatica: true }, autor);
  return c;
}

export async function anularCompra(q: Consulta, id: string, autor: string) {
  const c = (await q.query<{ id: string; estado: string; deposito_id: string | null }>('select * from erp_compra where id = $1 for update', [id])).rows[0];
  if (!c) throw naoEncontrado('compra');
  if (c.estado === 'ANULADA') throw conflito('compra-anulada', 'compra já anulada');
  await cancelarTitulosDe(q, 'compra_id', id);
  // Tira do estoque o que entrou, pelo custo da entrada (falha se já foi consumido).
  const entradas = (await q.query<{ item_id: string; deposito_id: string; quantidade: number; custo_unitario_pyg: number }>(
    `select item_id, deposito_id, quantidade, custo_unitario_pyg from erp_movimento where documento_tipo = 'compra' and documento_id = $1 and tipo = 'ENTRADA_COMPRA'`,
    [id],
  )).rows;
  for (const e of entradas) {
    await movimentar(q, { itemId: e.item_id, depositoId: e.deposito_id, tipo: 'ESTORNO_COMPRA', quantidade: -Number(e.quantidade), custoUnitarioPyg: Number(e.custo_unitario_pyg), documentoTipo: 'compra', documentoId: id, observacao: 'anulação da compra', autor });
  }
  await q.query(`update erp_compra set estado = 'ANULADA' where id = $1`, [id]);
}

interface Empresa {
  timbrado: string;
  timbrado_inicio: string;
  timbrado_fim: string;
  estabelecimento: string;
  ponto_expedicao: string;
  proximo_numero: number;
  proximo_numero_nc: number;
}

const iso = (x: unknown) => (x instanceof Date ? x.toISOString().slice(0, 10) : String(x).slice(0, 10));

/** Reserva o próximo número do timbrado (FACTURA ou NOTA_CREDITO), conferindo a vigência. */
async function proximoNumero(q: Consulta, tipo: 'FACTURA' | 'NOTA_CREDITO', dataDoc: string) {
  const e = (await q.query<Empresa>('select * from erp_empresa where id = 1 for update')).rows[0];
  if (!e) throw conflito('empresa-sem-timbrado', 'cadastre os dados da empresa e o timbrado antes de faturar');
  if (dataDoc < iso(e.timbrado_inicio) || dataDoc > iso(e.timbrado_fim)) throw conflito('timbrado-vencido', `a data ${dataDoc} está fora da vigência do timbrado ${e.timbrado}`);
  const numero = tipo === 'FACTURA' ? e.proximo_numero : e.proximo_numero_nc;
  if (numero > 9_999_999) throw conflito('numeracao-esgotada', 'numeração do ponto de expedição esgotada');
  await q.query(`update erp_empresa set ${tipo === 'FACTURA' ? 'proximo_numero' : 'proximo_numero_nc'} = $1 where id = 1`, [numero + 1]);
  return { ...e, numero, formatado: numeroFormatado(e.estabelecimento, e.ponto_expedicao, numero) };
}

/** Fatura do Portal: numeração do timbrado, saída de estoque, contas a receber e livro de vendas. */
export async function emitirFatura(
  q: Consulta,
  d: z.infer<typeof novaFatura>,
  autor: string,
  extra: { origem?: 'MANUAL' | 'COMISSAO'; periodo?: string; meioAutomatico?: MeioBaixa } = {},
) {
  const c = (await q.query<{ cliente: boolean; ativo: boolean; razao_social: string }>('select cliente, ativo, razao_social from erp_terceiro where id = $1', [d.terceiro_id])).rows[0];
  if (!c?.cliente || !c.ativo) throw invalido('cliente inexistente, inativo ou não marcado como cliente');
  if (d.moeda === 'PYG' && d.tipo_cambio !== 1) throw invalido('em guaranis o tipo de câmbio é 1');
  if (d.moeda === 'USD' && d.tipo_cambio < 1000) throw invalido('informe o tipo de câmbio em guaranis por dólar');
  const itens = await itensDe(q, d.itens.filter((i) => i.item_id).map((i) => i.item_id!));
  const linhas = d.itens.map((l) => {
    const item = l.item_id ? itens.get(l.item_id) : undefined;
    if (l.item_id && (!item || !item.ativo)) throw invalido('item inexistente ou inativo');
    const descricao = l.descricao ?? item?.descricao;
    if (!descricao) throw invalido('linha sem item precisa de descrição');
    const iva = (l.iva ?? item?.iva ?? '10') as Iva;
    return { ...l, item, iva, descricao, total: totalLinha(l.quantidade, l.preco_unitario) };
  });
  if (linhas.some((l) => l.item?.controla_estoque) && !d.deposito_id) throw invalido('informe o depósito de saída');
  const t = totaisFiscais(linhas);
  if (t.total <= 0) throw invalido('fatura sem valor');
  const n = await proximoNumero(q, 'FACTURA', d.data);
  const f = (
    await q.query<{ id: string; numero_formatado: string }>(
      `insert into erp_fatura (tipo, terceiro_id, timbrado, estabelecimento, ponto_expedicao, numero, numero_formatado, data, condicao, moeda, tipo_cambio, deposito_id,
         total_10, iva_10, total_5, iva_5, exento, total, origem, periodo, observacao, autor)
       values ('FACTURA', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21) returning *`,
      [d.terceiro_id, n.timbrado, n.estabelecimento, n.ponto_expedicao, n.numero, n.formatado, d.data, d.condicao, d.moeda, d.tipo_cambio, d.deposito_id ?? null,
        t.total_10, t.iva_10, t.total_5, t.iva_5, t.exento, t.total, extra.origem ?? 'MANUAL', extra.periodo ?? null, d.observacao ?? null, autor],
    )
  ).rows[0]!;
  for (const l of linhas) {
    await q.query(
      'insert into erp_fatura_item (fatura_id, item_id, descricao, quantidade, preco_unitario, iva, total) values ($1, $2, $3, $4, $5, $6, $7)',
      [f.id, l.item?.id ?? null, l.descricao, l.quantidade, l.preco_unitario, l.iva, l.total],
    );
    if (l.item?.controla_estoque) {
      await movimentar(q, { itemId: l.item.id, depositoId: d.deposito_id!, tipo: 'SAIDA_VENDA', quantidade: -l.quantidade, documentoTipo: 'fatura', documentoId: f.id, autor });
    }
  }
  const ids = await criarTitulos(q, { tipo: 'RECEBER', terceiroId: d.terceiro_id, faturaId: f.id, descricao: `Fatura ${n.formatado}`, emissao: d.data, moeda: d.moeda, parcelas: vencimentos(d, d.data, t.total) });
  if (d.condicao === 'CONTADO') await baixar(q, ids[0]!, { data: d.data, valor: t.total, meio: extra.meioAutomatico ?? d.meio, automatica: true }, autor);
  return f;
}

export async function anularFatura(q: Consulta, id: string, autor: string) {
  const f = (await q.query<{ id: string; estado: string; tipo: string }>('select * from erp_fatura where id = $1 for update', [id])).rows[0];
  if (!f) throw naoEncontrado('fatura');
  if (f.estado === 'ANULADA') throw conflito('fatura-anulada', 'documento já anulado');
  if (f.tipo === 'NOTA_CREDITO') throw conflito('nota-credito-nao-anula', 'nota de crédito não se anula nesta versão; emita uma nova fatura se precisar');
  const nc = await q.query(`select 1 from erp_fatura where fatura_origem_id = $1 and estado = 'EMITIDA'`, [id]);
  if (nc.rows[0]) throw conflito('fatura-com-nota', 'há nota de crédito sobre esta fatura; anule a nota antes');
  await cancelarTitulosDe(q, 'fatura_id', id);
  // Mercadoria volta ao estoque; o número não é reaproveitado.
  const saidas = (await q.query<{ item_id: string; deposito_id: string; quantidade: number; tipo: string }>(
    `select item_id, deposito_id, quantidade, tipo from erp_movimento where documento_tipo = 'fatura' and documento_id = $1`,
    [id],
  )).rows;
  for (const s of saidas) {
    await movimentar(q, { itemId: s.item_id, depositoId: s.deposito_id, tipo: s.tipo === 'SAIDA_VENDA' ? 'DEVOLUCAO_VENDA' : 'AJUSTE_SAIDA', quantidade: -Number(s.quantidade), documentoTipo: 'fatura', documentoId: id, observacao: 'anulação', autor });
  }
  await q.query(`update erp_fatura set estado = 'ANULADA' where id = $1`, [id]);
}

export const novaNotaCredito = z.object({
  data,
  motivo: z.string().trim().min(3).max(300),
  /** Linhas da fatura devolvidas (quantidade); sem linhas, a nota é do valor total restante. */
  itens: z.array(z.object({ fatura_item_id: z.uuid(), quantidade: z.number().positive() })).max(200).optional(),
  devolver_estoque: z.boolean().default(true),
});

/** Nota de crédito sobre fatura: abate o que falta receber; se já foi recebido, vira valor a devolver. */
export async function emitirNotaCredito(q: Consulta, faturaId: string, d: z.infer<typeof novaNotaCredito>, autor: string) {
  const f = (await q.query<{ id: string; tipo: string; estado: string; terceiro_id: string; moeda: 'PYG' | 'USD'; tipo_cambio: number; deposito_id: string | null; numero_formatado: string; total: number }>('select * from erp_fatura where id = $1 for update', [faturaId])).rows[0];
  if (!f || f.tipo !== 'FACTURA') throw naoEncontrado('fatura');
  if (f.estado !== 'EMITIDA') throw conflito('fatura-anulada', 'fatura anulada');
  const itensFatura = (await q.query<{ id: string; item_id: string | null; descricao: string; quantidade: number; preco_unitario: number; iva: Iva; total: number }>('select * from erp_fatura_item where fatura_id = $1', [faturaId])).rows;
  const jaCreditado = (await q.query<{ origem: string; quantidade: number }>(
    `select fi.item_origem_id as origem, sum(fi.quantidade)::float8 as quantidade from erp_fatura n join erp_fatura_item fi on fi.fatura_id = n.id
     where n.fatura_origem_id = $1 and n.estado = 'EMITIDA' group by fi.item_origem_id`,
    [faturaId],
  )).rows;
  const creditado = new Map(jaCreditado.map((x) => [x.origem, Number(x.quantidade)]));
  const selecao = d.itens ?? itensFatura.map((i) => ({ fatura_item_id: i.id, quantidade: Number(i.quantidade) - (creditado.get(i.id) ?? 0) })).filter((i) => i.quantidade > 1e-9);
  if (!selecao.length) throw conflito('fatura-ja-creditada', 'a fatura já foi totalmente creditada');
  const linhas = selecao.map((s) => {
    const fi = itensFatura.find((i) => i.id === s.fatura_item_id);
    if (!fi) throw invalido('linha não pertence à fatura');
    const disponivel = Number(fi.quantidade) - (creditado.get(fi.id) ?? 0);
    if (s.quantidade > disponivel + 1e-9) throw invalido(`${fi.descricao}: só ${disponivel} para creditar`);
    return { fi, quantidade: s.quantidade, iva: fi.iva, total: totalLinha(s.quantidade, Number(fi.preco_unitario)) };
  });
  const t = totaisFiscais(linhas);
  const n = await proximoNumero(q, 'NOTA_CREDITO', d.data);
  const nota = (
    await q.query<{ id: string }>(
      `insert into erp_fatura (tipo, terceiro_id, fatura_origem_id, timbrado, estabelecimento, ponto_expedicao, numero, numero_formatado, data, condicao, moeda, tipo_cambio, deposito_id,
         total_10, iva_10, total_5, iva_5, exento, total, observacao, autor)
       values ('NOTA_CREDITO', $1, $2, $3, $4, $5, $6, $7, $8, 'CONTADO', $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) returning *`,
      [f.terceiro_id, f.id, n.timbrado, n.estabelecimento, n.ponto_expedicao, n.numero, n.formatado, d.data, f.moeda, f.tipo_cambio, f.deposito_id, t.total_10, t.iva_10, t.total_5, t.iva_5, t.exento, t.total, d.motivo, autor],
    )
  ).rows[0]!;
  for (const l of linhas) {
    await q.query(
      'insert into erp_fatura_item (fatura_id, item_id, item_origem_id, descricao, quantidade, preco_unitario, iva, total) values ($1, $2, $3, $4, $5, $6, $7, $8)',
      [nota.id, l.fi.item_id, l.fi.id, l.fi.descricao, l.quantidade, l.fi.preco_unitario, l.iva, l.total],
    );
    const item = l.fi.item_id ? (await q.query<{ controla_estoque: boolean }>('select controla_estoque from erp_item where id = $1', [l.fi.item_id])).rows[0] : undefined;
    if (d.devolver_estoque && item?.controla_estoque && f.deposito_id) {
      await movimentar(q, { itemId: l.fi.item_id!, depositoId: f.deposito_id, tipo: 'DEVOLUCAO_VENDA', quantidade: l.quantidade, documentoTipo: 'nota_credito', documentoId: nota.id, autor });
    }
  }
  // Abate o que falta receber (da última parcela para a primeira); o excedente é devolvido ao cliente.
  let restante = t.total;
  const abertos = (await q.query<{ id: string; saldo: number; valor: number }>(`select id, saldo, valor from erp_titulo where fatura_id = $1 and estado in ('ABERTO', 'PARCIAL') order by vencimento desc for update`, [faturaId])).rows;
  for (const tt of abertos) {
    if (!restante) break;
    const abate = Math.min(restante, tt.saldo);
    await baixar(q, tt.id, { data: d.data, valor: abate, meio: 'TRANSFERENCIA', observacao: `nota de crédito ${n.formatado}`, automatica: true }, autor);
    restante -= abate;
  }
  if (restante > 0) {
    await criarTitulos(q, { tipo: 'PAGAR', terceiroId: f.terceiro_id, faturaId: nota.id, descricao: `Devolução ao cliente · nota de crédito ${n.formatado}`, emissao: d.data, moeda: f.moeda, parcelas: [{ vencimento: somarDias(d.data, 7), valor: restante }] });
  }
  return nota;
}

/**
 * Faturas de comissão do mês (uma por loja): a comissão do Portal no ledger
 * (em reais) vira serviço com IVA 10% em guaranis. Como a comissão já ficou
 * retida no split do Pix, a fatura sai à vista, quitada por retenção.
 */
export async function faturarComissoes(q: Consulta, periodo: string, cfg: Config, hoje: string, autor: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) throw invalido('período no formato AAAA-MM');
  const inicio = `${periodo}-01`;
  const fim = new Date(`${inicio}T12:00:00Z`);
  fim.setUTCMonth(fim.getUTCMonth() + 1);
  const comissoes = (
    await q.query<{ loja_id: string; loja_nome: string; terceiro_id: string | null; centavos: number }>(
      `select l.id as loja_id, l.nome as loja_nome, t.id as terceiro_id,
         coalesce(sum(case x.tipo when 'COMISSAO_PORTAL' then x.valor_centavos when 'ESTORNO_COMISSAO_PORTAL' then -x.valor_centavos else 0 end), 0)::bigint as centavos
       from loja l
       join lancamento x on x.loja_id = l.id and (x.criado_em at time zone 'America/Asuncion') >= $1::date and (x.criado_em at time zone 'America/Asuncion') < $2::date
       left join erp_terceiro t on t.loja_id = l.id and t.cliente and t.ativo
       group by l.id, l.nome, t.id order by l.nome`,
      [inicio, fim.toISOString().slice(0, 10)],
    )
  ).rows;
  const emitidas: { loja: string; fatura: string; total_pyg: number }[] = [];
  const pendentes: { loja: string; motivo: string }[] = [];
  for (const c of comissoes) {
    if (c.centavos <= 0) continue;
    if (!c.terceiro_id) {
      pendentes.push({ loja: c.loja_nome, motivo: 'loja sem cadastro de cliente (RUC) no ERP' });
      continue;
    }
    const existe = await q.query(`select numero_formatado from erp_fatura where terceiro_id = $1 and periodo = $2 and origem = 'COMISSAO' and estado = 'EMITIDA'`, [c.terceiro_id, periodo]);
    if (existe.rows[0]) {
      pendentes.push({ loja: c.loja_nome, motivo: 'comissão do mês já faturada' });
      continue;
    }
    const pyg = Math.round((c.centavos * cfg.cotacaoBrlPyg) / 100);
    const f = await emitirFatura(
      q,
      {
        terceiro_id: c.terceiro_id,
        data: hoje,
        condicao: 'CONTADO',
        meio: 'TRANSFERENCIA',
        parcelas: 1,
        intervalo_dias: 30,
        moeda: 'PYG',
        tipo_cambio: 1,
        itens: [{ descricao: `Comisión de intermediación Pick & Go · ${periodo} (R$ ${(c.centavos / 100).toFixed(2)} a ${cfg.cotacaoBrlPyg} Gs/R$)`, quantidade: 1, preco_unitario: pyg, iva: '10' }],
        observacao: `Comissão retida no split do Pix (ledger do Pick & Go).`,
      },
      autor,
      { origem: 'COMISSAO', periodo, meioAutomatico: 'RETENCAO_SPLIT' },
    );
    emitidas.push({ loja: c.loja_nome, fatura: f.numero_formatado, total_pyg: pyg });
  }
  return { periodo, emitidas, pendentes };
}
