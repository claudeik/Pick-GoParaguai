import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarApp } from './app.ts';
import { rodarCiclo } from './ciclo.ts';
import { carregarConfig } from './config.ts';
import type { Contexto } from './contexto.ts';
import { abrirDb, migrar } from './db.ts';
import { GestorMemoria, USUARIOS_DEMO } from './integracoes/identidade.ts';
import { criarMensageiro } from './integracoes/mensageria.ts';
import { ProvedorPixSimulado } from './integracoes/pix.ts';
import { criarEnviadorPush } from './integracoes/push.ts';
import { buscarInfoYoutube } from './integracoes/youtube.ts';
import { semearDemo } from './seed.ts';

// Demo publicada no Vercel (MODO_DEMO=true): a API roda como Vercel Function sobre o
// Postgres do Neon (DATABASE_URL). Sem ele, usa o Postgres em memória (PGlite) com os
// dados de demonstração, que voltam ao início a cada reinício da função. Sem Keycloak:
// a equipe usa o modo demonstração. Sem processo contínuo: as rotinas rodam depois
// das respostas, no máximo uma vez a cada 5 s.

const pasta = dirname(fileURLToPath(import.meta.url));

const pronto = (async () => {
  const config = carregarConfig();
  // O disco da função é só leitura: sem Neon, o banco fica na memória.
  const db = await abrirDb({ databaseUrl: config.databaseUrl });
  await migrar(db, join(pasta, 'migrations'));
  await semearDemo(db);
  const ctx: Contexto = {
    db,
    config,
    pix: new ProvedorPixSimulado({ segredoWebhook: config.segredoWebhookPix, chave: config.pixChave, recebedor: config.pixRecebedor, cidade: config.pixCidade }),
    agora: () => new Date(),
    identidade: new GestorMemoria(USUARIOS_DEMO),
    mensageiro: criarMensageiro(config),
    push: criarEnviadorPush(config),
    infoVideo: buscarInfoYoutube,
  };
  const app = criarApp(ctx, { logger: { level: process.env.LOG_LEVEL ?? 'info' } });
  await app.ready();
  return { app, ctx };
})();

let ultimoCiclo = 0;
let emCiclo = false;

/** waitUntil do Vercel: mantém a função viva até a promessa terminar, depois da resposta. */
function depoisDaResposta(p: Promise<unknown>) {
  const contexto = (globalThis as Record<symbol, { get?: () => { waitUntil?: (p: Promise<unknown>) => void } } | undefined>)[Symbol.for('@vercel/request-context')];
  const waitUntil = contexto?.get?.()?.waitUntil;
  if (waitUntil) waitUntil(p);
  else void p;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const { app, ctx } = await pronto;
  // As rotas do Vercel mandam /v1/..., /v/{codigo} e /l/{codigo} para esta função com o caminho em __p.
  const u = new URL(req.url ?? '/', 'http://local');
  const p = u.searchParams.get('__p');
  if (p !== null) {
    u.searchParams.delete('__p');
    req.url = `${p}${u.search}`;
  }
  app.server.emit('request', req, res);

  if (!emCiclo && Date.now() - ultimoCiclo > 5_000) {
    emCiclo = true;
    ultimoCiclo = Date.now();
    depoisDaResposta(
      new Promise<void>((ok) => res.on('finish', ok))
        .then(() => rodarCiclo(ctx, app.log))
        .catch((e: unknown) => app.log.error({ err: e }, 'falha nas rotinas'))
        .finally(() => (emCiclo = false)),
    );
  }
}
