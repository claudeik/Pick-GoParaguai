import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Adaptador do provedor de Pix. O provedor real depende da decisão D1
// (quem recebe o Pix, Bancard / Cambio Real); este é o adaptador simulado.

export interface CobrancaPix {
  txid: string;
  copiaECola: string;
}

export interface ProvedorPix {
  criarCobranca(p: { valorCentavos: number; expiraEm: Date }): Promise<CobrancaPix>;
  /** Valida a assinatura do webhook sobre o corpo bruto. */
  assinaturaValida(corpoBruto: string, assinatura: string | undefined): boolean;
}

/** Corpo do webhook no formato da API Pix do Banco Central. */
export interface WebhookPix {
  pix: { endToEndId: string; txid: string; valor: string; horario: string }[];
}

export function assinar(corpo: string, segredo: string): string {
  return createHmac('sha256', segredo).update(corpo).digest('hex');
}

export class ProvedorPixSimulado implements ProvedorPix {
  private segredo: string;
  private chave: string;
  private recebedor: string;
  private cidade: string;

  constructor(o: { segredoWebhook: string; chave: string; recebedor: string; cidade: string }) {
    this.segredo = o.segredoWebhook;
    this.chave = o.chave;
    this.recebedor = o.recebedor;
    this.cidade = o.cidade;
  }

  async criarCobranca(p: { valorCentavos: number }): Promise<CobrancaPix> {
    const txid = randomBytes(16).toString('hex'); // 32 caracteres alfanuméricos
    const copiaECola = brCode({
      chave: this.chave,
      valorCentavos: p.valorCentavos,
      recebedor: this.recebedor,
      cidade: this.cidade,
      txid,
    });
    return { txid, copiaECola };
  }

  assinaturaValida(corpoBruto: string, assinatura: string | undefined): boolean {
    if (!assinatura) return false;
    const esperada = Buffer.from(assinar(corpoBruto, this.segredo));
    const recebida = Buffer.from(assinatura);
    return esperada.length === recebida.length && timingSafeEqual(esperada, recebida);
  }
}

// --- BR Code (EMV) do Pix "copia e cola" ---

function campo(id: string, valor: string): string {
  return id + String(valor.length).padStart(2, '0') + valor;
}

function semAcento(s: string, max: number): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .toUpperCase()
    .slice(0, max);
}

export function crc16(payload: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(payload, 'utf8')) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function brCode(p: { chave: string; valorCentavos: number; recebedor: string; cidade: string; txid: string }): string {
  const semCrc =
    campo('00', '01') +
    campo('26', campo('00', 'br.gov.bcb.pix') + campo('01', p.chave)) +
    campo('52', '0000') +
    campo('53', '986') +
    campo('54', (p.valorCentavos / 100).toFixed(2)) +
    campo('58', 'BR') +
    campo('59', semAcento(p.recebedor, 25)) +
    campo('60', semAcento(p.cidade, 15)) +
    campo('62', campo('05', p.txid.slice(0, 25))) +
    '6304';
  return semCrc + crc16(semCrc);
}
