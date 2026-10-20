import { connect } from 'node:http2';
import { createPrivateKey, randomUUID, sign } from 'node:crypto';
import type { Config } from '../config.ts';

// Notificação push do app do turista. Android pelo Firebase Cloud Messaging (API HTTP v1,
// conta de serviço) e iOS direto pelo APNs (chave .p8). Sem credenciais de uma plataforma,
// o envio dela é simulado e registrado como enviado, como no mensageiro.

export type Plataforma = 'android' | 'ios';

export interface Push {
  plataforma: Plataforma;
  token: string;
  titulo: string;
  corpo: string;
  dados?: Record<string, string>;
}

export type ResultadoPush =
  | { ok: true; provedor: string }
  /** `tokenInvalido`: o aparelho desinstalou o app ou trocou de token; o registro é apagado. */
  | { ok: false; definitivo: boolean; tokenInvalido?: boolean; erro: string };

export interface EnviadorPush {
  enviar(p: Push): Promise<ResultadoPush>;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

function jwt(cabecalho: object, corpo: object, chave: string, alg: 'RS256' | 'ES256'): string {
  const dados = `${b64url(JSON.stringify(cabecalho))}.${b64url(JSON.stringify(corpo))}`;
  const assinatura =
    alg === 'RS256'
      ? sign('sha256', Buffer.from(dados), createPrivateKey(chave))
      : sign('sha256', Buffer.from(dados), { key: createPrivateKey(chave), dsaEncoding: 'ieee-p1363' });
  return `${dados}.${b64url(assinatura)}`;
}

export class PushSimulado implements EnviadorPush {
  readonly enviados: Push[] = [];
  /** Nos testes: faz o próximo envio falhar. */
  falharProximo: Omit<Extract<ResultadoPush, { ok: false }>, 'ok'> | null = null;

  async enviar(p: Push): Promise<ResultadoPush> {
    if (this.falharProximo) {
      const f = this.falharProximo;
      this.falharProximo = null;
      return { ok: false, ...f };
    }
    this.enviados.push(p);
    return { ok: true, provedor: 'simulado' };
  }
}

interface ContaServico {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

/** Firebase Cloud Messaging, API HTTP v1. */
export class PushFcm implements EnviadorPush {
  private conta: ContaServico;
  private acesso: { token: string; ate: number } | null = null;

  constructor(conta: ContaServico) {
    this.conta = conta;
  }

  private async tokenAcesso(): Promise<string> {
    if (this.acesso && this.acesso.ate > Date.now() + 60_000) return this.acesso.token;
    const uri = this.conta.token_uri ?? 'https://oauth2.googleapis.com/token';
    const agora = Math.floor(Date.now() / 1000);
    const assercao = jwt(
      { alg: 'RS256', typ: 'JWT' },
      { iss: this.conta.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: uri, iat: agora, exp: agora + 3600 },
      this.conta.private_key,
      'RS256',
    );
    const r = await fetch(uri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: assercao }),
    });
    if (!r.ok) throw new Error(`FCM: token de acesso recusado (${r.status})`);
    const d = (await r.json()) as { access_token: string; expires_in: number };
    this.acesso = { token: d.access_token, ate: Date.now() + d.expires_in * 1000 };
    return d.access_token;
  }

  async enviar(p: Push): Promise<ResultadoPush> {
    try {
      const r = await fetch(`https://fcm.googleapis.com/v1/projects/${this.conta.project_id}/messages:send`, {
        method: 'POST',
        headers: { authorization: `Bearer ${await this.tokenAcesso()}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          message: { token: p.token, notification: { title: p.titulo, body: p.corpo }, data: p.dados ?? {}, android: { priority: 'high' } },
        }),
      });
      if (r.ok) return { ok: true, provedor: 'fcm' };
      const erro = (await r.text()).slice(0, 300);
      if (r.status === 404 || erro.includes('UNREGISTERED')) return { ok: false, definitivo: true, tokenInvalido: true, erro: 'aparelho não registrado no FCM' };
      return { ok: false, definitivo: r.status === 400 || r.status === 403, erro: `FCM ${r.status}: ${erro}` };
    } catch (e) {
      return { ok: false, definitivo: false, erro: `falha de rede: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}

interface ConfigApns {
  chave: string;
  keyId: string;
  teamId: string;
  bundleId: string;
  producao: boolean;
}

/** Apple Push Notification service, HTTP/2 com token JWT (chave .p8). */
export class PushApns implements EnviadorPush {
  private c: ConfigApns;
  private jwt: { token: string; desde: number } | null = null;

  constructor(c: ConfigApns) {
    this.c = c;
  }

  private autorizacao(): string {
    // A Apple aceita o mesmo token por até 1 hora e recusa renovação a cada envio.
    if (!this.jwt || Date.now() - this.jwt.desde > 50 * 60_000) {
      this.jwt = { token: jwt({ alg: 'ES256', kid: this.c.keyId }, { iss: this.c.teamId, iat: Math.floor(Date.now() / 1000) }, this.c.chave, 'ES256'), desde: Date.now() };
    }
    return `bearer ${this.jwt.token}`;
  }

  enviar(p: Push): Promise<ResultadoPush> {
    const host = this.c.producao ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';
    return new Promise((ok) => {
      const sessao = connect(host);
      const fim = (r: ResultadoPush) => {
        sessao.close();
        ok(r);
      };
      sessao.on('error', (e) => fim({ ok: false, definitivo: false, erro: `falha de rede: ${e.message}` }));
      const req = sessao.request({
        ':method': 'POST',
        ':path': `/3/device/${p.token}`,
        authorization: this.autorizacao(),
        'apns-topic': this.c.bundleId,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-id': randomUUID(),
        'content-type': 'application/json',
      });
      let status = 0;
      let resposta = '';
      req.on('response', (h) => (status = Number(h[':status'])));
      req.on('data', (d: Buffer) => (resposta += d.toString()));
      req.on('error', (e) => fim({ ok: false, definitivo: false, erro: `falha de rede: ${e.message}` }));
      req.on('end', () => {
        if (status === 200) return fim({ ok: true, provedor: 'apns' });
        const motivo = (() => {
          try {
            return (JSON.parse(resposta) as { reason?: string }).reason ?? resposta;
          } catch {
            return resposta;
          }
        })();
        if (status === 410 || motivo === 'BadDeviceToken' || motivo === 'Unregistered') return fim({ ok: false, definitivo: true, tokenInvalido: true, erro: `APNs: ${motivo}` });
        fim({ ok: false, definitivo: status === 400 || status === 403, erro: `APNs ${status}: ${motivo}` });
      });
      req.end(JSON.stringify({ aps: { alert: { title: p.titulo, body: p.corpo }, sound: 'default' }, ...p.dados }));
    });
  }
}

/** Escolhe por plataforma: real quando há credencial, simulado quando não há. */
export class PushPorPlataforma implements EnviadorPush {
  readonly android: EnviadorPush;
  readonly ios: EnviadorPush;

  constructor(android: EnviadorPush, ios: EnviadorPush) {
    this.android = android;
    this.ios = ios;
  }

  enviar(p: Push) {
    return (p.plataforma === 'ios' ? this.ios : this.android).enviar(p);
  }
}

export function criarEnviadorPush(c: Config): PushPorPlataforma {
  const android = c.fcmContaServico ? new PushFcm(JSON.parse(c.fcmContaServico) as ContaServico) : new PushSimulado();
  const ios =
    c.apnsChave && c.apnsKeyId && c.apnsTeamId
      ? new PushApns({ chave: c.apnsChave.replaceAll('\\n', '\n'), keyId: c.apnsKeyId, teamId: c.apnsTeamId, bundleId: c.appId, producao: c.apnsProducao })
      : new PushSimulado();
  return new PushPorPlataforma(android, ios);
}
