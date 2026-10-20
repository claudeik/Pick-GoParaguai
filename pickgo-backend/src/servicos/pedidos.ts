import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Consulta } from '../db.ts';
import { ehDaLoja, ehEquipe, type Usuario } from '../auth.ts';
import { invalido, naoEncontrado, proibido } from '../erros.ts';

// QR de retirada e de saída: derivado do id do pedido com HMAC, então não
// precisa ser guardado. O uso único é garantido por pedido.qr_usado_em.

export function gerarQr(pedidoId: string, segredo: string): string {
  const mac = createHmac('sha256', `qr:${segredo}`).update(pedidoId).digest('base64url').slice(0, 32);
  return `PG1.${pedidoId}.${mac}`;
}

/** Devolve o id do pedido se o QR for autêntico; senão, erro 422. */
export function lerQr(qr: string, segredo: string): string {
  const [versao, pedidoId] = qr.trim().split('.');
  if (versao !== 'PG1' || !pedidoId || !/^[0-9a-f-]{36}$/.test(pedidoId)) throw invalido('QR inválido');
  const esperado = Buffer.from(gerarQr(pedidoId, segredo));
  const recebido = Buffer.from(qr.trim());
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) throw invalido('QR inválido');
  return pedidoId;
}

const ESTADOS_COM_QR = new Set(['PAGO', 'EM_SEPARACAO', 'EM_COLETA', 'EM_TESTE_LOJA', 'PRONTO_RETIRADA', 'LIBERADO_SAIDA']);


type Linha = Record<string, unknown>;

/**
 * Pedidos completos para o app e os painéis, na ordem de `ids`.
 * O QR só vai para o dono; o nome do cliente só para a equipe;
 * lojista e operador veem só os itens da própria loja.
 */
export async function carregarPedidos(q: Consulta, ids: string[], u: Usuario, segredo: string) {
  if (!ids.length) return [];
  const pedidos = (
    await q.query<Linha>(
      `select p.*, c.nome as cliente_nome, c.cpf_mascarado as cliente_cpf
       from pedido p join cliente c on c.id = p.cliente_id where p.id = any($1::uuid[])`,
      [ids],
    )
  ).rows;
  const itens = (
    await q.query<Linha>(
      `select i.id, i.pedido_id, i.produto_id, i.loja_id, l.nome as loja_nome, i.nome_produto, i.quantidade,
              i.preco_usd_centavos, i.subtotal_usd_centavos, i.subtotal_brl_centavos,
              i.status, i.separado_em, i.teste_resultado, i.testado_em
       from pedido_item i join loja l on l.id = i.loja_id
       where i.pedido_id = any($1::uuid[]) order by l.nome, i.nome_produto, i.id`,
      [ids],
    )
  ).rows;
  const pagamentos = (
    await q.query<Linha>(
      `select distinct on (pedido_id) id, pedido_id, txid, estado, valor_brl_centavos, copia_e_cola, expira_em, confirmado_em
       from pagamento where pedido_id = any($1::uuid[]) order by pedido_id, criado_em desc`,
      [ids],
    )
  ).rows;

  const porId = new Map(pedidos.map((p) => [p.id as string, p]));
  return ids
    .map((id) => porId.get(id))
    .filter((p): p is Linha => !!p)
    .map((p) => {
      const dono = u.perfil === 'cliente' && p.cliente_id === u.sub;
      const todos = itens.filter((i) => i.pedido_id === p.id).map(({ pedido_id: _, ...i }) => i);
      const visiveis = ehDaLoja(u) ? todos.filter((i) => i.loja_id === u.loja_id) : todos;
      const pag = pagamentos.find((x) => x.pedido_id === p.id);
      return {
        id: p.id as string,
        codigo: p.codigo as string,
        estado: p.estado as string,
        modo: p.modo as string,
        loja_scan_go: p.loja_scan_go,
        janela_chegada: p.janela_chegada,
        cliente_chegou_em: p.cliente_chegou_em,
        ...(ehEquipe(u) ? { cliente_nome: p.cliente_nome, cliente_cpf: p.cliente_cpf } : {}),
        valores: {
          total_usd_centavos: p.total_usd_centavos,
          cotacao_usd_brl: (p.cotacao_e4 as number) / 10_000,
          subtotal_brl_centavos: p.subtotal_brl_centavos,
          taxa_pix_brl_centavos: p.taxa_pix_brl_centavos,
          taxa_cambio_brl_centavos: p.taxa_cambio_brl_centavos,
          total_brl_centavos: p.total_brl_centavos,
        },
        itens: visiveis,
        pagamento: pag
          ? {
              id: pag.id,
              txid: pag.txid,
              estado: pag.estado,
              valor_brl_centavos: pag.valor_brl_centavos,
              copia_e_cola: pag.estado === 'PENDENTE' ? pag.copia_e_cola : undefined,
              expira_em: pag.expira_em,
              confirmado_em: pag.confirmado_em,
            }
          : null,
        qr: dono && ESTADOS_COM_QR.has(p.estado as string) && !p.qr_usado_em ? gerarQr(p.id as string, segredo) : null,
        operacao: {
          coletado_por: p.coletado_por,
          coletado_em: p.coletado_em,
          conferido_portal_por: p.conferido_portal_por,
          conferido_portal_em: p.conferido_portal_em,
          pronto_em: p.pronto_em,
          retirado_por: p.retirado_por,
          retirado_em: p.retirado_em,
          qr_usado_em: p.qr_usado_em,
          documento_conferido: p.documento_conferido,
          conferencia_saida: p.conferencia_saida,
        },
        criado_em: p.criado_em,
        atualizado_em: p.atualizado_em,
        _cliente_id: p.cliente_id as string,
        _lojas: [...new Set(todos.map((i) => i.loja_id as string))],
      };
    });
}

export type PedidoCompleto = Awaited<ReturnType<typeof carregarPedidos>>[number];

/** Tira os campos internos antes de responder. */
export function publico({ _cliente_id, _lojas, ...p }: PedidoCompleto) {
  return p;
}

/** Um pedido, com a checagem de quem pode vê-lo. */
export async function verPedido(q: Consulta, id: string, u: Usuario, segredo: string) {
  const [p] = await carregarPedidos(q, [id], u, segredo);
  if (!p) throw naoEncontrado('pedido');
  if (u.perfil === 'cliente' && p._cliente_id !== u.sub) throw naoEncontrado('pedido');
  if (ehDaLoja(u) && !p._lojas.includes(u.loja_id ?? '')) throw proibido('pedido sem itens desta loja');
  return publico(p);
}
