import { randomUUID } from 'node:crypto';
import { criarApp } from '../src/app.ts';
import { perfilPorId } from '../src/acesso/modelo.ts';
import { emitirToken, type Perfil } from '../src/auth.ts';
import { carregarConfig } from '../src/config.ts';
import type { Contexto } from '../src/contexto.ts';
import { abrirDb, migrar } from '../src/db.ts';
import { GestorMemoria } from '../src/integracoes/identidade.ts';
import { assinaturaTwilio, MensageiroSimulado } from '../src/integracoes/mensageria.ts';
import { processarCampanhas } from '../src/servicos/campanhas.ts';
import { despacharMensagens, processarEventoCrm } from '../src/servicos/crm.ts';
import { publicarEventos } from '../src/servicos/rotinas.ts';
import { ProvedorPixSimulado, assinar } from '../src/integracoes/pix.ts';
import { PushSimulado } from '../src/integracoes/push.ts';
import { despacharPush } from '../src/servicos/push.ts';
import { semearDemo } from '../src/seed.ts';

/** Gera um CPF válido a partir de 9 dígitos. */
export function cpf(base: number): string {
  const d = String(base).padStart(9, '0').split('').map(Number);
  for (const n of [9, 10]) {
    const s = d.slice(0, n).reduce((acc, x, i) => acc + x * (n + 1 - i), 0);
    const r = (s * 10) % 11;
    d.push(r === 10 ? 0 : r);
  }
  return d.join('');
}

let seq = 100_000_000;

/** API em memória (PGlite) com os dados do piloto, para cada teste. */
export async function criarAmbiente(extra: Partial<Pick<Contexto, 'verificarOidc' | 'identidade'>> = {}) {
  const config = carregarConfig({ pgliteDir: undefined, databaseUrl: undefined });
  const db = await abrirDb({});
  await migrar(db);
  await semearDemo(db);
  let agora = new Date();
  const ctx: Contexto = {
    db,
    config,
    pix: new ProvedorPixSimulado({ segredoWebhook: config.segredoWebhookPix, chave: config.pixChave, recebedor: 'TESTE', cidade: 'FOZ' }),
    agora: () => agora,
    identidade: new GestorMemoria(),
    mensageiro: new MensageiroSimulado(),
    push: new PushSimulado(),
    ...extra,
  };
  const app = criarApp(ctx);
  const mensageiro = ctx.mensageiro as MensageiroSimulado;
  const push = ctx.push as PushSimulado;

  /** Roda o que o servidor roda a cada ciclo: publica eventos (CRM) e envia mensagens. */
  async function rodarRotinas() {
    await publicarEventos(ctx, (e, q) => processarEventoCrm(q, ctx, e), (_e, erro) => {
      throw erro;
    });
    await processarCampanhas(ctx);
    const r = await despacharMensagens(ctx, ctx.mensageiro);
    await despacharPush(ctx);
    // Mais um ciclo: a situação dos envios da campanha acompanha a entrega.
    await processarCampanhas(ctx);
    return r;
  }

  /** Webhook da Twilio assinado como a Twilio assina. */
  async function twilio(caminho: string, params: Record<string, string>, assinatura?: string) {
    const r = await app.inject({
      method: 'POST',
      url: caminho,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-twilio-signature': assinatura ?? assinaturaTwilio('dev-twilio-token', `${config.urlPublica}${caminho}`, params),
      },
      payload: new URLSearchParams(params).toString(),
    });
    return { status: r.statusCode, corpo: r.body };
  }

  async function req<T = any>(metodo: string, url: string, o: { token?: string; corpo?: unknown; idem?: boolean | string; headers?: Record<string, string> } = {}) {
    const headers: Record<string, string> = { ...o.headers };
    if (o.token) headers.authorization = `Bearer ${o.token}`;
    if (o.idem) headers['idempotency-key'] = typeof o.idem === 'string' ? o.idem : randomUUID();
    if (o.corpo !== undefined) headers['content-type'] = 'application/json';
    const r = await app.inject({ method: metodo as 'GET', url, headers, payload: o.corpo === undefined ? undefined : JSON.stringify(o.corpo) });
    const corpo = r.body ? (r.headers['content-type']?.toString().includes('json') ? r.json() : r.body) : undefined;
    return { status: r.statusCode, corpo: corpo as T };
  }

  const equipe = (perfil: Perfil, loja_id?: string) => emitirToken({ sub: `${perfil}-teste`, perfil, loja_id }, config.segredoToken);

  /** Token de desenvolvimento com um perfil de acesso novo (ex.: epyx-suporte). */
  const acesso = (perfilAcesso: string, loja_id?: string, sub = `${perfilAcesso}-${loja_id ?? 'x'}`) => {
    const p = perfilPorId.get(perfilAcesso);
    if (!p) throw new Error(`perfil ${perfilAcesso} não existe`);
    return emitirToken({ sub, perfil: p.id, perfis_acesso: [p.id], organizacao: p.organizacao, loja_id }, config.segredoToken);
  };

  async function novoCliente(nome = 'Cliente Teste', extra: Record<string, unknown> = {}) {
    const r = await req('POST', '/v1/clientes', {
      corpo: { cpf: cpf(seq++), nome, whatsapp: `+55119${String(seq).slice(-8)}`, aceite_termos: true, versao_termos: 'v1', ...extra },
    });
    if (r.status !== 201) throw new Error(`cadastro falhou: ${JSON.stringify(r.corpo)}`);
    return r.corpo.token as string;
  }

  async function produto(nome: string) {
    const r = await db.query<{ id: string; loja_id: string; estoque: number; codigo_barras: string; preco_usd_centavos: number }>(
      'select id, loja_id, estoque, codigo_barras, preco_usd_centavos from produto where nome like $1',
      [`${nome}%`],
    );
    if (!r.rows[0]) throw new Error(`produto ${nome} não existe no seed`);
    return r.rows[0];
  }

  /** Cria o pedido e a cobrança Pix; devolve o pedido em AGUARDANDO_PIX. */
  async function pedidoComPix(token: string, corpo: unknown) {
    const p = await req('POST', '/v1/pedidos', { token, corpo, idem: true });
    if (p.status !== 201) throw new Error(`pedido falhou: ${JSON.stringify(p.corpo)}`);
    const pix = await req('POST', `/v1/pedidos/${p.corpo.id}/pix`, { token, idem: true });
    if (pix.status !== 201) throw new Error(`pix falhou: ${JSON.stringify(pix.corpo)}`);
    return pix.corpo;
  }

  /** Envia o webhook assinado do provedor, como o banco do cliente faria. */
  async function webhook(txid: string, valorCentavos: number, endToEndId = `E${randomUUID().replaceAll('-', '')}`) {
    const corpo = JSON.stringify({ pix: [{ endToEndId, txid, valor: (valorCentavos / 100).toFixed(2), horario: new Date().toISOString() }] });
    const r = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/pix',
      headers: { 'content-type': 'application/json', 'x-pix-signature': assinar(corpo, config.segredoWebhookPix) },
      payload: corpo,
    });
    return { status: r.statusCode, corpo: r.json() };
  }

  async function lancamentos(pedidoId: string) {
    return (
      await db.query<{ conta_debito: string; conta_credito: string; valor_centavos: number; tipo: string; loja_id: string | null }>(
        `select l.* from lancamento l left join pagamento g on g.id = l.pagamento_id left join ocorrencia o on o.id = l.ocorrencia_id
         where coalesce(g.pedido_id, o.pedido_id) = $1 order by l.criado_em, l.tipo`,
        [pedidoId],
      )
    ).rows;
  }

  return {
    app,
    db,
    config,
    ctx,
    req,
    equipe,
    acesso,
    mensageiro,
    push,
    rodarRotinas,
    twilio,
    novoCliente,
    produto,
    pedidoComPix,
    webhook,
    lancamentos,
    avancar: (ms: number) => {
      agora = new Date(agora.getTime() + ms);
    },
    fechar: async () => {
      await app.close();
      await db.fechar();
    },
  };
}

export type Ambiente = Awaited<ReturnType<typeof criarAmbiente>>;
