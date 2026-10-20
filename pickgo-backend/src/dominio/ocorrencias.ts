// Regra de responsabilidade por ocorrência (seção 3.3.2).

export const TIPOS_OCORRENCIA = [
  'ITEM_FALTANTE',
  'ITEM_A_MAIS',
  'DEFEITO_TESTE',
  'DEFEITO_POS_SAIDA',
  'DIVERGENCIA_SAIDA',
] as const;
export type TipoOcorrencia = (typeof TIPOS_OCORRENCIA)[number];

export const RESOLUCOES = ['ACERTO_FATURA', 'REPOSICAO', 'TROCA', 'DEVOLUCAO', 'TICKET_LOJA'] as const;
export type Resolucao = (typeof RESOLUCOES)[number];

export type Responsavel = 'LOJA' | 'PORTAL' | 'LOJA_E_PORTAL' | 'A_DEFINIR';

export const REGRA: Record<TipoOcorrencia, { responsavel: Responsavel; resolucoes: readonly Resolucao[] }> = {
  DEFEITO_TESTE: { responsavel: 'LOJA', resolucoes: ['TROCA'] },
  // Depois da saída do cliente: ticket encaminhado à loja, sem ônus ao Portal.
  DEFEITO_POS_SAIDA: { responsavel: 'LOJA', resolucoes: ['TICKET_LOJA'] },
  ITEM_FALTANTE: { responsavel: 'LOJA_E_PORTAL', resolucoes: ['ACERTO_FATURA', 'REPOSICAO'] },
  ITEM_A_MAIS: { responsavel: 'LOJA_E_PORTAL', resolucoes: ['ACERTO_FATURA', 'DEVOLUCAO'] },
  DIVERGENCIA_SAIDA: { responsavel: 'A_DEFINIR', resolucoes: ['ACERTO_FATURA', 'REPOSICAO', 'DEVOLUCAO'] },
};
