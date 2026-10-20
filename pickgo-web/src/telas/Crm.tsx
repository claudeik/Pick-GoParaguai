import { useState } from 'react';
import { CaixaErro, Dialogo, Kpi, PedirLogin, SemPermissao } from '../componentes/comum.tsx';
import { useEquipe } from '../equipe.tsx';
import { useApiEquipe, useCarga } from '../sessao.tsx';
import { Atendimento } from './crm/Atendimento.tsx';
import { Campanhas } from './crm/Campanhas.tsx';
import { Captacao } from './crm/Captacao.tsx';
import { Ficha } from './crm/Ficha.tsx';
import { ETAPAS, Funil } from './crm/Funil.tsx';
import { Videos } from './crm/Videos.tsx';

// CRM e atendimento (T17, T18): funil e onboarding (com o quadro do Gothan),
// atendimento multicanal e captação de leads.

type Aba = 'funil' | 'atendimento' | 'campanhas' | 'videos' | 'captacao';

export function Crm() {
  const { api, erro, precisaLogin } = useApiEquipe('admin', 'admin-portal');
  const { pode } = useEquipe();
  const [aba, setAba] = useState<Aba>('funil');
  const [ficha, setFicha] = useState<string | null>(null);
  const [ticket, setTicket] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const resumo = useCarga(api && pode('crm.ver') ? () => api.funil() : null, [api, versao], 15_000);

  if (precisaLogin) return <PedirLogin />;
  if (erro) return <CaixaErro erro={erro} />;
  if (!pode('crm.ver')) return <SemPermissao oQue="CRM e atendimento" />;
  if (!api) return <p className="carregando">Entrando…</p>;
  const r = resumo.dados;
  const clientes = (r?.por_etapa.CLIENTE_ATIVO ?? 0) + (r?.por_etapa.RECORRENTE ?? 0);

  return (
    <>
      <div className="grid-4">
        <Kpi rotulo="Leads" valor={(r?.por_etapa.LEAD ?? 0) + (r?.por_etapa.CONTATO_FEITO ?? 0)} sub="Formulário, mensagens e cadastro manual" />
        <Kpi rotulo="Em onboarding" valor={r?.por_etapa.ONBOARDING ?? 0} sub="Cadastrados, ainda sem retirada" />
        <Kpi rotulo="Clientes" valor={clientes} sub={`${r?.por_etapa.RECORRENTE ?? 0} recorrentes`} destaque="green" />
        <Kpi rotulo="Chamados abertos" valor={r?.tickets.abertos ?? '—'} sub={`${r?.tickets.atrasados ?? 0} com prazo vencido`} destaque={r?.tickets.atrasados ? 'red' : undefined} />
      </div>

      <div className="sub-nav" role="tablist" aria-label="CRM">
        {(
          [
            ['funil', '🗂️ Funil e onboarding'],
            ['atendimento', '💬 Atendimento'],
            ['campanhas', '📣 Campanhas e ofertas'],
            ['videos', '🎬 Vídeos do YouTube'],
            ['captacao', '🧲 Captação de leads'],
          ] as [Aba, string][]
        )
          .filter(([id]) => (id !== 'campanhas' && id !== 'videos') || pode('campanhas.ver'))
          .map(([id, rotulo]) => (
          <button key={id} type="button" role="tab" aria-selected={aba === id} className={`sub-tab ${aba === id ? 'active' : ''}`} onClick={() => setAba(id)}>
            {rotulo}
          </button>
        ))}
      </div>

      <section className="card card-flag-top">
        {aba === 'funil' && (
          <>
            <p className="texto-apoio">
              {ETAPAS.map((e) => e.titulo).join(' → ')}. Cadastro, primeira compra e retiradas movem o cartão sozinhos; arraste para mudar à mão.
            </p>
            <Funil key={versao} api={api} aoAbrir={setFicha} />
          </>
        )}
        {aba === 'campanhas' && <Campanhas api={api} />}
        {aba === 'videos' && <Videos api={api} />}
        {aba === 'atendimento' && <Atendimento api={api} ticketInicial={ticket} aoAbrirFicha={setFicha} />}
        {aba === 'captacao' && pode('crm.editar') && <Captacao api={api} aoCriar={() => setVersao((v) => v + 1)} />}
        {aba === 'captacao' && !pode('crm.editar') && <SemPermissao oQue="captação de leads" />}
      </section>

      <Dialogo aberto={!!ficha} aoFechar={() => setFicha(null)} titulo="Ficha do cliente">
        {ficha && (
          <Ficha
            api={api}
            contatoId={ficha}
            aoMudar={() => setVersao((v) => v + 1)}
            aoAbrirTicket={(id) => {
              setFicha(null);
              setTicket(id);
              setAba('atendimento');
            }}
          />
        )}
      </Dialogo>
    </>
  );
}
