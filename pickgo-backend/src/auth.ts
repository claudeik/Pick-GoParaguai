import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { PERFIL_LEGADO, permissoesDe, perfilPorId, type Organizacao, type Permissao } from './acesso/modelo.ts';
import { ErroHttp, proibido } from './erros.ts';

// Identidade (seção 11).
// - Equipe (Portal, EPYX e lojas): token do Keycloak (OIDC), validado pela chave
//   pública do realm. Perfis de acesso vêm dos papéis; organização e loja, dos atributos.
// - Turista: token próprio assinado com HMAC (cadastro por CPF), até o login por código.
// - Desenvolvimento e testes: token HMAC da equipe pelo /v1/dev/login, desligado em produção.

// 'integracao' é o sistema da loja, autenticado pela chave de API (x-chave-loja), nunca por token.
export const PERFIS = ['cliente', 'lojista', 'operador', 'central', 'admin', 'integracao'] as const;
export type Perfil = (typeof PERFIS)[number];

export interface Usuario {
  sub: string;
  /** 'cliente', 'integracao' ou, para a equipe, o perfil de acesso principal (ex.: portal-central). */
  perfil: string;
  organizacao?: Organizacao;
  /** Quem é de loja fica preso a ela. */
  loja_id?: string;
  perfis_acesso?: string[];
  permissoes?: Set<Permissao>;
  nome?: string;
  email?: string;
  exp: number;
}

interface ClaimsHmac {
  sub: string;
  perfil: string;
  loja_id?: string;
  organizacao?: Organizacao;
  perfis_acesso?: string[];
  nome?: string;
  exp: number;
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');

export function emitirToken(u: Omit<ClaimsHmac, 'exp'>, segredo: string, horas = 12): string {
  const corpo = b64(JSON.stringify({ ...u, exp: Math.floor(Date.now() / 1000) + horas * 3600 }));
  return `${corpo}.${createHmac('sha256', segredo).update(corpo).digest('base64url')}`;
}

/** Completa organização e permissões a partir dos perfis de acesso (ou do perfil antigo). */
function completar(c: ClaimsHmac): Usuario {
  if (c.perfil === 'cliente' || c.perfil === 'integracao') return { ...c, permissoes: new Set() };
  const perfis = c.perfis_acesso?.length ? c.perfis_acesso : PERFIL_LEGADO[c.perfil] ? [PERFIL_LEGADO[c.perfil]!] : [];
  const organizacao = c.organizacao ?? perfilPorId.get(perfis[0] ?? '')?.organizacao;
  return {
    ...c,
    perfil: c.perfis_acesso?.length ? perfis[0]! : c.perfil,
    organizacao,
    perfis_acesso: perfis,
    permissoes: permissoesDe(perfis),
  };
}

export function lerToken(token: string, segredo: string): Usuario | null {
  const [corpo, assinatura, sobra] = token.split('.');
  if (!corpo || !assinatura || sobra !== undefined) return null;
  const esperada = Buffer.from(createHmac('sha256', segredo).update(corpo).digest('base64url'));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null;
  const c = JSON.parse(Buffer.from(corpo, 'base64url').toString()) as ClaimsHmac;
  if (c.exp < Date.now() / 1000) return null;
  return completar(c);
}

export interface ConfigOidc {
  /** ex.: http://localhost:8080/realms/pickgo */
  emissor: string;
  /** Audiência que o token precisa ter (client da API). */
  audiencia: string;
  /** Chaves de assinatura; nos testes, um conjunto local. */
  chaves?: JWTVerifyGetKey;
}

/** Valida tokens do Keycloak e os converte em Usuario. */
export function criarVerificadorOidc(c: ConfigOidc) {
  const chaves = c.chaves ?? createRemoteJWKSet(new URL(`${c.emissor}/protocol/openid-connect/certs`));
  return async (token: string): Promise<Usuario | null> => {
    try {
      const { payload: p } = await jwtVerify(token, chaves, { issuer: c.emissor, audience: c.audiencia, algorithms: ['RS256', 'ES256', 'PS256'] });
      const papeis = ((p.realm_access as { roles?: string[] } | undefined)?.roles ?? []).filter((r) => perfilPorId.has(r));
      const organizacao = p.organizacao as Organizacao | undefined;
      // Perfil de outra organização não vale (ex.: papel portal-admin num usuário de loja).
      const perfis = papeis.filter((r) => perfilPorId.get(r)!.organizacao === organizacao);
      if (!p.sub || !organizacao || !perfis.length) return null;
      if (organizacao === 'LOJA' && !p.loja_id) return null;
      return {
        sub: p.sub,
        perfil: perfis[0]!,
        organizacao,
        loja_id: organizacao === 'LOJA' ? String(p.loja_id) : undefined,
        perfis_acesso: perfis,
        permissoes: permissoesDe(perfis),
        nome: (p.name as string | undefined) ?? (p.preferred_username as string | undefined),
        email: p.email as string | undefined,
        exp: p.exp ?? 0,
      };
    } catch {
      return null;
    }
  };
}

declare module 'fastify' {
  interface FastifyRequest {
    usuario?: Usuario;
    corpoBruto?: string;
  }
}

function autenticado(req: FastifyRequest): Usuario {
  const u = req.usuario;
  if (!u) throw new ErroHttp(401, 'nao-autenticado', 'envie Authorization: Bearer <token>');
  return u;
}

/** Exige usuário autenticado; com perfis, só 'cliente' ainda é checado assim. */
export function exigir(req: FastifyRequest, ...perfis: Perfil[]): Usuario {
  const u = autenticado(req);
  if (perfis.length && !perfis.includes(u.perfil as Perfil)) throw proibido();
  return u;
}

export const ehEquipe = (u: Usuario) => u.perfil !== 'cliente' && u.perfil !== 'integracao';
export const ehDaLoja = (u: Usuario) => u.organizacao === 'LOJA';
export const tem = (u: Usuario, p: Permissao) => !!u.permissoes?.has(p);

/** Exige alguém da equipe com pelo menos uma das permissões. */
export function exigirPermissao(req: FastifyRequest, ...permissoes: Permissao[]): Usuario {
  const u = autenticado(req);
  if (!ehEquipe(u) || !permissoes.some((p) => tem(u, p))) {
    throw proibido(`seu perfil não tem a permissão ${permissoes.join(' ou ')}`);
  }
  return u;
}

/** Turista dono do recurso, ou equipe com a permissão. */
export function exigirClienteOu(req: FastifyRequest, ...permissoes: Permissao[]): Usuario {
  const u = autenticado(req);
  if (u.perfil === 'cliente') return u;
  return exigirPermissao(req, ...permissoes);
}

/** Ator registrado na auditoria e nos campos "quem fez": único e legível (e-mail na equipe do Keycloak). */
export const ator = (u: Usuario) => `${u.perfil}:${u.email ?? u.sub}`;
