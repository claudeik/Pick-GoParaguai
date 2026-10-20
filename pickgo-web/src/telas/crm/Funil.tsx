import { LayoutGrid, List, Mail, MessageSquare, Phone, Plus, ShoppingBag, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Api, ContatoCrm, EtapaFunil } from '../../api.ts';
import { CaixaErro, useAcao, Vazio } from '../../componentes/comum.tsx';
import { useEquipe } from '../../equipe.tsx';
import { fmtBRL, fmtData } from '../../formato.ts';
import { useCarga } from '../../sessao.tsx';

// Funil de leads e clientes, no modelo do quadro do Gothan CRM: colunas por
// etapa, cartões arrastáveis e "+" para criar um lead direto na coluna.

export const ETAPAS: { id: EtapaFunil; titulo: string; cor: string; dica: string }[] = [
  { id: 'LEAD', titulo: 'Lead', cor: '#3b82f6', dica: 'Veio do formulário, de mensagem ou foi cadastrado à mão' },
  { id: 'CONTATO_FEITO', titulo: 'Contato feito', cor: '#8b5cf6', dica: 'O atendimento já conversou' },
  { id: 'ONBOARDING', titulo: 'Onboarding', cor: '#f59e0b', dica: 'Cadastrado no app, ainda sem retirada' },
  { id: 'CLIENTE_ATIVO', titulo: 'Cliente ativo', cor: '#10b981', dica: 'Primeira compra retirada' },
  { id: 'RECORRENTE', titulo: 'Recorrente', cor: '#0d9488', dica: 'Duas ou mais compras retiradas' },
  { id: 'PERDIDO', titulo: 'Perdido', cor: '#ef4444', dica: 'Sem interesse ou parou de responder' },
];

const ORIGEM: Record<string, string> = {
  CADASTRO_APP: 'App',
  FORMULARIO: 'Formulário',
  MANUAL: 'Manual',
  MENSAGEM_RECEBIDA: 'Mensagem',
  IMPORTACAO: 'Importação',
};

export const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

export function Funil({ api, aoAbrir }: { api: Api; aoAbrir: (contatoId: string) => void }) {
  const { pode } = useEquipe();
  const edita = pode('crm.editar');
  const [busca, setBusca] = useState('');
  const [aplicada, setAplicada] = useState('');
  const [modo, setModo] = useState<'quadro' | 'lista'>('quadro');
  const [sobre, setSobre] = useState<EtapaFunil | null>(null);
  const [novoEm, setNovoEm] = useState<EtapaFunil | null>(null);
  const [novo, setNovo] = useState({ nome: '', whatsapp: '', email: '' });
  const arrastando = useRef(false);
  const lista = useCarga(() => api.contatos({ busca: aplicada || undefined }), [api, aplicada], 15_000);
  const { executar } = useAcao();
  const contatos = lista.dados?.contatos ?? [];

  const mover = (id: string, etapa: EtapaFunil) => {
    const c = contatos.find((x) => x.id === id);
    if (!c || c.etapa === etapa) return;
    // Otimista, como no Gothan; volta se a API recusar.
    lista.setDados((d) => (d ? { contatos: d.contatos.map((x) => (x.id === id ? { ...x, etapa } : x)) } : d));
    void executar('mover', async () => {
      try {
        await api.alterarContato(id, { etapa });
      } finally {
        await lista.recarregar();
      }
    });
  };

  const criar = (etapa: EtapaFunil) =>
    executar(
      'criar',
      async () => {
        await api.criarContato({ nome: novo.nome.trim(), whatsapp: novo.whatsapp.trim() || undefined, email: novo.email.trim() || undefined, etapa });
        setNovo({ nome: '', whatsapp: '', email: '' });
        setNovoEm(null);
        await lista.recarregar();
      },
      'Lead cadastrado.',
    );

  return (
    <div>
      <div className="filtros-gestao">
        <form
          className="busca"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setAplicada(busca.trim());
          }}
        >
          <input className="form-control" type="search" placeholder="Nome, e-mail ou WhatsApp" aria-label="Buscar contato" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <button type="submit" className="btn btn-sm btn-outline">
            Buscar
          </button>
        </form>
        <div className="alternar" role="group" aria-label="Visualização">
          <button type="button" className={`btn btn-sm ${modo === 'quadro' ? 'btn-blue' : 'btn-outline'}`} aria-pressed={modo === 'quadro'} onClick={() => setModo('quadro')}>
            <LayoutGrid size={15} /> Quadro
          </button>
          <button type="button" className={`btn btn-sm ${modo === 'lista' ? 'btn-blue' : 'btn-outline'}`} aria-pressed={modo === 'lista'} onClick={() => setModo('lista')}>
            <List size={15} /> Lista
          </button>
        </div>
      </div>

      {lista.erro && <CaixaErro erro={lista.erro} onTentar={lista.recarregar} />}

      {modo === 'quadro' ? (
        <div className="funil">
          {ETAPAS.map((etapa) => {
            const doEstagio = contatos.filter((c) => c.etapa === etapa.id);
            return (
              <section
                key={etapa.id}
                className={`funil-coluna ${sobre === etapa.id ? 'arrastando-sobre' : ''}`}
                aria-label={`${etapa.titulo}: ${doEstagio.length}`}
                onDragOver={(e) => {
                  if (!edita) return;
                  e.preventDefault();
                  setSobre(etapa.id);
                }}
                onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setSobre(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setSobre(null);
                  const id = e.dataTransfer.getData('contato');
                  if (id) mover(id, etapa.id);
                }}
              >
                <header className="funil-topo" title={etapa.dica}>
                  <span style={{ color: etapa.cor }}>{etapa.titulo}</span>
                  <span className="nota">{doEstagio.length}</span>
                  {edita && (
                    <button type="button" className="icone" aria-label={`Novo lead em ${etapa.titulo}`} onClick={() => setNovoEm(etapa.id)}>
                      <Plus size={16} />
                    </button>
                  )}
                </header>
                <div className="funil-cartoes">
                  {novoEm === etapa.id && (
                    <form
                      className="crm-cartao novo"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (novo.nome.trim() && (novo.whatsapp.trim() || novo.email.trim())) void criar(etapa.id);
                      }}
                    >
                      <div className="kanban-topo">
                        <strong>Novo lead</strong>
                        <button type="button" className="icone" aria-label="Cancelar" onClick={() => setNovoEm(null)}>
                          <X size={14} />
                        </button>
                      </div>
                      <input autoFocus className="form-control" placeholder="Nome *" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
                      <input className="form-control" placeholder="WhatsApp (+55…)" inputMode="tel" value={novo.whatsapp} onChange={(e) => setNovo({ ...novo, whatsapp: e.target.value })} />
                      <input className="form-control" placeholder="E-mail" type="email" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} />
                      <button type="submit" className="btn btn-sm btn-primary btn-block">
                        Adicionar
                      </button>
                    </form>
                  )}
                  {doEstagio.map((c) => (
                    <CartaoContato
                      key={c.id}
                      c={c}
                      arrastavel={edita}
                      aoIniciar={(e) => {
                        arrastando.current = true;
                        e.dataTransfer.setData('contato', c.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      aoTerminar={() => setTimeout(() => (arrastando.current = false), 0)}
                      aoAbrir={() => !arrastando.current && aoAbrir(c.id)}
                      etapas={edita ? ETAPAS : []}
                      aoMover={(etapa) => mover(c.id, etapa)}
                    />
                  ))}
                  {!doEstagio.length && novoEm !== etapa.id && <p className="nota vazio-coluna">Vazio</p>}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <ListaContatos contatos={contatos} aoAbrir={aoAbrir} />
      )}
      {lista.dados && !contatos.length && <Vazio>Nenhum contato ainda. Os cadastros do app e os leads do formulário aparecem aqui.</Vazio>}
    </div>
  );
}

function CartaoContato({
  c,
  arrastavel,
  aoIniciar,
  aoTerminar,
  aoAbrir,
  etapas,
  aoMover,
}: {
  c: ContatoCrm;
  arrastavel: boolean;
  aoIniciar: (e: React.DragEvent) => void;
  aoTerminar: () => void;
  aoAbrir: () => void;
  etapas: typeof ETAPAS;
  aoMover: (e: EtapaFunil) => void;
}) {
  return (
    <article className="crm-cartao" draggable={arrastavel} onDragStart={aoIniciar} onDragEnd={aoTerminar}>
      <button type="button" className="crm-cartao-abrir" onClick={aoAbrir} aria-label={`Abrir ficha de ${c.nome}`}>
        <div className="crm-cartao-topo">
          <span className="avatar" aria-hidden="true">
            {iniciais(c.nome)}
          </span>
          <div>
            <strong>{c.nome}</strong>
            <div className="nota">{ORIGEM[c.origem] ?? c.origem}</div>
          </div>
        </div>
        <div className="crm-contatos">
          {c.whatsapp && (
            <span>
              <Phone size={13} /> {c.whatsapp}
            </span>
          )}
          {c.email && (
            <span>
              <Mail size={13} /> {c.email}
            </span>
          )}
        </div>
        <div className="crm-rodape">
          <span title="Pedidos pagos">
            <ShoppingBag size={13} /> {c.pedidos ?? 0} · {fmtBRL(c.gasto_brl_centavos ?? 0)}
          </span>
          {!!c.tickets_abertos && (
            <span className="badge badge-red" title="Chamados abertos">
              <MessageSquare size={12} /> {c.tickets_abertos}
            </span>
          )}
          {c.optout_canais.length > 0 && <span className="badge badge-gray">parou: {c.optout_canais.join(', ').toLowerCase()}</span>}
        </div>
        {c.tags.length > 0 && (
          <div className="crm-tags">
            {c.tags.slice(0, 3).map((t) => (
              <span key={t} className="badge badge-blue">
                {t}
              </span>
            ))}
          </div>
        )}
      </button>
      {/* Mover sem arrastar (teclado e celular). */}
      {etapas.length > 0 && (
        <select className="mover-etapa" aria-label={`Mover ${c.nome} para`} value={c.etapa} onChange={(e) => aoMover(e.target.value as EtapaFunil)}>
          {etapas.map((e) => (
            <option key={e.id} value={e.id}>
              → {e.titulo}
            </option>
          ))}
        </select>
      )}
    </article>
  );
}

function ListaContatos({ contatos, aoAbrir }: { contatos: ContatoCrm[]; aoAbrir: (id: string) => void }) {
  const nomeEtapa = (e: EtapaFunil) => ETAPAS.find((x) => x.id === e)!;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Contato</th>
            <th>Etapa</th>
            <th>Pedidos</th>
            <th>Última compra</th>
            <th>Último contato</th>
            <th>Chamados</th>
          </tr>
        </thead>
        <tbody>
          {contatos.map((c) => (
            <tr key={c.id}>
              <td>
                <button type="button" className="link" onClick={() => aoAbrir(c.id)}>
                  {c.nome}
                </button>
                <div className="nota">{[c.whatsapp, c.email].filter(Boolean).join(' · ')}</div>
              </td>
              <td>
                <span style={{ color: nomeEtapa(c.etapa).cor, fontWeight: 700 }}>{nomeEtapa(c.etapa).titulo}</span>
              </td>
              <td>
                {c.pedidos ?? 0} · {fmtBRL(c.gasto_brl_centavos ?? 0)}
              </td>
              <td>{fmtData(c.ultima_compra)}</td>
              <td>{fmtData(c.ultimo_contato_em)}</td>
              <td>{c.tickets_abertos ? <span className="badge badge-red">{c.tickets_abertos}</span> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
