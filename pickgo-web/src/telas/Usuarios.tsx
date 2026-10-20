import { useState, type FormEvent } from 'react';
import { criarApi, type Api, type Loja, type ModeloAcesso, type Organizacao, type UsuarioEquipe } from '../api.ts';
import { CaixaErro, Cartao, Dialogo, PedirLogin, SemPermissao, useAcao, Vazio } from '../componentes/comum.tsx';
import { useEquipe } from '../equipe.tsx';
import { fmtData } from '../formato.ts';
import { useApiEquipe, useCarga, useSessao } from '../sessao.tsx';

// Gestão de usuários da equipe (seção 11): cada loja cuida da própria equipe,
// a EPYX da sua, e o Portal de todas. Usuário, senha e papéis ficam no Keycloak.

const NOME_ORG: Record<Organizacao, string> = { PORTAL: 'Portal Paraguai', EPYX: 'EPYX', LOJA: 'Loja' };

export function Usuarios() {
  const { api, erro, precisaLogin } = useApiEquipe('admin', 'admin-portal');
  const { pode } = useEquipe();
  if (precisaLogin) return <PedirLogin />;
  if (erro) return <CaixaErro erro={erro} />;
  if (!pode('usuarios.ver')) return <SemPermissao oQue="usuários e acesso" />;
  if (!api) return <p className="carregando">Entrando…</p>;
  return <PainelUsuarios api={api} />;
}

function PainelUsuarios({ api }: { api: Api }) {
  const { pode } = useEquipe();
  const [org, setOrg] = useState<Organizacao | ''>('');
  const [lojaId, setLojaId] = useState('');
  const [criando, setCriando] = useState(false);
  const [senha, setSenha] = useState<{ email: string; senha: string } | null>(null);
  const modelo = useCarga(() => api.modeloAcesso(), [api]);
  const lojas = useCarga(() => criarApi(null).lojas(), []);
  const lista = useCarga(() => api.usuarios({ organizacao: org || undefined, loja_id: lojaId || undefined }), [api, org, lojaId]);
  const escopo = lista.dados?.escopo ?? {};
  const concedo = lista.dados?.perfis_que_concedo ?? [];
  const nomePerfil = (id: string | null) => modelo.dados?.perfis.find((p) => p.id === id)?.nome ?? id ?? '—';
  const nomeLoja = (id: string | null) => (id ? (lojas.dados?.lojas.find((l) => l.id === id)?.nome ?? id) : '—');

  return (
    <>
      <Cartao
        tag="Seção 11 · Keycloak"
        titulo="Usuários da equipe"
        extra={
          pode('usuarios.gerenciar') && concedo.length > 0 ? (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setCriando(true)}>
              + Novo usuário
            </button>
          ) : undefined
        }
      >
        <p className="texto-apoio">
          {escopo.loja_id
            ? `Equipe da ${nomeLoja(escopo.loja_id)}.`
            : escopo.organizacao === 'EPYX'
              ? 'Equipe da EPYX.'
              : 'Equipes do Portal Paraguai, da EPYX e das lojas.'}{' '}
          {modelo.dados?.gestor === 'memoria' && <strong>Modo demonstração: usuários em memória, sem Keycloak.</strong>}
        </p>

        {!escopo.organizacao && (
          <div className="filtros-gestao">
            <select className="form-control" aria-label="Organização" value={org} onChange={(e) => (setOrg(e.target.value as Organizacao | ''), setLojaId(''))}>
              <option value="">Todas as organizações</option>
              <option value="PORTAL">Portal Paraguai</option>
              <option value="EPYX">EPYX</option>
              <option value="LOJA">Lojas</option>
            </select>
            {org === 'LOJA' && (
              <select className="form-control" aria-label="Loja" value={lojaId} onChange={(e) => setLojaId(e.target.value)}>
                <option value="">Todas as lojas</option>
                {lojas.dados?.lojas.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {lista.erro && <CaixaErro erro={lista.erro} onTentar={lista.recarregar} />}
        {lista.dados?.usuarios.length === 0 && <Vazio>Nenhum usuário.</Vazio>}
        {!!lista.dados?.usuarios.length && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th>Organização</th>
                  <th>Perfil</th>
                  <th>Acesso</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lista.dados.usuarios.map((u) => (
                  <LinhaUsuario
                    key={u.id}
                    u={u}
                    api={api}
                    modelo={modelo.dados}
                    concedo={concedo}
                    nomeLoja={nomeLoja}
                    nomePerfil={nomePerfil}
                    aoMudar={lista.recarregar}
                    aoSenha={(s) => setSenha({ email: u.email, senha: s })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Dialogo aberto={!!senha} aoFechar={() => setSenha(null)} titulo="🔑 Senha temporária">
          {senha && <SenhaGerada email={senha.email} senha={senha.senha} aoFechar={() => setSenha(null)} />}
        </Dialogo>

        <Dialogo aberto={criando} aoFechar={() => setCriando(false)} titulo="Novo usuário da equipe">
          {criando && modelo.dados && (
            <FormNovoUsuario
              api={api}
              modelo={modelo.dados}
              concedo={concedo}
              lojas={lojas.dados?.lojas ?? []}
              lojaFixa={escopo.loja_id}
              aoCriar={async (email, s) => {
                setCriando(false);
                setSenha({ email, senha: s });
                await lista.recarregar();
              }}
            />
          )}
        </Dialogo>
      </Cartao>

      {modelo.dados && <MatrizAcesso modelo={modelo.dados} />}
    </>
  );
}

/** A senha aparece uma vez só: janela com cópia e o passo a passo para entregar à pessoa. */
function SenhaGerada({ email, senha, aoFechar }: { email: string; senha: string; aoFechar: () => void }) {
  const { avisar } = useSessao();
  const [copiou, setCopiou] = useState(false);
  const copiar = () =>
    void navigator.clipboard?.writeText(senha).then(() => {
      setCopiou(true);
      avisar('Senha copiada.');
    });
  return (
    <div className="ficha">
      <p className="texto-apoio">
        Senha temporária de <strong>{email}</strong>. <strong>Ela não é enviada por e-mail</strong> e não aparece de novo: copie agora e entregue à pessoa por
        um canal seguro (pessoalmente, ligação ou mensagem direta).
      </p>
      <div className="busca">
        <input className="form-control copia-cola senha-grande" readOnly value={senha} aria-label="Senha temporária" onFocus={(e) => e.target.select()} />
        <button type="button" className="btn btn-sm btn-blue" onClick={copiar}>
          {copiou ? 'Copiada ✓' : 'Copiar'}
        </button>
      </div>
      <ol className="passos-senha">
        <li>
          A pessoa abre <code>{location.origin}</code> e clica em <strong>Entrar (equipe)</strong>.
        </li>
        <li>
          Usuário: <code>{email}</code> · senha: a temporária acima.
        </li>
        <li>O sistema pede uma senha nova (10+ caracteres, com maiúscula, minúscula, número e símbolo).</li>
      </ol>
      <button type="button" className="btn btn-primary btn-block" onClick={aoFechar}>
        Já entreguei a senha
      </button>
    </div>
  );
}

function LinhaUsuario({
  u,
  api,
  modelo,
  concedo,
  nomeLoja,
  nomePerfil,
  aoMudar,
  aoSenha,
}: {
  u: UsuarioEquipe;
  api: Api;
  modelo: ModeloAcesso | null;
  concedo: string[];
  nomeLoja: (id: string | null) => string;
  nomePerfil: (id: string | null) => string;
  aoMudar: () => Promise<void>;
  aoSenha: (senha: string) => void;
}) {
  const { ocupado, executar } = useAcao();
  const opcoes = (modelo?.perfis ?? []).filter((p) => p.organizacao === u.organizacao && concedo.includes(p.id));
  const alterar = (d: { ativo?: boolean; perfil?: string }, ok: string) =>
    executar('alterar', async () => {
      await api.alterarUsuario(u.id, d);
      await aoMudar();
    }, ok);

  return (
    <tr className={u.ativo ? '' : 'linha-inativa'}>
      <td>
        <strong>{u.nome}</strong>
        <div className="nota">
          {u.email}
          {u.criado_em && <> · desde {fmtData(u.criado_em).split(' ')[0]}</>}
        </div>
      </td>
      <td>
        {u.organizacao ? NOME_ORG[u.organizacao] : '—'}
        {u.organizacao === 'LOJA' && <div className="nota">{nomeLoja(u.loja_id)}</div>}
      </td>
      <td>
        {u.pode_editar && opcoes.length > 1 ? (
          <select
            className="form-control"
            aria-label={`Perfil de ${u.nome}`}
            value={u.perfil ?? ''}
            disabled={!!ocupado}
            onChange={(e) => void alterar({ perfil: e.target.value }, `${u.nome}: perfil ${nomePerfil(e.target.value)}.`)}
          >
            {opcoes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        ) : (
          nomePerfil(u.perfil)
        )}
      </td>
      <td>
        {u.pode_editar ? (
          <label className="chave">
            <input
              type="checkbox"
              checked={u.ativo}
              disabled={!!ocupado}
              onChange={(e) => {
                if (!e.target.checked && !confirm(`Bloquear o acesso de ${u.nome}? As sessões abertas são encerradas.`)) return;
                void alterar({ ativo: e.target.checked }, e.target.checked ? `${u.nome} pode entrar de novo.` : `${u.nome} bloqueado.`);
              }}
            />
            <span>{u.ativo ? 'Ativo' : 'Bloqueado'}</span>
          </label>
        ) : (
          <span className={`badge ${u.ativo ? 'badge-green' : 'badge-gray'}`}>{u.ativo ? 'Ativo' : 'Bloqueado'}</span>
        )}
      </td>
      <td>
        {u.pode_editar && (
          <button
            type="button"
            className="btn btn-sm btn-outline"
            disabled={!!ocupado}
            onClick={() => {
              if (!confirm(`Gerar uma senha temporária para ${u.nome}? A senha atual deixa de valer.`)) return;
              void executar('senha', async () => aoSenha((await api.senhaTemporaria(u.id)).senha_temporaria));
            }}
          >
            Nova senha
          </button>
        )}
      </td>
    </tr>
  );
}

function FormNovoUsuario({
  api,
  modelo,
  concedo,
  lojas,
  lojaFixa,
  aoCriar,
}: {
  api: Api;
  modelo: ModeloAcesso;
  concedo: string[];
  lojas: Loja[];
  lojaFixa?: string;
  aoCriar: (email: string, senha: string) => Promise<void>;
}) {
  const { avisarErro } = useSessao();
  const [enviando, setEnviando] = useState(false);
  const orgs = [...new Set(modelo.perfis.filter((p) => concedo.includes(p.id)).map((p) => p.organizacao))];
  const [f, setF] = useState({ nome: '', email: '', organizacao: orgs[0] ?? 'LOJA', loja_id: lojaFixa ?? lojas[0]?.id ?? '', perfil: '' });
  const perfis = modelo.perfis.filter((p) => p.organizacao === f.organizacao && concedo.includes(p.id));
  const perfil = perfis.find((p) => p.id === f.perfil) ?? perfis[0];

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!perfil) return;
    setEnviando(true);
    try {
      const r = await api.criarUsuario({
        nome: f.nome.trim(),
        email: f.email.trim(),
        organizacao: f.organizacao,
        perfil: perfil.id,
        loja_id: f.organizacao === 'LOJA' && !lojaFixa ? f.loja_id : undefined,
      });
      await aoCriar(r.usuario.email, r.senha_temporaria);
    } catch (err) {
      avisarErro(err);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={(e) => void enviar(e)}>
      <div className="grid-2">
        <div className="form-group">
          <label htmlFor="us-nome">Nome</label>
          <input id="us-nome" className="form-control" required minLength={3} maxLength={120} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        </div>
        <div className="form-group">
          <label htmlFor="us-email">E-mail (usado no login)</label>
          <input id="us-email" type="email" className="form-control" required maxLength={200} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </div>
        {orgs.length > 1 && (
          <div className="form-group">
            <label htmlFor="us-org">Organização</label>
            <select id="us-org" className="form-control" value={f.organizacao} onChange={(e) => setF({ ...f, organizacao: e.target.value as Organizacao, perfil: '' })}>
              {orgs.map((o) => (
                <option key={o} value={o}>
                  {NOME_ORG[o]}
                </option>
              ))}
            </select>
          </div>
        )}
        {f.organizacao === 'LOJA' && !lojaFixa && (
          <div className="form-group">
            <label htmlFor="us-loja">Loja</label>
            <select id="us-loja" className="form-control" value={f.loja_id} onChange={(e) => setF({ ...f, loja_id: e.target.value })}>
              {lojas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <fieldset className="opcoes-perfil">
        <legend>Perfil de acesso</legend>
        {perfis.map((p) => (
          <label key={p.id} className={`opcao-perfil ${perfil?.id === p.id ? 'ativa' : ''}`}>
            <input type="radio" name="perfil" checked={perfil?.id === p.id} onChange={() => setF({ ...f, perfil: p.id })} />
            <span>
              <strong>{p.nome}</strong>
              <span className="nota">{p.descricao}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="nota">O sistema gera uma senha temporária; a pessoa cria a própria senha no primeiro acesso.</p>
      <button type="submit" className="btn btn-primary btn-block botao-pix" disabled={enviando || !perfil}>
        {enviando ? 'Criando…' : 'Criar usuário'}
      </button>
    </form>
  );
}

/** Quem vê e quem edita o quê: a matriz de permissões por perfil. */
function MatrizAcesso({ modelo }: { modelo: ModeloAcesso }) {
  const permissoes = Object.entries(modelo.permissoes) as [keyof ModeloAcesso['permissoes'], string][];
  return (
    <Cartao tag="Permissões" titulo="O que cada perfil pode ver e editar">
      <div className="table-wrap">
        <table className="matriz">
          <thead>
            <tr>
              <th>Permissão</th>
              {modelo.perfis.map((p) => (
                <th key={p.id} title={p.descricao}>
                  <span className={`org-${p.organizacao.toLowerCase()}`}>{NOME_ORG[p.organizacao]}</span>
                  <br />
                  {p.nome}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {permissoes.map(([id, texto]) => (
              <tr key={id}>
                <td>
                  {texto}
                  <div className="nota">
                    <code>{id}</code>
                  </div>
                </td>
                {modelo.perfis.map((p) => (
                  <td key={p.id} className="celula-matriz" aria-label={p.permissoes.includes(id) ? 'sim' : 'não'}>
                    {p.permissoes.includes(id) ? '✓' : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="nota">Quem é de loja vê e edita só a própria loja. Os perfis são papéis no Keycloak; organização e loja são atributos do usuário.</p>
    </Cartao>
  );
}
