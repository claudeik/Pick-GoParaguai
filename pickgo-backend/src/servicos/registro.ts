import type { Consulta, Db } from '../db.ts';
import type { Usuario } from '../auth.ts';
import { ator } from '../auth.ts';
import { exigirTransicao, EVENTO_DO_ESTADO, type EstadoPedido } from '../dominio/estadoPedido.ts';
import { conflito, naoEncontrado } from '../erros.ts';

export type Ator = Usuario | 'sistema';

const nomeAtor = (a: Ator) => (a === 'sistema' ? 'sistema' : ator(a));
const perfilAtor = (a: Ator) => (a === 'sistema' ? 'sistema' : a.perfil);

/** Grava o evento no outbox, na mesma transação da mudança. */
export async function publicar(q: Consulta, tipo: string, payload: Record<string, unknown>, correlacao?: string) {
  await q.query('insert into evento (tipo, payload, correlacao_id) values ($1, $2, $3)', [
    tipo,
    JSON.stringify(payload),
    correlacao ?? null,
  ]);
}

export async function auditar(
  q: Consulta,
  a: Ator,
  acao: string,
  entidade: string,
  entidadeId: string,
  dados?: Record<string, unknown>,
) {
  await q.query(
    'insert into auditoria (ator, perfil, acao, entidade, entidade_id, dados) values ($1, $2, $3, $4, $5, $6)',
    [nomeAtor(a), perfilAtor(a), acao, entidade, entidadeId, dados ? JSON.stringify(dados) : null],
  );
}

export interface PedidoLinha {
  id: string;
  codigo: string;
  cliente_id: string;
  modo: string;
  estado: EstadoPedido;
  [k: string]: unknown;
}

/** Trava o pedido para atualização. */
export async function travarPedido(q: Consulta, id: string): Promise<PedidoLinha> {
  const r = await q.query<PedidoLinha>('select * from pedido where id = $1 for update', [id]);
  if (!r.rows[0]) throw naoEncontrado('pedido');
  return r.rows[0];
}

/**
 * Muda o estado do pedido validando a máquina de estados.
 * Toda transição gera evento e auditoria (regra da seção 7).
 * `campos` atualiza colunas extras na mesma instrução.
 */
export async function transitar(
  q: Consulta,
  pedido: PedidoLinha,
  para: EstadoPedido,
  a: Ator,
  campos: Record<string, unknown> = {},
): Promise<PedidoLinha> {
  exigirTransicao(pedido.estado, para);
  const nomes = Object.keys(campos);
  const sets = nomes.map((n, i) => `${n} = $${i + 3}`);
  const r = await q.query<PedidoLinha>(
    `update pedido set estado = $2, atualizado_em = now()${sets.length ? ', ' + sets.join(', ') : ''}
     where id = $1 returning *`,
    [pedido.id, para, ...nomes.map((n) => campos[n])],
  );
  const novo = r.rows[0]!;
  const evento = EVENTO_DO_ESTADO[para];
  if (evento) {
    await publicar(q, evento, { pedido_id: novo.id, codigo: novo.codigo, de: pedido.estado, para }, novo.id);
  }
  await auditar(q, a, `pedido.${para.toLowerCase()}`, 'pedido', novo.id, { de: pedido.estado, para, ...campos });
  return novo;
}

/**
 * Executa fn uma única vez por chave (cabeçalho Idempotency-Key).
 * Repetir a chamada devolve a mesma resposta guardada.
 */
export async function idempotente<T>(
  db: Db,
  escopo: string,
  chave: string | undefined,
  fn: (q: Consulta) => Promise<{ status: number; corpo: T }>,
): Promise<{ status: number; corpo: T }> {
  if (!chave || chave.length < 8 || chave.length > 128) {
    throw conflito('idempotency-key-obrigatoria', 'envie o cabeçalho Idempotency-Key (8 a 128 caracteres)');
  }
  return db.tx(async (q) => {
    const antes = await q.query<{ status: number; resposta: T }>(
      'select status, resposta from idempotencia where escopo = $1 and chave = $2',
      [escopo, chave],
    );
    if (antes.rows[0]) return { status: antes.rows[0].status, corpo: antes.rows[0].resposta };
    const r = await fn(q);
    await q.query('insert into idempotencia (escopo, chave, status, resposta) values ($1, $2, $3, $4)', [
      escopo,
      chave,
      r.status,
      JSON.stringify(r.corpo),
    ]);
    return r;
  });
}
