import { randomInt, randomUUID } from 'node:crypto';
import { PERFIS_ACESSO, perfilPorId, type Organizacao } from '../acesso/modelo.ts';
import { conflito, ErroHttp, naoEncontrado } from '../erros.ts';

// Gestão dos usuários da equipe (Portal, EPYX e lojas). O Keycloak guarda
// usuário, senha e papéis; o Pick & Go só decide quem pode criar e editar quem.
// GestorMemoria serve aos testes e ao modo demonstração sem Keycloak.

export interface UsuarioEquipe {
  id: string;
  email: string;
  nome: string;
  ativo: boolean;
  organizacao: Organizacao | null;
  loja_id: string | null;
  /** Perfil de acesso do Pick & Go (um por usuário). */
  perfil: string | null;
  criado_em: string | null;
}

export interface NovoUsuario {
  email: string;
  nome: string;
  organizacao: Organizacao;
  loja_id: string | null;
  perfil: string;
  senhaTemporaria: string;
}

export interface FiltroUsuarios {
  organizacao?: Organizacao;
  loja_id?: string;
}

export interface GestorIdentidade {
  readonly tipo: 'keycloak' | 'memoria';
  listar(f: FiltroUsuarios): Promise<UsuarioEquipe[]>;
  obter(id: string): Promise<UsuarioEquipe | null>;
  criar(d: NovoUsuario): Promise<UsuarioEquipe>;
  atualizar(id: string, d: { nome?: string; ativo?: boolean; perfil?: string }): Promise<UsuarioEquipe>;
  definirSenhaTemporaria(id: string, senha: string): Promise<void>;
}

/** Senha temporária que atende à política do realm (10+ caracteres, maiúscula, minúscula, número e símbolo). */
export function gerarSenhaTemporaria(): string {
  const grupos = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '@#%&*+!?'];
  const todos = grupos.join('');
  const chars = grupos.map((g) => g[randomInt(g.length)]!);
  while (chars.length < 14) chars.push(todos[randomInt(todos.length)]!);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}

const separarNome = (nome: string) => {
  const [primeiro = '', ...resto] = nome.trim().split(/\s+/);
  return { firstName: primeiro, lastName: resto.join(' ') };
};

// --- Memória ---

export class GestorMemoria implements GestorIdentidade {
  readonly tipo = 'memoria' as const;
  private usuarios = new Map<string, UsuarioEquipe & { senha?: string }>();

  constructor(iniciais: Omit<NovoUsuario, 'senhaTemporaria'>[] = []) {
    for (const u of iniciais) void this.criar({ ...u, senhaTemporaria: '' });
  }

  async listar(f: FiltroUsuarios) {
    return [...this.usuarios.values()]
      .filter((u) => (!f.organizacao || u.organizacao === f.organizacao) && (!f.loja_id || u.loja_id === f.loja_id))
      .map(({ senha: _, ...u }) => u)
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }

  async obter(id: string) {
    const u = this.usuarios.get(id);
    if (!u) return null;
    const { senha: _, ...r } = u;
    return r;
  }

  async criar(d: NovoUsuario) {
    const email = d.email.toLowerCase();
    if ([...this.usuarios.values()].some((u) => u.email === email)) throw conflito('email-em-uso', 'já existe usuário com este e-mail');
    const u = {
      id: randomUUID(),
      email,
      nome: d.nome,
      ativo: true,
      organizacao: d.organizacao,
      loja_id: d.loja_id,
      perfil: d.perfil,
      criado_em: new Date().toISOString(),
      senha: d.senhaTemporaria,
    };
    this.usuarios.set(u.id, u);
    return (await this.obter(u.id))!;
  }

  async atualizar(id: string, d: { nome?: string; ativo?: boolean; perfil?: string }) {
    const u = this.usuarios.get(id);
    if (!u) throw naoEncontrado('usuário');
    Object.assign(u, Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)));
    return (await this.obter(id))!;
  }

  async definirSenhaTemporaria(id: string, senha: string) {
    const u = this.usuarios.get(id);
    if (!u) throw naoEncontrado('usuário');
    u.senha = senha;
  }
}

// --- Keycloak (API de administração, com a conta de serviço do client da API) ---

interface RepUsuario {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
  createdTimestamp?: number;
  attributes?: Record<string, string[]>;
  serviceAccountClientId?: string;
}

export class GestorKeycloak implements GestorIdentidade {
  readonly tipo = 'keycloak' as const;
  private token: { valor: string; expira: number } | null = null;
  private base: string;
  private o: { url: string; realm: string; clientId: string; clientSecret: string };

  constructor(o: { url: string; realm: string; clientId: string; clientSecret: string }) {
    this.o = o;
    this.base = `${o.url}/admin/realms/${encodeURIComponent(o.realm)}`;
  }

  private async obterToken(): Promise<string> {
    if (this.token && this.token.expira > Date.now() + 10_000) return this.token.valor;
    const r = await fetch(`${this.o.url}/realms/${encodeURIComponent(this.o.realm)}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: this.o.clientId, client_secret: this.o.clientSecret }),
    });
    if (!r.ok) throw new ErroHttp(502, 'keycloak-indisponivel', `o Keycloak recusou a conta de serviço (${r.status})`);
    const j = (await r.json()) as { access_token: string; expires_in: number };
    this.token = { valor: j.access_token, expira: Date.now() + j.expires_in * 1000 };
    return j.access_token;
  }

  private async chamar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<{ status: number; dados: T; local: string | null }> {
    let r: Response;
    try {
      r = await fetch(`${this.base}${caminho}`, {
        method: metodo,
        headers: { authorization: `Bearer ${await this.obterToken()}`, ...(corpo === undefined ? {} : { 'content-type': 'application/json' }) },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
    } catch (e) {
      if (e instanceof ErroHttp) throw e;
      throw new ErroHttp(502, 'keycloak-indisponivel', 'não foi possível falar com o Keycloak');
    }
    const texto = await r.text();
    if (r.status === 409) throw conflito('email-em-uso', 'já existe usuário com este e-mail');
    if (r.status === 404) throw naoEncontrado('usuário');
    if (!r.ok) throw new ErroHttp(502, 'keycloak-erro', `Keycloak respondeu ${r.status}: ${texto.slice(0, 200)}`);
    return { status: r.status, dados: (texto ? JSON.parse(texto) : undefined) as T, local: r.headers.get('location') };
  }

  /** Mapa usuário → perfil, lendo os membros de cada papel do Pick & Go. */
  private async perfis(): Promise<Map<string, string>> {
    const m = new Map<string, string>();
    for (const p of PERFIS_ACESSO) {
      const r = await this.chamar<{ id: string }[]>('GET', `/roles/${p.id}/users?briefRepresentation=true&first=0&max=10000`);
      for (const u of r.dados) if (!m.has(u.id)) m.set(u.id, p.id);
    }
    return m;
  }

  private converter(u: RepUsuario, perfil: string | null): UsuarioEquipe {
    return {
      id: u.id,
      email: u.email ?? u.username,
      nome: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username,
      ativo: u.enabled,
      organizacao: (u.attributes?.organizacao?.[0] as Organizacao | undefined) ?? null,
      loja_id: u.attributes?.loja_id?.[0] ?? null,
      perfil,
      criado_em: u.createdTimestamp ? new Date(u.createdTimestamp).toISOString() : null,
    };
  }

  async listar(f: FiltroUsuarios) {
    const q = [f.organizacao && `organizacao:${f.organizacao}`, f.loja_id && `loja_id:${f.loja_id}`].filter(Boolean).join(' ');
    const r = await this.chamar<RepUsuario[]>('GET', `/users?briefRepresentation=false&first=0&max=2000${q ? `&q=${encodeURIComponent(q)}` : ''}`);
    const perfis = await this.perfis();
    return r.dados
      .filter((u) => !u.serviceAccountClientId && !u.username.startsWith('service-account-') && u.attributes?.organizacao?.[0])
      .map((u) => this.converter(u, perfis.get(u.id) ?? null))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }

  async obter(id: string) {
    try {
      const u = (await this.chamar<RepUsuario>('GET', `/users/${encodeURIComponent(id)}`)).dados;
      const papeis = (await this.chamar<{ name: string }[]>('GET', `/users/${encodeURIComponent(id)}/role-mappings/realm`)).dados;
      return this.converter(u, papeis.find((p) => perfilPorId.has(p.name))?.name ?? null);
    } catch (e) {
      if (e instanceof ErroHttp && e.status === 404) return null;
      throw e;
    }
  }

  async criar(d: NovoUsuario) {
    const r = await this.chamar('POST', '/users', {
      username: d.email.toLowerCase(),
      email: d.email.toLowerCase(),
      ...separarNome(d.nome),
      enabled: true,
      emailVerified: false,
      attributes: { organizacao: [d.organizacao], ...(d.loja_id ? { loja_id: [d.loja_id] } : {}) },
      credentials: [{ type: 'password', value: d.senhaTemporaria, temporary: true }],
    });
    const id = r.local?.split('/').pop();
    if (!id) throw new ErroHttp(502, 'keycloak-erro', 'o Keycloak não devolveu o id do usuário');
    try {
      await this.trocarPerfil(id, d.perfil);
    } catch (e) {
      // Sem perfil o usuário não serve: desfaz a criação.
      await this.chamar('DELETE', `/users/${id}`).catch(() => undefined);
      throw e;
    }
    return (await this.obter(id))!;
  }

  private async trocarPerfil(id: string, perfil: string) {
    const atuais = (await this.chamar<{ id: string; name: string }[]>('GET', `/users/${id}/role-mappings/realm`)).dados.filter((p) => perfilPorId.has(p.name));
    if (atuais.length) await this.chamar('DELETE', `/users/${id}/role-mappings/realm`, atuais);
    const papel = (await this.chamar<{ id: string; name: string }>('GET', `/roles/${encodeURIComponent(perfil)}`)).dados;
    await this.chamar('POST', `/users/${id}/role-mappings/realm`, [papel]);
  }

  async atualizar(id: string, d: { nome?: string; ativo?: boolean; perfil?: string }) {
    if (d.nome !== undefined || d.ativo !== undefined) {
      const atual = (await this.chamar<RepUsuario>('GET', `/users/${encodeURIComponent(id)}`)).dados;
      await this.chamar('PUT', `/users/${encodeURIComponent(id)}`, {
        ...atual,
        ...(d.nome !== undefined ? separarNome(d.nome) : {}),
        ...(d.ativo !== undefined ? { enabled: d.ativo } : {}),
      });
      // Bloqueado: encerra as sessões; o token de acesso já emitido vale até expirar (5 min).
      if (d.ativo === false) await this.chamar('POST', `/users/${encodeURIComponent(id)}/logout`);
    }
    if (d.perfil) await this.trocarPerfil(id, d.perfil);
    const u = await this.obter(id);
    if (!u) throw naoEncontrado('usuário');
    return u;
  }

  async definirSenhaTemporaria(id: string, senha: string) {
    await this.chamar('PUT', `/users/${encodeURIComponent(id)}/reset-password`, { type: 'password', value: senha, temporary: true });
  }
}
