import { criarApp } from './app.ts';
import { carregarConfig } from './config.ts';
import type { Contexto } from './contexto.ts';
import { abrirDb, migrar } from './db.ts';
import { criarVerificadorOidc } from './auth.ts';
import { GestorKeycloak, GestorMemoria, type GestorIdentidade } from './integracoes/identidade.ts';
import { ProvedorPixSimulado } from './integracoes/pix.ts';
import { semearDemo } from './seed.ts';
import { criarMensageiro } from './integracoes/mensageria.ts';
import { criarEnviadorPush } from './integracoes/push.ts';
import { processarCampanhas } from './servicos/campanhas.ts';
import { despacharMensagens, lembrarRetiradas, processarEventoCrm } from './servicos/crm.ts';
import { despacharPush } from './servicos/push.ts';
import { expirarCobrancas, marcarNaoRetirados, publicarEventos } from './servicos/rotinas.ts';

const config = carregarConfig();
const db = await abrirDb(config);
await migrar(db);

// Fora de produção, um banco vazio recebe as lojas e produtos do piloto.
if (process.env.NODE_ENV !== 'production' && process.env.SEED_DEMO !== 'false') {
  const r = await semearDemo(db);
  if (r) console.log(`dados de demonstração: ${r.lojas} lojas e ${r.produtos} produtos`);
}

// Equipe: Keycloak quando configurado; sem ele, usuários em memória (modo demonstração).
let identidade: GestorIdentidade;
let verificarOidc: Contexto['verificarOidc'];
if (config.keycloakUrl) {
  if (!config.keycloakClientSecret) throw new Error('KEYCLOAK_CLIENT_SECRET é obrigatório com KEYCLOAK_URL');
  identidade = new GestorKeycloak({ url: config.keycloakUrl, realm: config.keycloakRealm, clientId: config.keycloakClientId, clientSecret: config.keycloakClientSecret });
  verificarOidc = criarVerificadorOidc({ emissor: `${config.keycloakUrl}/realms/${config.keycloakRealm}`, audiencia: config.keycloakClientId });
} else {
  if (process.env.NODE_ENV === 'production') throw new Error('KEYCLOAK_URL é obrigatório em produção');
  identidade = new GestorMemoria([
    { email: 'admin@portalparaguai.com', nome: 'Administração Portal', organizacao: 'PORTAL', loja_id: null, perfil: 'portal-admin' },
    { email: 'central@portalparaguai.com', nome: 'Diego Benítez', organizacao: 'PORTAL', loja_id: null, perfil: 'portal-central' },
    { email: 'suporte@epyx.com.br', nome: 'Suporte EPYX', organizacao: 'EPYX', loja_id: null, perfil: 'epyx-suporte' },
    { email: 'gerente@cellshop.com.py', nome: 'Gerente Cellshop', organizacao: 'LOJA', loja_id: 'cellshop', perfil: 'loja-gerente' },
  ]);
}

const ctx: Contexto = {
  db,
  config,
  pix: new ProvedorPixSimulado({
    segredoWebhook: config.segredoWebhookPix,
    chave: config.pixChave,
    recebedor: config.pixRecebedor,
    cidade: config.pixCidade,
  }),
  agora: () => new Date(),
  identidade,
  verificarOidc,
  mensageiro: criarMensageiro(config),
  push: criarEnviadorPush(config),
};

const app = criarApp(ctx, { logger: { level: process.env.LOG_LEVEL ?? 'info' } });

let rodando = false;
const ciclo = setInterval(async () => {
  if (rodando) return;
  rodando = true;
  try {
    const expirados = await expirarCobrancas(ctx);
    const lembretes = await lembrarRetiradas(ctx);
    const naoRetirados = await marcarNaoRetirados(ctx);
    if (expirados || lembretes || naoRetirados) app.log.info({ expirados, lembretes, naoRetirados }, 'rotinas');
    await publicarEventos(ctx, async (e, q) => {
      await processarEventoCrm(q, ctx, e);
      app.log.info({ evento: e.tipo, id: e.id }, 'evento publicado');
    }, (e, erro) => app.log.error({ evento: e.tipo, id: e.id, err: erro }, 'falha ao publicar evento'));
    const camp = await processarCampanhas(ctx);
    if (camp.disparadas || camp.passos) app.log.info(camp, 'campanhas');
    const envio = await despacharMensagens(ctx, ctx.mensageiro);
    if (envio.enviadas || envio.bloqueadas || envio.falhas) app.log.info(envio, 'mensagens');
    const push = await despacharPush(ctx);
    if (push.enviadas || push.falhas) app.log.info(push, 'push');
  } catch (e) {
    app.log.error({ err: e }, 'falha nas rotinas');
  } finally {
    rodando = false;
  }
}, 5_000);

async function encerrar() {
  clearInterval(ciclo);
  await app.close();
  await db.fechar();
  process.exit(0);
}
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);

await app.listen({ port: config.porta, host: process.env.HOST ?? '127.0.0.1' });
app.log.info(ctx.mensageiro.tipo === 'twilio' ? 'mensagens pela Twilio' : 'Twilio não configurada: mensagens simuladas (registradas como entregues)');
app.log.info(config.keycloakUrl ? `equipe autenticada pelo Keycloak (${config.keycloakUrl}, realm ${config.keycloakRealm})` : 'Keycloak não configurado: usuários da equipe em memória (modo demonstração)');
if (config.permitirDevLogin) app.log.warn('login de desenvolvimento e simulador de Pix ligados (NODE_ENV não é production)');
