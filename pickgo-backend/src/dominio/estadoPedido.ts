import { conflito } from '../erros.ts';

// Máquina de estados da seção 7 da especificação.
// Acréscimos: CANCELADO, para o endpoint POST /pedidos/{id}/cancelar da seção 9.1, e
// REEMBOLSADO também a partir de EM_SEPARACAO, PRONTO_RETIRADA, LIBERADO_SAIDA e
// NAO_RETIRADO, porque o pedido pago sai de PAGO na hora e o estorno (RF-09) e a
// política de não retirado [DECISÃO] precisam alcançá-lo. Em coleta e em teste o item
// está em trânsito entre loja e Portal, então o estorno espera o pedido voltar a parar.
export const ESTADOS = [
  'CRIADO',
  'AGUARDANDO_PIX',
  'PAGO',
  'EXPIRADO',
  'CANCELADO',
  'EM_SEPARACAO',
  'EM_COLETA',
  'EM_TESTE_LOJA',
  'PRONTO_RETIRADA',
  'RETIRADO',
  'NAO_RETIRADO',
  'LIBERADO_SAIDA',
  'POSTADO',
  'EM_TRANSITO',
  'NA_ALFANDEGA',
  'ENTREGUE',
  'REEMBOLSADO',
] as const;

export type EstadoPedido = (typeof ESTADOS)[number];

const TRANSICOES: Record<EstadoPedido, readonly EstadoPedido[]> = {
  CRIADO: ['AGUARDANDO_PIX', 'CANCELADO'],
  AGUARDANDO_PIX: ['PAGO', 'EXPIRADO', 'CANCELADO'],
  PAGO: ['EM_SEPARACAO', 'LIBERADO_SAIDA', 'POSTADO', 'REEMBOLSADO'],
  EM_SEPARACAO: ['PRONTO_RETIRADA', 'EM_COLETA', 'REEMBOLSADO'],
  EM_COLETA: ['EM_TESTE_LOJA'],
  EM_TESTE_LOJA: ['PRONTO_RETIRADA', 'EM_COLETA'],
  PRONTO_RETIRADA: ['RETIRADO', 'NAO_RETIRADO', 'REEMBOLSADO'],
  LIBERADO_SAIDA: ['RETIRADO', 'REEMBOLSADO'],
  POSTADO: ['EM_TRANSITO'],
  EM_TRANSITO: ['NA_ALFANDEGA', 'ENTREGUE'],
  NA_ALFANDEGA: ['ENTREGUE'],
  RETIRADO: ['REEMBOLSADO'],
  NAO_RETIRADO: ['REEMBOLSADO'],
  EXPIRADO: [],
  CANCELADO: [],
  ENTREGUE: [],
  REEMBOLSADO: [],
};

export function podeTransitar(de: EstadoPedido, para: EstadoPedido): boolean {
  return TRANSICOES[de].includes(para);
}

export function exigirTransicao(de: EstadoPedido, para: EstadoPedido): void {
  if (!podeTransitar(de, para)) {
    throw conflito('transicao-invalida', `pedido em ${de} não pode ir para ${para}`, { de, para });
  }
}

/** Evento publicado ao entrar em cada estado (seção 9.2). */
export const EVENTO_DO_ESTADO: Partial<Record<EstadoPedido, string>> = {
  PAGO: 'PagamentoConfirmado',
  EM_SEPARACAO: 'PedidoEmSeparacao',
  EM_COLETA: 'PedidoEmColeta',
  EM_TESTE_LOJA: 'PedidoEmTesteLoja',
  PRONTO_RETIRADA: 'PedidoPronto',
  RETIRADO: 'RetiradaConfirmada',
  LIBERADO_SAIDA: 'SaidaLiberada',
  NAO_RETIRADO: 'PedidoNaoRetirado',
  EXPIRADO: 'PedidoExpirado',
  CANCELADO: 'PedidoCancelado',
  REEMBOLSADO: 'PedidoReembolsado',
};
