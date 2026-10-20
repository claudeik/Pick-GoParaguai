import type { EstadoPedido, Modo, Resolucao, Responsavel, TipoOcorrencia } from './api.ts';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const dataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export const fmtBRL = (centavos: number) => brl.format(centavos / 100);
export const fmtUSD = (centavos: number) => usd.format(centavos / 100);
export const fmtData = (iso: string | null | undefined) => (iso ? dataHora.format(new Date(iso)) : '—');
export const fmtPct = (bps: number) => `${(bps / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

/** Mesma regra do backend: arredondamento meio para cima, em centavos. */
export const aplicarBps = (centavos: number, bps: number) => Math.round((centavos * bps) / 10_000);
/** `cotacao` é US$ 1 = R$ x (ex.: 5.5). */
export const usdParaBrl = (usdCentavos: number, cotacao: number) => Math.round(usdCentavos * cotacao);

/** Lê "1.234,56", "1234.56" ou "1234" como centavos. */
export function lerDinheiro(texto: string): number | null {
  const t = texto.trim().replace(/[^\d.,]/g, '');
  if (!t) return null;
  const normal = t.includes(',') ? t.replaceAll('.', '').replace(',', '.') : t;
  const n = Number(normal);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

export const NOME_MODO: Record<Modo, string> = {
  RETIRADA_PORTAL: 'Retirada na central do Portal',
  RETIRADA_LOJA: 'Retirada na loja',
  SCAN_GO: 'Scan & Go',
  ENVIO_BRASIL: 'Envio ao Brasil',
};

export const NOME_ESTADO: Record<EstadoPedido, string> = {
  CRIADO: 'Criado',
  AGUARDANDO_PIX: 'Aguardando Pix',
  PAGO: 'Pago',
  EXPIRADO: 'Pix expirado',
  CANCELADO: 'Cancelado',
  EM_SEPARACAO: 'Em separação',
  EM_COLETA: 'Em coleta pelo Portal',
  EM_TESTE_LOJA: 'Em teste na loja',
  PRONTO_RETIRADA: 'Pronto para retirada',
  RETIRADO: 'Retirado',
  NAO_RETIRADO: 'Não retirado',
  LIBERADO_SAIDA: 'Saída liberada',
  POSTADO: 'Postado',
  EM_TRANSITO: 'Em trânsito',
  NA_ALFANDEGA: 'Na alfândega',
  ENTREGUE: 'Entregue',
  REEMBOLSADO: 'Reembolsado',
};

export function classeEstado(e: EstadoPedido): string {
  if (e === 'RETIRADO' || e === 'ENTREGUE') return 'badge-green';
  if (e === 'REEMBOLSADO' || e === 'EXPIRADO' || e === 'CANCELADO' || e === 'NAO_RETIRADO') return 'badge-red';
  if (e === 'PRONTO_RETIRADA' || e === 'LIBERADO_SAIDA') return 'badge-blue';
  return 'badge-gold';
}

export const NOME_OCORRENCIA: Record<TipoOcorrencia, string> = {
  DEFEITO_TESTE: 'Defeito no teste da loja, antes da saída',
  DEFEITO_POS_SAIDA: 'Defeito ou reclamação depois da saída',
  ITEM_FALTANTE: 'Item faltante',
  ITEM_A_MAIS: 'Item a mais',
  DIVERGENCIA_SAIDA: 'Divergência na conferência de saída',
};

export const NOME_RESPONSAVEL: Record<Responsavel, string> = {
  LOJA: 'Loja',
  PORTAL: 'Portal',
  LOJA_E_PORTAL: 'Loja e Portal',
  A_DEFINIR: 'A definir',
};

export const NOME_RESOLUCAO: Record<Resolucao, string> = {
  ACERTO_FATURA: 'Acerto na fatura de repasse',
  REPOSICAO: 'Reposição na loja',
  TROCA: 'Troca do item',
  DEVOLUCAO: 'Devolução e reposição',
  TICKET_LOJA: 'Ticket encaminhado à loja',
};

/** Regra 3.3.2 da especificação, espelhada para montar os formulários. */
export const RESOLUCOES_POR_TIPO: Record<TipoOcorrencia, Resolucao[]> = {
  DEFEITO_TESTE: ['TROCA'],
  DEFEITO_POS_SAIDA: ['TICKET_LOJA'],
  ITEM_FALTANTE: ['ACERTO_FATURA', 'REPOSICAO'],
  ITEM_A_MAIS: ['ACERTO_FATURA', 'DEVOLUCAO'],
  DIVERGENCIA_SAIDA: ['ACERTO_FATURA', 'REPOSICAO', 'DEVOLUCAO'],
};

const EMOJI_CATEGORIA: [RegExp, string][] = [
  [/cicl|bike|bicic/i, '🚲'],
  [/smart|celular|phone/i, '📱'],
  [/game|console/i, '🎮'],
  [/drone|foto|câmera|camera/i, '🚁'],
  [/perfum|cosm/i, '✨'],
  [/inform|notebook|computa/i, '💻'],
  [/áudio|audio|som/i, '🎧'],
  [/bebida|vinho|whisk/i, '🍷'],
];

export function emojiCategoria(categoria: string): string {
  return EMOJI_CATEGORIA.find(([r]) => r.test(categoria))?.[1] ?? '🛍️';
}

export function nomeConta(conta: string): string {
  if (conta === 'pix:recebimentos') return 'Recebimentos Pix';
  if (conta === 'portal:comissao') return 'Comissão Portal';
  if (conta === 'epyx:comissao') return 'Comissão EPYX';
  if (conta === 'epyx:taxa_pix') return 'Taxa Pix (EPYX)';
  if (conta === 'epyx:taxa_cambio') return 'Taxa câmbio (EPYX)';
  if (conta === 'ocorrencias:ajustes') return 'Ajustes de ocorrências';
  if (conta === 'pix:estornos_a_pagar') return 'Estornos a pagar';
  const m = /^loja:(.+):repasse$/.exec(conta);
  if (m) return `Repasse loja ${m[1]}`;
  return conta;
}
