import { AlarmClock, Bot } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Api, CanalMensagem, EstadoTicket, PrioridadeTicket, TipoTicket } from '../../api.ts';
import { CaixaErro, Estado, useAcao, Vazio } from '../../componentes/comum.tsx';
import { useEquipe } from '../../equipe.tsx';
import { fmtData } from '../../formato.ts';
import { useCarga } from '../../sessao.tsx';
import { Conversa, NOME_CANAL } from './Ficha.tsx';

// Atendimento (T17 · RF-32, RF-33): fila única de WhatsApp, SMS, e-mail e app,
// com o contexto do pedido. Retirada atrasada e defeito pós-saída chegam sozinhos.

export const NOME_TIPO: Record<TipoTicket, string> = {
  DUVIDA: 'Dúvida',
  CANCELAMENTO: 'Cancelamento',
  RETIRADA_ATRASADA: 'Retirada atrasada',
  RECLAMACAO: 'Reclamação',
  DEFEITO: 'Defeito',
  OUTRO: 'Outro',
};
const NOME_ESTADO: Record<EstadoTicket, string> = { ABERTO: 'Aberto', EM_ATENDIMENTO: 'Em atendimento', AGUARDANDO_CLIENTE: 'Aguardando cliente', RESOLVIDO: 'Resolvido' };
const COR_PRIORIDADE: Record<PrioridadeTicket, string> = { URGENTE: 'badge-red', ALTA: 'badge-red', NORMAL: 'badge-blue', BAIXA: 'badge-gray' };

export function Atendimento({ api, ticketInicial, aoAbrirFicha }: { api: Api; ticketInicial: string | null; aoAbrirFicha: (contatoId: string) => void }) {
  const [filtro, setFiltro] = useState<EstadoTicket | 'ABERTOS'>('ABERTOS');
  const [tipo, setTipo] = useState<TipoTicket | ''>('');
  const [selecionado, setSelecionado] = useState<string | null>(ticketInicial);
  useEffect(() => {
    if (ticketInicial) setSelecionado(ticketInicial);
  }, [ticketInicial]);
  const lista = useCarga(() => api.tickets({ estado: filtro, tipo: tipo || undefined }), [api, filtro, tipo], 5000);
  const tickets = lista.dados?.tickets ?? [];

  return (
    <div className="atendimento">
      <aside className="caixa-entrada">
        <div className="filtros-gestao">
          <select className="form-control" aria-label="Situação" value={filtro} onChange={(e) => setFiltro(e.target.value as EstadoTicket | 'ABERTOS')}>
            <option value="ABERTOS">Abertos</option>
            <option value="AGUARDANDO_CLIENTE">Aguardando cliente</option>
            <option value="RESOLVIDO">Resolvidos</option>
          </select>
          <select className="form-control" aria-label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoTicket | '')}>
            <option value="">Todos os tipos</option>
            {Object.entries(NOME_TIPO).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        {lista.erro && <CaixaErro erro={lista.erro} onTentar={lista.recarregar} />}
        {lista.dados && !tickets.length && <Vazio>Nenhum chamado aqui.</Vazio>}
        <ul className="lista-tickets">
          {tickets.map((t) => (
            <li key={t.id}>
              <button type="button" className={`item-ticket ${selecionado === t.id ? 'ativo' : ''}`} onClick={() => setSelecionado(t.id)} aria-current={selecionado === t.id}>
                <div className="kanban-topo">
                  <strong>{t.contato_nome}</strong>
                  <span className={`badge ${COR_PRIORIDADE[t.prioridade]}`}>{t.prioridade.toLowerCase()}</span>
                </div>
                <div className="nota">
                  #{t.numero} · {NOME_TIPO[t.tipo]} · {t.canal === 'INTERNO' ? 'interno' : NOME_CANAL[t.canal as CanalMensagem]}
                  {t.pedido_codigo && <> · {t.pedido_codigo}</>}
                </div>
                <div className="resumo-ticket">{t.ultima_mensagem ?? t.assunto}</div>
                <div className="nota">
                  {t.atrasado && (
                    <span className="valor-negativo">
                      <AlarmClock size={12} /> prazo vencido ·{' '}
                    </span>
                  )}
                  {t.automatico && (
                    <span>
                      <Bot size={12} /> automático ·{' '}
                    </span>
                  )}
                  {NOME_ESTADO[t.estado]} · {fmtData(t.atualizado_em)}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="conversa-ticket">
        {selecionado ? <DetalheTicket key={selecionado} api={api} id={selecionado} aoMudar={lista.recarregar} aoAbrirFicha={aoAbrirFicha} /> : <Vazio>Escolha um chamado.</Vazio>}
      </section>
    </div>
  );
}

function DetalheTicket({ api, id, aoMudar, aoAbrirFicha }: { api: Api; id: string; aoMudar: () => Promise<void>; aoAbrirFicha: (contatoId: string) => void }) {
  const { pode, eu } = useEquipe();
  const d = useCarga(() => api.ticket(id), [api, id], 5000);
  const { ocupado, executar } = useAcao();
  const [texto, setTexto] = useState('');
  const [canal, setCanal] = useState<CanalMensagem>('APP');
  const t = d.dados?.ticket;
  const canais = d.dados ? (['APP', ...d.dados.canais_permitidos] as CanalMensagem[]) : ['APP' as CanalMensagem];
  // O canal da conversa vale mesmo sem aceite (o cliente escreveu por ele nas últimas 24 h).
  const opcoes = t && ['WHATSAPP', 'SMS', 'EMAIL'].includes(t.canal) && !canais.includes(t.canal as CanalMensagem) ? [...canais, t.canal as CanalMensagem] : canais;
  useEffect(() => {
    if (t) setCanal(['WHATSAPP', 'SMS', 'EMAIL', 'APP'].includes(t.canal) ? (t.canal as CanalMensagem) : (d.dados!.canais_permitidos[0] ?? 'APP'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t?.id]);

  if (d.erro) return <CaixaErro erro={d.erro} onTentar={d.recarregar} />;
  if (!t) return <p className="carregando">Carregando…</p>;

  const alterar = (dados: Parameters<Api['alterarTicket']>[1], ok: string) =>
    executar('alterar', async () => {
      await api.alterarTicket(t.id, dados);
      await Promise.all([d.recarregar(), aoMudar()]);
    }, ok);

  const responder = (resolver: boolean) =>
    executar(
      'responder',
      async () => {
        await api.responderTicket(t.id, { canal, texto: texto.trim(), aguardar_cliente: !resolver });
        if (resolver) await api.alterarTicket(t.id, { estado: 'RESOLVIDO' });
        setTexto('');
        await Promise.all([d.recarregar(), aoMudar()]);
      },
      resolver ? 'Respondido e resolvido.' : 'Resposta na fila de envio.',
    );

  const estornar = () =>
    executar(
      'estorno',
      async () => {
        if (!t.pedido_id) return;
        const p = await api.pedido(t.pedido_id);
        if (p.pagamento?.estado === 'CONFIRMADO') {
          if (!confirm(`Estornar o pedido ${p.codigo}? O split é revertido no ledger e o cliente é avisado.`)) return;
          await api.estornar(p.pagamento.id);
        } else if (p.estado === 'AGUARDANDO_PIX' || p.estado === 'CRIADO') {
          if (!confirm(`Cancelar o pedido ${p.codigo}, que ainda não foi pago?`)) return;
          await api.cancelar(p.id);
        } else throw new Error(`O pedido ${p.codigo} está em ${p.estado} e não pode ser estornado agora.`);
        await d.recarregar();
      },
      'Pedido cancelado ou estornado.',
    );

  return (
    <div className="detalhe-ticket">
      <header className="kanban-topo">
        <div>
          <h4>
            #{t.numero} · {t.assunto}
          </h4>
          <div className="nota">
            <button type="button" className="link" onClick={() => aoAbrirFicha(t.contato_id)}>
              {t.contato_nome}
            </button>{' '}
            · {[t.contato_whatsapp, t.contato_email].filter(Boolean).join(' · ')}
            {t.responsavel && <> · com {t.responsavel.split(':').pop()}</>}
            {t.responder_ate && t.estado !== 'RESOLVIDO' && <> · responder até {fmtData(t.responder_ate)}</>}
          </div>
        </div>
        {t.pedido_codigo && t.pedido_estado && (
          <div className="pedido-ticket">
            <strong>{t.pedido_codigo}</strong> <Estado estado={t.pedido_estado} />
          </div>
        )}
      </header>

      {(pode('crm.editar') || pode('atendimento.responder')) && (
        <div className="botoes-linha sem-margem acoes-ticket">
          <select className="form-control" aria-label="Situação do chamado" value={t.estado} disabled={!!ocupado} onChange={(e) => void alterar({ estado: e.target.value as EstadoTicket }, 'Chamado atualizado.')}>
            {Object.entries(NOME_ESTADO).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select className="form-control" aria-label="Prioridade" value={t.prioridade} disabled={!!ocupado} onChange={(e) => void alterar({ prioridade: e.target.value as PrioridadeTicket }, 'Prioridade atualizada.')}>
            {(['URGENTE', 'ALTA', 'NORMAL', 'BAIXA'] as PrioridadeTicket[]).map((p) => (
              <option key={p} value={p}>
                Prioridade {p.toLowerCase()}
              </option>
            ))}
          </select>
          {eu && !t.responsavel && (
            <button type="button" className="btn btn-sm btn-outline" disabled={!!ocupado} onClick={() => void alterar({ responsavel: `${eu.perfis[0]?.id}:${eu.email}` }, 'Chamado é seu.')}>
              Assumir
            </button>
          )}
          {t.pedido_id && pode('estorno.executar') && (t.tipo === 'CANCELAMENTO' || t.tipo === 'RETIRADA_ATRASADA' || t.tipo === 'RECLAMACAO') && (
            <button type="button" className="btn btn-sm btn-outline-red" disabled={!!ocupado} onClick={() => void estornar()}>
              Cancelar ou estornar o pedido
            </button>
          )}
        </div>
      )}

      <Conversa mensagens={d.dados!.mensagens} />

      {pode('atendimento.responder') && t.estado !== 'RESOLVIDO' && (
        <form
          className="responder coluna"
          onSubmit={(e) => {
            e.preventDefault();
            if (texto.trim()) void responder(false);
          }}
        >
          <textarea className="form-control" rows={3} maxLength={1600} placeholder="Responder ao cliente" aria-label="Resposta" value={texto} onChange={(e) => setTexto(e.target.value)} />
          <div className="botoes-linha sem-margem">
            <select className="form-control" aria-label="Canal da resposta" value={canal} onChange={(e) => setCanal(e.target.value as CanalMensagem)}>
              {opcoes.map((k) => (
                <option key={k} value={k}>
                  {NOME_CANAL[k]}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-sm btn-primary" disabled={!!ocupado || !texto.trim()}>
              Responder
            </button>
            <button type="button" className="btn btn-sm btn-success" disabled={!!ocupado || !texto.trim()} onClick={() => void responder(true)}>
              Responder e resolver
            </button>
          </div>
          <p className="nota">WhatsApp, SMS e e-mail saem só para quem aceitou o canal ou escreveu por ele nas últimas 24 h. Respostas no App aparecem em “Ajuda” no app do cliente.</p>
        </form>
      )}
    </div>
  );
}
