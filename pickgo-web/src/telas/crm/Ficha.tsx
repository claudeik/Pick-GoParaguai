import { CheckCircle2, Circle } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Api, CanalMensagem, EtapaFunil, MensagemCrm } from '../../api.ts';
import { CaixaErro, Estado, useAcao, Vazio } from '../../componentes/comum.tsx';
import { useEquipe } from '../../equipe.tsx';
import { fmtBRL, fmtData, NOME_MODO } from '../../formato.ts';
import { useCarga } from '../../sessao.tsx';
import { ETAPAS, iniciais } from './Funil.tsx';

// Ficha do cliente (T17): dados, onboarding calculado dos pedidos reais,
// consentimento por canal, pedidos, chamados e o histórico de mensagens.

export const NOME_CANAL: Record<CanalMensagem, string> = { WHATSAPP: 'WhatsApp', SMS: 'SMS', EMAIL: 'E-mail', APP: 'App' };

export function Ficha({ api, contatoId, aoAbrirTicket, aoMudar }: { api: Api; contatoId: string; aoAbrirTicket: (id: string) => void; aoMudar?: () => void }) {
  const { pode, eu } = useEquipe();
  const ficha = useCarga(() => api.ficha(contatoId), [api, contatoId]);
  const { ocupado, executar } = useAcao();
  const [notas, setNotas] = useState('');
  const [tags, setTags] = useState('');
  const [canal, setCanal] = useState<CanalMensagem>('APP');
  const [texto, setTexto] = useState('');
  useEffect(() => {
    if (!ficha.dados) return;
    setNotas(ficha.dados.contato.notas ?? '');
    setTags(ficha.dados.contato.tags.join(', '));
    setCanal(ficha.dados.canais_permitidos[0] ?? 'APP');
  }, [ficha.dados]);

  if (ficha.erro) return <CaixaErro erro={ficha.erro} onTentar={ficha.recarregar} />;
  if (!ficha.dados) return <p className="carregando">Carregando ficha…</p>;
  const { contato: c, onboarding, canais_permitidos, pedidos, tickets, mensagens } = ficha.dados;
  const edita = pode('crm.editar');

  const salvar = (d: Parameters<Api['alterarContato']>[1], ok: string) =>
    executar('salvar', async () => {
      await api.alterarContato(c.id, d);
      await ficha.recarregar();
      aoMudar?.();
    }, ok);

  return (
    <div className="ficha">
      <header className="ficha-topo">
        <span className="avatar grande" aria-hidden="true">
          {iniciais(c.nome)}
        </span>
        <div>
          <h4>{c.nome}</h4>
          <div className="nota">{[c.whatsapp, c.email].filter(Boolean).join(' · ') || 'sem contato'}</div>
          <div className="nota">
            {c.cliente_id ? 'Cliente do app' : 'Lead sem cadastro'} · desde {fmtData(c.criado_em).split(' ')[0]}
            {c.responsavel && <> · responsável {c.responsavel.split(':').pop()}</>}
          </div>
        </div>
        {edita && (
          <select className="form-control seletor-etapa" aria-label="Etapa do funil" value={c.etapa} disabled={!!ocupado} onChange={(e) => void salvar({ etapa: e.target.value as EtapaFunil }, 'Etapa atualizada.')}>
            {ETAPAS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.titulo}
              </option>
            ))}
          </select>
        )}
      </header>

      <div className="grid-2">
        <section>
          <h5 className="subtitulo">Onboarding</h5>
          <ul className="checklist">
            {onboarding.map((p) => (
              <li key={p.passo} className={p.feito ? 'feito' : ''}>
                {p.feito ? <CheckCircle2 size={16} /> : <Circle size={16} />} {p.passo}
              </li>
            ))}
          </ul>
          <h5 className="subtitulo">Canais de mensagem</h5>
          <div className="botoes-linha sem-margem">
            {(['WHATSAPP', 'SMS', 'EMAIL'] as CanalMensagem[]).map((k) => (
              <span key={k} className={`badge ${canais_permitidos.includes(k) ? 'badge-green' : c.optout_canais.includes(k) ? 'badge-red' : 'badge-gray'}`}>
                {NOME_CANAL[k]}: {canais_permitidos.includes(k) ? 'aceito' : c.optout_canais.includes(k) ? 'pediu para parar' : 'sem aceite'}
              </span>
            ))}
          </div>
        </section>
        <section>
          <h5 className="subtitulo">Anotações</h5>
          <textarea className="form-control" rows={3} value={notas} readOnly={!edita} onChange={(e) => setNotas(e.target.value)} aria-label="Anotações" />
          <input className="form-control" value={tags} readOnly={!edita} onChange={(e) => setTags(e.target.value)} placeholder="Etiquetas, separadas por vírgula" aria-label="Etiquetas" />
          {edita && (
            <div className="botoes-linha">
              <button
                type="button"
                className="btn btn-sm btn-outline"
                disabled={!!ocupado}
                onClick={() =>
                  void salvar(
                    {
                      notas: notas.trim() || null,
                      tags: tags
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean),
                    },
                    'Anotações salvas.',
                  )
                }
              >
                Salvar anotações
              </button>
              {eu && (
                <button type="button" className="btn btn-sm btn-outline" disabled={!!ocupado} onClick={() => void salvar({ responsavel: `${eu.perfis[0]?.id}:${eu.email}` }, 'Contato atribuído a você.')}>
                  Assumir contato
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      <h5 className="subtitulo">Pedidos</h5>
      {pedidos.length ? (
        <ul className="lista-compacta">
          {pedidos.map((p) => (
            <li key={p.id}>
              <strong>{p.codigo}</strong> <Estado estado={p.estado} /> <span className="nota">{NOME_MODO[p.modo]} · {fmtBRL(p.total_brl_centavos)} · {fmtData(p.criado_em)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="nota">Nenhum pedido.</p>
      )}

      <h5 className="subtitulo">Chamados</h5>
      {tickets.length ? (
        <ul className="lista-compacta">
          {tickets.map((t) => (
            <li key={t.id}>
              <button type="button" className="link" onClick={() => aoAbrirTicket(t.id)}>
                #{t.numero} {t.assunto}
              </button>{' '}
              <span className={`badge ${t.estado === 'RESOLVIDO' ? 'badge-green' : 'badge-gold'}`}>{t.estado.replace('_', ' ').toLowerCase()}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="nota">Nenhum chamado.</p>
      )}

      <h5 className="subtitulo">Mensagens</h5>
      {pode('mensagens.enviar') && (
        <form
          className="responder"
          onSubmit={(e) => {
            e.preventDefault();
            if (!texto.trim()) return;
            void executar(
              'enviar',
              async () => {
                await api.mensagemAvulsa(c.id, { canal, texto: texto.trim() });
                setTexto('');
                await ficha.recarregar();
              },
              'Mensagem na fila de envio.',
            );
          }}
        >
          <select className="form-control" aria-label="Canal" value={canal} onChange={(e) => setCanal(e.target.value as CanalMensagem)}>
            {(['APP', ...canais_permitidos] as CanalMensagem[]).map((k) => (
              <option key={k} value={k}>
                {NOME_CANAL[k]}
              </option>
            ))}
          </select>
          <input className="form-control" placeholder="Escreva uma mensagem" aria-label="Mensagem" maxLength={1600} value={texto} onChange={(e) => setTexto(e.target.value)} />
          <button type="submit" className="btn btn-sm btn-primary" disabled={ocupado === 'enviar' || !texto.trim()}>
            Enviar
          </button>
        </form>
      )}
      <Conversa mensagens={[...mensagens].reverse()} />
    </div>
  );
}

const ESTADO_MSG: Record<string, string> = {
  PENDENTE: 'na fila',
  ENVIADA: 'enviada',
  ENTREGUE: 'entregue',
  LIDA: 'lida',
  FALHOU: 'falhou',
  BLOQUEADA: 'bloqueada',
  RECEBIDA: 'recebida',
};

/** Linha do tempo das mensagens, com o estado da entrega e o motivo do bloqueio. */
export function Conversa({ mensagens }: { mensagens: MensagemCrm[] }) {
  if (!mensagens.length) return <Vazio>Nenhuma mensagem.</Vazio>;
  return (
    <ol className="conversa">
      {mensagens.map((m) => (
        <li key={m.id} className={`balao ${m.direcao === 'ENTRADA' ? 'entrada' : 'saida'} ${m.estado === 'BLOQUEADA' || m.estado === 'FALHOU' ? 'problema' : ''}`}>
          <div className="balao-texto">{m.conteudo}</div>
          <div className="balao-meta">
            {NOME_CANAL[m.canal]} · {fmtData(m.criado_em)}
            {m.direcao === 'SAIDA' && <> · {ESTADO_MSG[m.estado] ?? m.estado}</>}
            {m.autor && m.direcao === 'SAIDA' && m.autor !== 'sistema' && <> · {m.autor.split(':').pop()}</>}
            {m.autor === 'sistema' && m.modelo && <> · automática</>}
            {m.motivo && <div className="balao-motivo">{m.motivo}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
