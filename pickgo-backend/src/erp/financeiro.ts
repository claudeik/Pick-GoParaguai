import type { Consulta } from '../db.ts';
import { conflito, invalido, naoEncontrado } from '../erros.ts';

// Contas a pagar e a receber do Portal: títulos em parcelas, baixas (parciais ou
// totais) e estorno de baixa. Título não é apagado: anulação do documento o cancela.

export type Moeda = 'PYG' | 'USD';
export type MeioBaixa = 'TRANSFERENCIA' | 'EFECTIVO' | 'CHEQUE' | 'PIX' | 'TARJETA' | 'RETENCAO_SPLIT';

const somarDias = (data: string, dias: number) => {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

/** Parcelas iguais; a diferença de arredondamento fica na última. */
export function parcelasIguais(total: number, n: number, primeiroVencimento: string, intervaloDias = 30) {
  if (n < 1 || n > 60) throw invalido('entre 1 e 60 parcelas');
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => ({
    vencimento: somarDias(primeiroVencimento, i * intervaloDias),
    valor: i === n - 1 ? total - base * (n - 1) : base,
  }));
}

export interface NovoTitulo {
  tipo: 'PAGAR' | 'RECEBER';
  terceiroId: string;
  compraId?: string | null;
  faturaId?: string | null;
  descricao: string;
  emissao: string;
  moeda: Moeda;
  parcelas: { vencimento: string; valor: number }[];
}

export async function criarTitulos(q: Consulta, t: NovoTitulo) {
  if (!t.parcelas.length) throw invalido('informe ao menos uma parcela');
  const ids: string[] = [];
  for (const [i, p] of t.parcelas.entries()) {
    if (!Number.isInteger(p.valor) || p.valor <= 0) throw invalido('valor de parcela inválido');
    if (p.vencimento < t.emissao) throw invalido('vencimento antes da emissão');
    const r = await q.query<{ id: string }>(
      `insert into erp_titulo (tipo, terceiro_id, compra_id, fatura_id, descricao, parcela, parcelas, emissao, vencimento, moeda, valor, saldo)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11) returning id`,
      [t.tipo, t.terceiroId, t.compraId ?? null, t.faturaId ?? null, t.descricao, i + 1, t.parcelas.length, t.emissao, p.vencimento, t.moeda, p.valor],
    );
    ids.push(r.rows[0]!.id);
  }
  return ids;
}

interface TituloLinha {
  id: string;
  valor: number;
  saldo: number;
  estado: string;
}

export async function baixar(q: Consulta, tituloId: string, b: { data: string; valor: number; meio: MeioBaixa; observacao?: string; automatica?: boolean }, autor: string) {
  const t = (await q.query<TituloLinha>('select * from erp_titulo where id = $1 for update', [tituloId])).rows[0];
  if (!t) throw naoEncontrado('título');
  if (t.estado === 'QUITADO' || t.estado === 'CANCELADO') throw conflito('titulo-encerrado', `título ${t.estado.toLowerCase()}`);
  if (!Number.isInteger(b.valor) || b.valor <= 0) throw invalido('valor da baixa inválido');
  if (b.valor > t.saldo) throw invalido(`a baixa passa do saldo em aberto (${t.saldo})`);
  const saldo = t.saldo - b.valor;
  await q.query(`update erp_titulo set saldo = $2, estado = $3 where id = $1`, [tituloId, saldo, saldo === 0 ? 'QUITADO' : 'PARCIAL']);
  const r = await q.query<{ id: string }>(
    'insert into erp_baixa (titulo_id, data, valor, meio, observacao, automatica, autor) values ($1, $2, $3, $4, $5, $6, $7) returning *',
    [tituloId, b.data, b.valor, b.meio, b.observacao ?? null, !!b.automatica, autor],
  );
  return r.rows[0]!;
}

export async function estornarBaixa(q: Consulta, baixaId: string) {
  const b = (await q.query<{ id: string; titulo_id: string; valor: number; estornada: boolean }>('select * from erp_baixa where id = $1 for update', [baixaId])).rows[0];
  if (!b) throw naoEncontrado('baixa');
  if (b.estornada) throw conflito('baixa-estornada', 'baixa já estornada');
  const t = (await q.query<TituloLinha>('select * from erp_titulo where id = $1 for update', [b.titulo_id])).rows[0]!;
  if (t.estado === 'CANCELADO') throw conflito('titulo-cancelado', 'título cancelado');
  const saldo = t.saldo + b.valor;
  await q.query('update erp_baixa set estornada = true where id = $1', [baixaId]);
  await q.query('update erp_titulo set saldo = $2, estado = $3 where id = $1', [t.id, saldo, saldo === t.valor ? 'ABERTO' : 'PARCIAL']);
  return { titulo_id: t.id, saldo };
}

/**
 * Cancela os títulos de um documento anulado. Baixa automática (pagamento à vista
 * registrado com o documento) é estornada junto; baixa lançada à mão precisa ser
 * estornada antes, para ninguém perder o rastro de um pagamento real.
 */
export async function cancelarTitulosDe(q: Consulta, campo: 'compra_id' | 'fatura_id', id: string) {
  const titulos = (await q.query<TituloLinha>(`select * from erp_titulo where ${campo} = $1 and estado <> 'CANCELADO' for update`, [id])).rows;
  for (const t of titulos) {
    const baixas = (await q.query<{ id: string; automatica: boolean }>('select id, automatica from erp_baixa where titulo_id = $1 and not estornada', [t.id])).rows;
    if (baixas.some((b) => !b.automatica)) {
      throw conflito('titulo-com-baixa', 'há pagamentos registrados neste documento; estorne as baixas antes de anular');
    }
    for (const b of baixas) await q.query('update erp_baixa set estornada = true where id = $1', [b.id]);
    await q.query(`update erp_titulo set estado = 'CANCELADO', saldo = 0 where id = $1`, [t.id]);
  }
}
