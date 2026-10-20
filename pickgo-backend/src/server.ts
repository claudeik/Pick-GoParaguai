import { criarApp } from './app.ts';
import { carregarConfig } from './config.ts';
import type { Contexto } from './contexto.ts';
import { abrirDb, migrar } from './db.ts';
import { criarVerificadorOidc } from './auth.ts';
import { GestorKeycloak, GestorMemoria, USUARIOS_DEMO, type GestorIdentidade } from './integracoes/identidade.ts';
import { rodarCiclo } from './ciclo.ts';
import { ProvedorPixSimulado } from './integracoes/pix.ts';
import { semearDemo } from './seed.ts';
import { criarMensageiro } from './integracoes/mensageria.ts';
import { criarEnviadorPush } from './integracoes/push.ts';
import { buscarInfoYoutube } from './integracoes/youtube.ts';

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
  identidade = new GestorMemoria(USUARIOS_DEMO);
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
  infoVideo: buscarInfoYoutube,
};

const app = criarApp(ctx, { logger: { level: process.env.LOG_LEVEL ?? 'info' } });

let rodando = false;
const ciclo = setInterval(async () => {
  if (rodando) return;
  rodando = true;
  try {
    await rodarCiclo(ctx, app.log);
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
