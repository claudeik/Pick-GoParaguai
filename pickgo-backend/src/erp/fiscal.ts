// Regras fiscais do Paraguai usadas no controle interno do ERP.
// Validar com contador paraguaio antes de usar para declaração (DNIT).

/** Dígito verificador do RUC (módulo 11, pesos de 2 a 11 da direita para a esquerda). */
export function dvRuc(numero: string): number {
  const digitos = numero.replace(/\D/g, '');
  let total = 0;
  let peso = 2;
  for (let i = digitos.length - 1; i >= 0; i--) {
    if (peso > 11) peso = 2;
    total += Number(digitos[i]) * peso;
    peso++;
  }
  const resto = total % 11;
  return resto > 1 ? 11 - resto : 0;
}

/** Aceita "80012345-6" ou número e DV separados; devolve null se o DV não confere. */
export function lerRuc(ruc: string, dv?: number): { numero: string; dv: number } | null {
  const m = /^(\d{3,9})(?:-(\d))?$/.exec(ruc.replace(/[.\s]/g, ''));
  if (!m) return null;
  const numero = m[1]!;
  const informado = m[2] !== undefined ? Number(m[2]) : dv;
  const calculado = dvRuc(numero);
  if (informado !== undefined && informado !== calculado) return null;
  return { numero, dv: calculado };
}

export type Iva = '10' | '5' | 'EXENTO';

/** No Paraguai o preço já inclui o IVA: 10% = total ÷ 11; 5% = total ÷ 21. */
export function ivaIncluido(total: number, iva: Iva): number {
  if (iva === '10') return Math.round(total / 11);
  if (iva === '5') return Math.round(total / 21);
  return 0;
}

export interface TotaisFiscais {
  total_10: number;
  iva_10: number;
  total_5: number;
  iva_5: number;
  exento: number;
  total: number;
}

/** Totais por alíquota; o IVA de cada faixa é calculado sobre a soma da faixa (como no livro). */
export function totaisFiscais(linhas: { total: number; iva: Iva }[]): TotaisFiscais {
  const t10 = linhas.filter((l) => l.iva === '10').reduce((s, l) => s + l.total, 0);
  const t5 = linhas.filter((l) => l.iva === '5').reduce((s, l) => s + l.total, 0);
  const ex = linhas.filter((l) => l.iva === 'EXENTO').reduce((s, l) => s + l.total, 0);
  return { total_10: t10, iva_10: ivaIncluido(t10, '10'), total_5: t5, iva_5: ivaIncluido(t5, '5'), exento: ex, total: t10 + t5 + ex };
}

/** Total da linha: quantidade (pode ter decimais) × preço unitário, arredondado na unidade mínima. */
export const totalLinha = (quantidade: number, precoUnitario: number) => Math.round(quantidade * precoUnitario);

/** 001-001-0000123 */
export const numeroFormatado = (estab: string, ponto: string, numero: number) => `${estab}-${ponto}-${String(numero).padStart(7, '0')}`;

/** Valor em guaranis: PYG já está; USD em centavos × guaranis por dólar. */
export const emPyg = (valor: number, moeda: 'PYG' | 'USD', tipoCambio: number) => (moeda === 'PYG' ? valor : Math.round((valor * tipoCambio) / 100));
