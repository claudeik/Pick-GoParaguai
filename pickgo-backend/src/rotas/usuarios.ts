import { z } from 'zod';
import { exigirPermissao, ehEquipe, tem, type Usuario } from '../auth.ts';
import { PERFIS_ACESSO, PERMISSOES, perfilPorId, podeConceder, type Organizacao } from '../acesso/modelo.ts';
import { validar, type Modulo } from '../contexto.ts';
import { ErroHttp, invalido, naoEncontrado, proibido } from '../erros.ts';
import { gerarSenhaTemporaria, type UsuarioEquipe } from '../integracoes/identidade.ts';
import { auditar } from '../servicos/registro.ts';

// Gestão de usuários da equipe (seção 11). Regras:
// - Gerente de loja gerencia só a equipe da própria loja, com perfis de loja.
// - Administrador EPYX gerencia só a equipe EPYX.
// - Administrador do Portal gerencia todas as organizações.
// - Ninguém muda o próprio perfil nem se bloqueia.
// - Só se edita quem tem um perfil que você poderia conceder (sem escalar privilégio).

const ORGANIZACOES = ['PORTAL', 'EPYX', 'LOJA'] as const;

const novo = z.object({
  email: z.email().max(200),
  nome: z.string().trim().min(3).max(120),
  organizacao: z.enum(ORGANIZACOES),
  loja_id: z.string().max(60).optional(),
  perfil: z.string().max(60),
});

const alteracao = z.object({
  nome: z.string().trim().min(3).max(120).optional(),
  ativo: z.boolean().optional(),
  perfil: z.string().max(60).optional(),
});

/** Organizações (e loja) que o usuário pode ver e gerenciar. */
function escopo(u: Usuario): { organizacao?: Organizacao; loja_id?: string } {
  if (u.organizacao === 'LOJA') return { organizacao: 'LOJA', loja_id: u.loja_id };
  if (u.organizacao === 'EPYX') return { organizacao: 'EPYX' };
  return {};
}

function noEscopo(u: Usuario, alvo: { organizacao: Organizacao | null; loja_id: string | null }) {
  const e = escopo(u);
  if (e.organizacao && alvo.organizacao !== e.organizacao) return false;
  if (e.loja_id && alvo.loja_id !== e.loja_id) return false;
  return true;
}

const podeEditar = (u: Usuario, alvo: UsuarioEquipe) =>
  alvo.id !== u.sub && noEscopo(u, alvo) && (!alvo.perfil || podeConceder(u.perfis_acesso ?? [], alvo.perfil));

export const rotasUsuarios: Modulo = (app, { db, identidade }) => {
  const nomeDaLoja = async (id: string | null | undefined) =>
    id ? ((await db.query<{ nome: string }>('select nome from loja where id = $1', [id])).rows[0]?.nome ?? null) : null;

  /** Quem sou eu e o que posso ver e editar (o front monta as abas com isto). */
  app.get('/v1/acesso/eu', async (req) => {
    const u = req.usuario;
    if (!u || !ehEquipe(u)) throw new ErroHttp(401, 'nao-autenticado', 'entre com a conta da equipe');
    return {
      sub: u.sub,
      nome: u.nome ?? null,
      email: u.email ?? null,
      organizacao: u.organizacao ?? null,
      loja_id: u.loja_id ?? null,
      loja_nome: await nomeDaLoja(u.loja_id),
      perfis: (u.perfis_acesso ?? []).map((id) => ({ id, nome: perfilPorId.get(id)?.nome ?? id })),
      permissoes: [...(u.permissoes ?? [])].sort(),
    };
  });

  /** Catálogo de permissões e perfis, para a matriz de acesso na tela. */
  app.get('/v1/acesso/modelo', async (req) => {
    const u = req.usuario;
    if (!u || !ehEquipe(u)) throw new ErroHttp(401, 'nao-autenticado', 'entre com a conta da equipe');
    return { permissoes: PERMISSOES, perfis: PERFIS_ACESSO, gestor: identidade.tipo };
  });

  app.get('/v1/usuarios', async (req) => {
    const u = exigirPermissao(req, 'usuarios.ver');
    const f = validar(z.object({ organizacao: z.enum(ORGANIZACOES).optional(), loja_id: z.string().optional() }), req.query);
    const e = escopo(u);
    const lista = await identidade.listar({ organizacao: e.organizacao ?? f.organizacao, loja_id: e.loja_id ?? f.loja_id });
    const gerencia = tem(u, 'usuarios.gerenciar');
    return {
      usuarios: lista.filter((x) => noEscopo(u, x)).map((x) => ({ ...x, pode_editar: gerencia && podeEditar(u, x) })),
      perfis_que_concedo: gerencia ? PERFIS_ACESSO.filter((p) => podeConceder(u.perfis_acesso ?? [], p.id) && noEscopo(u, { organizacao: p.organizacao, loja_id: u.loja_id ?? null })).map((p) => p.id) : [],
      escopo: e,
    };
  });

  app.post('/v1/usuarios', async (req, rep) => {
    const u = exigirPermissao(req, 'usuarios.gerenciar');
    const d = validar(novo, req.body);
    const perfil = perfilPorId.get(d.perfil);
    if (!perfil) throw invalido(`perfil ${d.perfil} não existe`);
    if (perfil.organizacao !== d.organizacao) throw invalido(`o perfil ${perfil.nome} é da organização ${perfil.organizacao}`);
    if (!podeConceder(u.perfis_acesso ?? [], d.perfil)) throw proibido(`seu perfil não concede ${perfil.nome}`);

    let lojaId: string | null = null;
    if (d.organizacao === 'LOJA') {
      lojaId = u.organizacao === 'LOJA' ? u.loja_id! : (d.loja_id ?? null);
      if (!lojaId) throw invalido('informe a loja do usuário');
      if (d.loja_id && d.loja_id !== lojaId) throw proibido('você só cadastra usuários da sua loja');
      if (!(await nomeDaLoja(lojaId))) throw naoEncontrado('loja');
    } else if (d.loja_id) throw invalido('só usuários de loja têm loja');
    if (!noEscopo(u, { organizacao: d.organizacao, loja_id: lojaId })) throw proibido('fora da sua organização');

    const senha = gerarSenhaTemporaria();
    const criado = await identidade.criar({ email: d.email, nome: d.nome, organizacao: d.organizacao, loja_id: lojaId, perfil: d.perfil, senhaTemporaria: senha });
    await db.tx((q) => auditar(q, u, 'usuario.criar', 'usuario', criado.id, { email: criado.email, organizacao: d.organizacao, loja_id: lojaId, perfil: d.perfil }));
    // A senha temporária aparece só nesta resposta; o Keycloak pede uma nova no primeiro acesso.
    return rep.code(201).send({ usuario: criado, senha_temporaria: senha });
  });

  const alvoEditavel = async (u: Usuario, id: string) => {
    const alvo = await identidade.obter(id);
    if (!alvo || !noEscopo(u, alvo)) throw naoEncontrado('usuário');
    if (alvo.id === u.sub) throw proibido('você não pode alterar o próprio acesso; peça a outro administrador');
    if (alvo.perfil && !podeConceder(u.perfis_acesso ?? [], alvo.perfil)) throw proibido('este usuário tem um perfil acima do seu');
    return alvo;
  };

  app.patch<{ Params: { id: string } }>('/v1/usuarios/:id', async (req) => {
    const u = exigirPermissao(req, 'usuarios.gerenciar');
    const d = validar(alteracao, req.body);
    const alvo = await alvoEditavel(u, req.params.id);
    if (d.perfil) {
      const p = perfilPorId.get(d.perfil);
      if (!p) throw invalido(`perfil ${d.perfil} não existe`);
      if (p.organizacao !== alvo.organizacao) throw invalido(`o perfil ${p.nome} é de outra organização`);
      if (!podeConceder(u.perfis_acesso ?? [], d.perfil)) throw proibido(`seu perfil não concede ${p.nome}`);
    }
    const r = await identidade.atualizar(alvo.id, d);
    await db.tx((q) => auditar(q, u, 'usuario.alterar', 'usuario', alvo.id, { antes: { nome: alvo.nome, ativo: alvo.ativo, perfil: alvo.perfil }, depois: d }));
    return { ...r, pode_editar: true };
  });

  app.post<{ Params: { id: string } }>('/v1/usuarios/:id/senha-temporaria', async (req) => {
    const u = exigirPermissao(req, 'usuarios.gerenciar');
    const alvo = await alvoEditavel(u, req.params.id);
    const senha = gerarSenhaTemporaria();
    await identidade.definirSenhaTemporaria(alvo.id, senha);
    await db.tx((q) => auditar(q, u, 'usuario.senha_temporaria', 'usuario', alvo.id));
    return { senha_temporaria: senha };
  });
};
