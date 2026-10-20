import Fastify, { type FastifyError, type FastifyServerOptions } from 'fastify';
import { ZodError } from 'zod';
import { lerToken } from './auth.ts';
import type { Contexto } from './contexto.ts';
import { ErroHttp, invalido } from './erros.ts';
import { rotasCampanhas } from './rotas/campanhas.ts';
import { rotasCatalogo } from './rotas/catalogo.ts';
import { rotasClientes } from './rotas/clientes.ts';
import { rotasCrm } from './rotas/crm.ts';
import { rotasErp } from './rotas/erp.ts';
import { rotasOcorrencias } from './rotas/ocorrencias.ts';
import { rotasOperacao } from './rotas/operacao.ts';
import { rotasPagamentos } from './rotas/pagamentos.ts';
import { rotasPedidos } from './rotas/pedidos.ts';
import { rotasRelatorios } from './rotas/relatorios.ts';
import { rotasUsuarios } from './rotas/usuarios.ts';

const MODULOS = [rotasCatalogo, rotasClientes, rotasPedidos, rotasPagamentos, rotasOperacao, rotasOcorrencias, rotasRelatorios, rotasUsuarios, rotasCrm, rotasCampanhas, rotasErp];

/** Corpo de erro no formato problem+json (RFC 9457); `codigo` repete o tipo para o app. */
function problema(status: number, codigo: string, detalhe: string, extras?: Record<string, unknown>) {
  return { type: `urn:pickgo:erro:${codigo}`, title: codigo, status, detail: detalhe, codigo, ...extras };
}

// Erros do PostgreSQL que são culpa da entrada, não do servidor.
const PG_ENTRADA: Record<string, [number, string]> = {
  '22P02': [422, 'requisicao-invalida'], // texto que não é uuid, número etc.
  '23505': [409, 'conflito'], // violação de unicidade
  '23503': [422, 'referencia-invalida'], // chave estrangeira
  '23514': [422, 'requisicao-invalida'], // check constraint
};

export function criarApp(ctx: Contexto, opcoes: FastifyServerOptions = {}) {
  const app = Fastify({ bodyLimit: 256 * 1024, ...opcoes });

  // Guarda o corpo bruto: o webhook do Pix assina os bytes exatos que chegaram.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, corpo, pronto) => {
    const texto = corpo as string;
    req.corpoBruto = texto;
    if (!texto.trim()) return pronto(null, {});
    try {
      pronto(null, JSON.parse(texto));
    } catch {
      pronto(invalido('JSON inválido'), undefined);
    }
  });

  // JWT (três partes) vem do Keycloak; token de duas partes é o HMAC do turista ou de desenvolvimento.
  // Fora do desenvolvimento, token HMAC só vale para o turista.
  // Webhooks da Twilio chegam como formulário; a assinatura é conferida sobre os campos.
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (req, corpo, pronto) => {
    req.corpoBruto = corpo as string;
    pronto(null, Object.fromEntries(new URLSearchParams(corpo as string)));
  });

  app.addHook('onRequest', async (req) => {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return;
    const token = h.slice(7).trim();
    try {
      if (token.split('.').length === 3) {
        req.usuario = (await ctx.verificarOidc?.(token)) ?? undefined;
      } else {
        const u = lerToken(token, ctx.config.segredoToken) ?? undefined;
        req.usuario = u && (u.perfil === 'cliente' || ctx.config.permitirDevLogin) ? u : undefined;
        // Token emitido antes da exclusão da conta deixa de valer na hora.
        if (req.usuario?.perfil === 'cliente') {
          const c = await ctx.db.query<{ excluido_em: Date | null }>('select excluido_em from cliente where id = $1', [req.usuario.sub]);
          if (!c.rows[0] || c.rows[0].excluido_em) req.usuario = undefined;
        }
      }
    } catch {
      req.usuario = undefined;
    }
  });

  // CORS só para o app instalado: no navegador a API fica no mesmo endereço do site.
  app.addHook('onRequest', async (req, rep) => {
    const origem = req.headers.origin;
    if (!origem || !ctx.config.origensApp.includes(origem)) return;
    rep.header('access-control-allow-origin', origem);
    rep.header('vary', 'origin');
    if (req.method === 'OPTIONS') {
      rep.header('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE');
      rep.header('access-control-allow-headers', 'authorization, content-type, idempotency-key, accept');
      rep.header('access-control-max-age', '600');
      return rep.code(204).send();
    }
  });

  app.addHook('onSend', async (_req, rep, corpo) => {
    rep.header('cache-control', 'no-store');
    rep.header('x-content-type-options', 'nosniff');
    return corpo;
  });

  app.setErrorHandler((erro: FastifyError | ErroHttp | ZodError | Error, req, rep) => {
    if (erro instanceof ErroHttp) {
      return rep.code(erro.status).type('application/problem+json').send(problema(erro.status, erro.tipo, erro.message, erro.extras));
    }
    if (erro instanceof ZodError) {
      const campos = erro.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message }));
      return rep.code(422).type('application/problem+json').send(problema(422, 'requisicao-invalida', 'dados inválidos', { campos }));
    }
    const pg = (erro as { code?: string }).code;
    if (pg && PG_ENTRADA[pg]) {
      const [status, codigo] = PG_ENTRADA[pg];
      return rep.code(status).type('application/problem+json').send(problema(status, codigo, 'dados inválidos para esta operação'));
    }
    const status = (erro as FastifyError).statusCode;
    if (status && status >= 400 && status < 500) {
      return rep.code(status).type('application/problem+json').send(problema(status, 'requisicao-invalida', erro.message));
    }
    req.log.error({ err: erro }, 'erro não tratado');
    return rep.code(500).type('application/problem+json').send(problema(500, 'erro-interno', 'erro interno; tente de novo'));
  });

  app.setNotFoundHandler((req, rep) =>
    rep.code(404).type('application/problem+json').send(problema(404, 'rota-inexistente', `${req.method} ${req.url} não existe`)),
  );

  app.get('/saude', async () => {
    await ctx.db.query('select 1');
    return { ok: true };
  });

  for (const m of MODULOS) m(app, ctx);
  return app;
}
