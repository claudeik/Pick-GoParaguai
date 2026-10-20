// Regras de valor: tudo em centavos inteiros, arredondamento meio para cima.

/** Aplica uma taxa em pontos-base (1 bps = 0,01%) e arredonda para centavos. */
export function aplicarBps(centavos: number, bps: number): number {
  return Math.round((centavos * bps) / 10_000);
}

/** Converte US$ para R$ com a cotação em décimos de milésimo (5,50 = 55000). */
export function usdParaBrl(usdCentavos: number, cotacaoE4: number): number {
  return Math.round((usdCentavos * cotacaoE4) / 10_000);
}

export interface Taxas {
  comissaoPortalBps: number;
  comissaoEpyxBps: number;
  taxaPixBps: number;
  taxaCambioBps: number;
}

export interface Totais {
  subtotal: number;
  taxaPix: number;
  taxaCambio: number;
  total: number;
}

/** Taxas de Pix e câmbio são pagas pelo comprador sobre o valor dos produtos. [D4] */
export function calcularTotais(subtotalBrl: number, t: Taxas): Totais {
  const taxaPix = aplicarBps(subtotalBrl, t.taxaPixBps);
  const taxaCambio = aplicarBps(subtotalBrl, t.taxaCambioBps);
  return { subtotal: subtotalBrl, taxaPix, taxaCambio, total: subtotalBrl + taxaPix + taxaCambio };
}

export interface ParteDoSplit {
  conta: string;
  valor: number;
  tipo: string;
  lojaId: string | null;
}

/**
 * Divide o valor de cada loja em loja / Portal / EPYX (85/7,5/7,5 por padrão).
 * A loja fica com o resto, para a soma ser exatamente o valor pago.
 * Comissões saem uma linha por loja, para o painel da loja bater com o ledger.
 */
export function calcularSplit(porLoja: Map<string, number>, totais: Totais, t: Taxas): ParteDoSplit[] {
  const partes: ParteDoSplit[] = [];
  for (const [lojaId, valor] of [...porLoja].sort(([a], [b]) => a.localeCompare(b))) {
    const p = aplicarBps(valor, t.comissaoPortalBps);
    const e = aplicarBps(valor, t.comissaoEpyxBps);
    partes.push({ conta: contas.repasseLoja(lojaId), valor: valor - p - e, tipo: 'REPASSE_LOJA', lojaId });
    partes.push({ conta: contas.comissaoPortal, valor: p, tipo: 'COMISSAO_PORTAL', lojaId });
    partes.push({ conta: contas.comissaoEpyx, valor: e, tipo: 'COMISSAO_EPYX', lojaId });
  }
  partes.push({ conta: contas.taxaPixEpyx, valor: totais.taxaPix, tipo: 'TAXA_PIX', lojaId: null });
  partes.push({ conta: contas.taxaCambioEpyx, valor: totais.taxaCambio, tipo: 'TAXA_CAMBIO', lojaId: null });
  return partes.filter((x) => x.valor > 0);
}

export const contas = {
  pixRecebimentos: 'pix:recebimentos',
  repasseLoja: (lojaId: string) => `loja:${lojaId}:repasse`,
  comissaoPortal: 'portal:comissao',
  comissaoEpyx: 'epyx:comissao',
  taxaPixEpyx: 'epyx:taxa_pix',
  taxaCambioEpyx: 'epyx:taxa_cambio',
  ajustesOcorrencias: 'ocorrencias:ajustes',
  /** Despesa do Portal com descontos de campanha que ele paga. */
  campanhasPortal: 'portal:campanhas',
  estornosAPagar: 'pix:estornos_a_pagar',
};
