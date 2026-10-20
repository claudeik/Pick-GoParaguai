import { join } from 'node:path';

export interface Config {
  porta: number;
  /** postgres://... para PostgreSQL real; vazio usa PGlite (Postgres embutido). */
  databaseUrl: string | undefined;
  /** Pasta do PGlite; undefined = em memória (testes). Em desenvolvimento, .data/pglite. */
  pgliteDir: string | undefined;
  segredoToken: string;
  segredoCpf: string;
  segredoWebhookPix: string;
  permitirDevLogin: boolean;
  /** Cotação US$ 1 = R$ x, em décimos de milésimo (5,50 = 55000). [D1] */
  cotacaoUsdBrlE4: number;
  /** Comissão total de 15%: 7,5% Portal + 7,5% EPYX. [D4] */
  comissaoPortalBps: number;
  comissaoEpyxBps: number;
  /** Pagas pelo comprador e recebidas pela EPYX. [D4] */
  taxaPixBps: number;
  taxaCambioBps: number;
  validadePixMinutos: number;
  prazoRetiradaHoras: number;
  /** Guaranis por real, para faturar em PYG a comissão que o ledger guarda em BRL. */
  cotacaoBrlPyg: number;
  /** Cota de compras por terra (referência de 2020, reconfirmar). [D3] */
  cotaUsdCentavos: number;
  /** Keycloak (equipe). Sem URL, só valem os tokens de desenvolvimento. */
  keycloakUrl: string | undefined;
  keycloakRealm: string;
  /** Client da API: audiência exigida no token e conta de serviço da gestão de usuários. */
  keycloakClientId: string;
  keycloakClientSecret: string | undefined;
  /** Horas depois de pronto para lembrar o cliente e abrir chamado de retirada atrasada. */
  lembreteRetiradaHoras: number;
  /** Máximo de mensagens de marketing por cliente por semana (RF-37). */
  limiteMarketingSemana: number;
  /** URL pública da API, para os webhooks da Twilio (status e mensagens recebidas). */
  urlPublica: string;
  /** Endereço do app, para onde o link curto da campanha leva. */
  urlApp: string;
  twilioAccountSid: string | undefined;
  twilioAuthToken: string | undefined;
  /** ex.: whatsapp:+14155238886 (sandbox) ou o número aprovado. */
  twilioWhatsappFrom: string | undefined;
  twilioSmsFrom: string | undefined;
  /** Modelos aprovados do WhatsApp: {"pedido_pronto": "HX..."} (Content API). */
  twilioContentSids: Record<string, string>;
  sendgridApiKey: string | undefined;
  emailRemetente: string;
  pixChave: string;
  pixRecebedor: string;
  pixCidade: string;
  /** Origens com CORS liberado: o app instalado (capacitor://localhost no iOS, https://localhost no Android). */
  origensApp: string[];
  /** Identificador do app nas lojas (bundle id do iOS e applicationId do Android). */
  appId: string;
  /** JSON da conta de serviço do Firebase (push no Android). */
  fcmContaServico: string | undefined;
  /** Chave .p8 do APNs (push no iOS), com o Key ID e o Team ID da conta Apple Developer. */
  apnsChave: string | undefined;
  apnsKeyId: string | undefined;
  apnsTeamId: string | undefined;
  /** false = ambiente de testes da Apple (build de desenvolvimento). */
  apnsProducao: boolean;
  /** Conta da revisão da App Store e da Play Store: CPF cadastrado que entra com código fixo, sem WhatsApp. */
  revisaoCpf: string | undefined;
  revisaoCodigo: string | undefined;
}

function num(nome: string, padrao: number): number {
  const v = process.env[nome];
  if (v === undefined || v === '') return padrao;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${nome} inválido: ${v}`);
  return n;
}

export function carregarConfig(sobrescrever: Partial<Config> = {}): Config {
  const producao = process.env.NODE_ENV === 'production';
  const segredo = (nome: string) => {
    const v = process.env[nome];
    if (v) return v;
    if (producao) throw new Error(`${nome} é obrigatório em produção`);
    return `dev-${nome.toLowerCase()}`;
  };
  if (producao && !process.env.DATABASE_URL) throw new Error('DATABASE_URL é obrigatório em produção');
  return {
    porta: num('PORT', 3333),
    databaseUrl: process.env.DATABASE_URL || undefined,
    pgliteDir: process.env.PGLITE_DIR || join(import.meta.dirname, '..', '.data', 'pglite'),
    segredoToken: segredo('TOKEN_SECRET'),
    segredoCpf: segredo('CPF_HASH_SECRET'),
    segredoWebhookPix: segredo('PIX_WEBHOOK_SECRET'),
    permitirDevLogin: !producao && process.env.ALLOW_DEV_LOGIN !== 'false',
    cotacaoUsdBrlE4: num('COTACAO_USD_BRL_E4', 55000),
    comissaoPortalBps: num('COMISSAO_PORTAL_BPS', 750),
    comissaoEpyxBps: num('COMISSAO_EPYX_BPS', 750),
    taxaPixBps: num('TAXA_PIX_BPS', 150),
    taxaCambioBps: num('TAXA_CAMBIO_BPS', 50),
    validadePixMinutos: num('PIX_VALIDADE_MIN', 30),
    prazoRetiradaHoras: num('PRAZO_RETIRADA_HORAS', 72),
    cotacaoBrlPyg: num('COTACAO_BRL_PYG', 1380),
    cotaUsdCentavos: num('COTA_USD_CENTAVOS', 50000),
    keycloakUrl: process.env.KEYCLOAK_URL || undefined,
    keycloakRealm: process.env.KEYCLOAK_REALM ?? 'pickgo',
    keycloakClientId: process.env.KEYCLOAK_CLIENT_ID ?? 'pickgo-api',
    keycloakClientSecret: process.env.KEYCLOAK_CLIENT_SECRET || undefined,
    lembreteRetiradaHoras: num('LEMBRETE_RETIRADA_HORAS', 24),
    limiteMarketingSemana: num('LIMITE_MARKETING_SEMANA', 3),
    urlPublica: process.env.URL_PUBLICA ?? 'http://localhost:3333',
    urlApp: process.env.URL_APP ?? 'http://localhost:5180',
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || undefined,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || undefined,
    twilioWhatsappFrom: process.env.TWILIO_WHATSAPP_FROM || undefined,
    twilioSmsFrom: process.env.TWILIO_SMS_FROM || undefined,
    twilioContentSids: JSON.parse(process.env.TWILIO_CONTENT_SIDS || '{}') as Record<string, string>,
    sendgridApiKey: process.env.SENDGRID_API_KEY || undefined,
    emailRemetente: process.env.EMAIL_REMETENTE ?? 'Portal Paraguai Pick & Go <nao-responda@portalparaguai.com>',
    pixChave: process.env.PIX_CHAVE ?? '00000000-0000-0000-0000-000000000000',
    pixRecebedor: process.env.PIX_RECEBEDOR ?? 'PORTAL PARAGUAI',
    pixCidade: process.env.PIX_CIDADE ?? 'FOZ DO IGUACU',
    origensApp: (process.env.ORIGENS_APP ?? 'capacitor://localhost,https://localhost,http://localhost:5181').split(',').map((o) => o.trim()).filter(Boolean),
    appId: process.env.APP_ID ?? 'br.com.epyx.pickgo',
    fcmContaServico: process.env.FCM_CONTA_SERVICO || undefined,
    apnsChave: process.env.APNS_CHAVE || undefined,
    apnsKeyId: process.env.APNS_KEY_ID || undefined,
    apnsTeamId: process.env.APNS_TEAM_ID || undefined,
    apnsProducao: process.env.APNS_PRODUCAO === 'true',
    revisaoCpf: process.env.REVISAO_CPF?.replace(/\D/g, '') || undefined,
    revisaoCodigo: process.env.REVISAO_CODIGO || undefined,
    ...sobrescrever,
  };
}
