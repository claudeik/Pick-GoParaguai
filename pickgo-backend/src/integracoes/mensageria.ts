import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Config } from '../config.ts';

// Envio de mensagens (D9: Twilio). WhatsApp e SMS pela API de mensagens da Twilio,
// e-mail pelo SendGrid (da Twilio). Sem credenciais, o adaptador simulado registra
// a mensagem como entregue, para o resto do sistema funcionar igual.

export type Canal = 'WHATSAPP' | 'SMS' | 'EMAIL';

export interface Envio {
  canal: Canal;
  /** E.164 (+5511999990000) para WhatsApp e SMS; endereço para e-mail. */
  destino: string;
  assunto?: string;
  texto: string;
  /** Modelo do Pick & Go; no WhatsApp vira o ContentSid aprovado, se houver. */
  modelo?: string;
  variaveis?: Record<string, string>;
}

export type ResultadoEnvio =
  | { ok: true; provedorId: string; estado: 'ENVIADA' | 'ENTREGUE' }
  | { ok: false; definitivo: boolean; erro: string };

export interface Mensageiro {
  readonly tipo: 'twilio' | 'simulado';
  enviar(e: Envio): Promise<ResultadoEnvio>;
  /** Valida X-Twilio-Signature dos webhooks (URL completa + parâmetros do formulário). */
  assinaturaValida(url: string, params: Record<string, string>, assinatura: string | undefined): boolean;
}

/** Assinatura da Twilio: HMAC-SHA1 da URL seguida dos parâmetros ordenados (chave + valor), em base64. */
export function assinaturaTwilio(token: string, url: string, params: Record<string, string>): string {
  const dados = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  return createHmac('sha1', token).update(dados, 'utf8').digest('base64');
}

export class MensageiroSimulado implements Mensageiro {
  readonly tipo = 'simulado' as const;
  readonly enviados: Envio[] = [];
  /** Nos testes: faz o próximo envio falhar. */
  falharProximo: { definitivo: boolean; erro: string } | null = null;
  private token: string;

  constructor(tokenWebhook = 'dev-twilio-token') {
    this.token = tokenWebhook;
  }

  async enviar(e: Envio): Promise<ResultadoEnvio> {
    if (this.falharProximo) {
      const f = this.falharProximo;
      this.falharProximo = null;
      return { ok: false, ...f };
    }
    this.enviados.push(e);
    return { ok: true, provedorId: `SIM${randomUUID().replaceAll('-', '')}`, estado: 'ENTREGUE' };
  }

  assinaturaValida(url: string, params: Record<string, string>, assinatura: string | undefined) {
    if (!assinatura) return false;
    const a = Buffer.from(assinaturaTwilio(this.token, url, params));
    const b = Buffer.from(assinatura);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}

export class MensageiroTwilio implements Mensageiro {
  readonly tipo = 'twilio' as const;
  private c: Config;

  constructor(c: Config) {
    this.c = c;
  }

  async enviar(e: Envio): Promise<ResultadoEnvio> {
    try {
      return e.canal === 'EMAIL' ? await this.email(e) : await this.mensagem(e);
    } catch (err) {
      return { ok: false, definitivo: false, erro: `falha de rede: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  private async mensagem(e: Envio): Promise<ResultadoEnvio> {
    const { twilioAccountSid: sid, twilioAuthToken: token } = this.c;
    const whatsapp = e.canal === 'WHATSAPP';
    const de = whatsapp ? this.c.twilioWhatsappFrom : this.c.twilioSmsFrom;
    if (!sid || !token || !de) return { ok: false, definitivo: true, erro: `canal ${e.canal} sem remetente configurado na Twilio` };
    const corpo = new URLSearchParams({
      To: whatsapp ? `whatsapp:${e.destino}` : e.destino,
      From: de,
      StatusCallback: `${this.c.urlPublica}/v1/webhooks/twilio/status`,
    });
    // Fora da janela de 24 h, o WhatsApp só aceita modelo aprovado (Content API).
    const contentSid = whatsapp && e.modelo ? this.c.twilioContentSids[e.modelo] : undefined;
    if (contentSid) {
      corpo.set('ContentSid', contentSid);
      corpo.set('ContentVariables', JSON.stringify(e.variaveis ?? {}));
    } else corpo.set('Body', e.texto);
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: corpo,
    });
    const j = (await r.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
    if (r.ok && j.sid) return { ok: true, provedorId: j.sid, estado: 'ENVIADA' };
    // 4xx é definitivo (número inválido, sem opt-in, modelo recusado); 429 e 5xx tentam de novo.
    return { ok: false, definitivo: r.status >= 400 && r.status < 500 && r.status !== 429, erro: `Twilio ${r.status} ${j.code ?? ''}: ${j.message ?? ''}`.trim() };
  }

  private async email(e: Envio): Promise<ResultadoEnvio> {
    if (!this.c.sendgridApiKey) return { ok: false, definitivo: true, erro: 'e-mail sem SENDGRID_API_KEY configurada' };
    const m = /^(.*)<(.+)>$/.exec(this.c.emailRemetente);
    const de = m ? { name: m[1]!.trim(), email: m[2]!.trim() } : { email: this.c.emailRemetente };
    const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.c.sendgridApiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: e.destino }] }],
        from: de,
        subject: e.assunto ?? 'Portal Paraguai · Pick & Go',
        content: [{ type: 'text/plain', value: e.texto }],
      }),
    });
    if (r.status === 202) return { ok: true, provedorId: r.headers.get('x-message-id') ?? `SG${randomUUID()}`, estado: 'ENVIADA' };
    const t = await r.text();
    return { ok: false, definitivo: r.status >= 400 && r.status < 500 && r.status !== 429, erro: `SendGrid ${r.status}: ${t.slice(0, 200)}` };
  }

  assinaturaValida(url: string, params: Record<string, string>, assinatura: string | undefined) {
    if (!assinatura || !this.c.twilioAuthToken) return false;
    const a = Buffer.from(assinaturaTwilio(this.c.twilioAuthToken, url, params));
    const b = Buffer.from(assinatura);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}

export function criarMensageiro(c: Config): Mensageiro {
  return c.twilioAccountSid && c.twilioAuthToken ? new MensageiroTwilio(c) : new MensageiroSimulado(c.twilioAuthToken ?? 'dev-twilio-token');
}
