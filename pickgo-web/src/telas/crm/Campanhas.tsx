import { Megaphone } from 'lucide-react';
import { useState } from 'react';
import type { Api, Campanha, MetricasCampanha } from '../../api.ts';
import { CaixaErro, Cartao, Dialogo, useAcao, Vazio } from '../../componentes/comum.tsx';
import { useEquipe } from '../../equipe.tsx';
import { fmtBRL, fmtData } from '../../formato.ts';
import { useCarga } from '../../sessao.tsx';
import { NOME_CANAL } from './Ficha.tsx';
import { NovaCampanha } from './NovaCampanha.tsx';
import { Ofertas } from './Ofertas.tsx';

// Campanhas (T14, T15, T29 · RF-28 a RF-31, RF-36 a RF-38): resultados, cascata e ofertas.

const ESTADO: Record<Campanha['estado'], [string, string]> = {
  RASCUNHO: ['Rascunho', 'badge-gray'],
  AGENDADA: ['Agendada', 'badge-blue'],
  ENVIANDO: ['Enviando', 'badge-gold'],
  CONCLUIDA: ['Concluída', 'badge-green'],
  CANCELADA: ['Cancelada', 'badge-red'],
};

const ESTADO_ENVIO: Record<string, string> = {
  NA_FILA: 'Na fila',
  ENVIADA: 'Enviada',
  ENTREGUE: 'Entregue',
  LIDA: 'Leu',
  CLICOU: 'Clicou',
  COMPROU: 'Comprou',
  SEM_CANAL: 'Sem canal aceito',
  ESGOTADO: 'Oferta esgotou',
};

export function Campanhas({ api }: { api: Api }) {
  const { pode } = useEquipe();
  const lista = useCarga(() => api.campanhas(), [api], 10_000);
  const [criando, setCriando] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  const [versaoOfertas, setVersaoOfertas] = useState(0);

  return (
    <>
      <div className="kanban-topo">
        <p className="texto-apoio sem-margem">
          A campanha tenta o primeiro canal aceito da cascata; sem leitura nem clique no prazo, passa ao próximo. Compra ou clique encerram a cascata da
          pessoa. Cada campanha conta uma vez no limite semanal de ofertas.
        </p>
        {pode('campanhas.gerenciar') && (
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setCriando(true)}>
            <Megaphone size={15} /> Nova campanha
          </button>
        )}
      </div>

      {lista.erro && <CaixaErro erro={lista.erro} onTentar={lista.recarregar} />}
      {lista.dados?.campanhas.length === 0 && <Vazio>Nenhuma campanha ainda.</Vazio>}
      <div className="lista-campanhas">
        {lista.dados?.campanhas.map((c) => (
          <LinhaCampanha key={c.id} c={c} api={api} aoAbrir={() => setAberta(c.id)} aoMudar={lista.recarregar} />
        ))}
      </div>

      <Ofertas key={versaoOfertas} api={api} />

      <Dialogo aberto={criando} aoFechar={() => setCriando(false)} titulo="📣 Nova campanha">
        {criando && (
          <NovaCampanha
            api={api}
            aoCriar={async () => {
              setCriando(false);
              setVersaoOfertas((v) => v + 1);
              await lista.recarregar();
            }}
          />
        )}
      </Dialogo>
      <Dialogo aberto={!!aberta} aoFechar={() => setAberta(null)} titulo="Resultado da campanha">
        {aberta && <DetalheCampanha api={api} id={aberta} />}
      </Dialogo>
    </>
  );
}

function LinhaCampanha({ c, api, aoAbrir, aoMudar }: { c: Campanha; api: Api; aoAbrir: () => void; aoMudar: () => Promise<void> }) {
  const { pode } = useEquipe();
  const { ocupado, executar } = useAcao();
  const [nome, cor] = ESTADO[c.estado];
  return (
    <article className="campanha">
      <header className="kanban-topo">
        <div>
          <button type="button" className="link titulo-campanha" onClick={aoAbrir}>
            {c.nome}
          </button>
          <div className="nota">
            {c.canais.map((k) => NOME_CANAL[k]).join(' → ')} · espera {c.espera_horas} h
            {c.oferta_codigo && (
              <>
                {' '}
                · oferta <code>{c.oferta_codigo}</code> ({c.quantidade_restante}/{c.quantidade_total} restantes)
              </>
            )}
            {' · '}
            {c.estado === 'AGENDADA' ? `envio ${fmtData(c.agendada_para)}` : c.disparada_em ? `disparada ${fmtData(c.disparada_em)}` : `criada ${fmtData(c.criado_em)}`}
          </div>
        </div>
        <div className="botoes-linha sem-margem">
          <span className={`badge ${cor}`}>{nome}</span>
          {pode('campanhas.gerenciar') && c.estado === 'RASCUNHO' && (
            <button type="button" className="btn btn-sm btn-primary" disabled={!!ocupado} onClick={() => void executar('enviar', async () => (await api.agendarCampanha(c.id), await aoMudar()), 'Campanha disparada.')}>
              Enviar agora
            </button>
          )}
          {pode('campanhas.gerenciar') && ['RASCUNHO', 'AGENDADA', 'ENVIANDO'].includes(c.estado) && (
            <button
              type="button"
              className="btn btn-sm btn-outline-red"
              disabled={!!ocupado}
              onClick={() => {
                if (!confirm(`Cancelar "${c.nome}"? O que ainda não saiu é bloqueado.`)) return;
                void executar('cancelar', async () => (await api.cancelarCampanha(c.id), await aoMudar()), 'Campanha cancelada.');
              }}
            >
              Cancelar
            </button>
          )}
        </div>
      </header>
      {c.metricas && c.metricas.publico > 0 && <FunilResultado m={c.metricas} />}
    </article>
  );
}

/** Público → enviadas → entregues → lidas → cliques → compras (RF-38). */
function FunilResultado({ m }: { m: MetricasCampanha }) {
  const etapas: [string, number][] = [
    ['Público', m.publico],
    ['Enviadas', m.mensagens.enviadas],
    ['Entregues', m.mensagens.entregues],
    ['Lidas', m.mensagens.lidas],
    ['Cliques', m.cliques],
    ['Compras', m.compras],
  ];
  const max = Math.max(1, ...etapas.map(([, v]) => v));
  return (
    <div className="resultado-campanha">
      <div className="barras-funil" role="list" aria-label="Resultado da campanha">
        {etapas.map(([rotulo, v]) => (
          <div key={rotulo} className="barra-funil" role="listitem" aria-label={`${rotulo}: ${v}`}>
            <span className="barra-rotulo">{rotulo}</span>
            <span className="barra-trilho">
              <span className="barra-valor" style={{ width: `${(v / max) * 100}%` }} />
            </span>
            <strong>{v}</strong>
          </div>
        ))}
      </div>
      <div className="numeros-campanha">
        <div>
          <span className="kpi-label">Receita</span>
          <strong>{fmtBRL(m.receita_brl_centavos)}</strong>
        </div>
        <div>
          <span className="kpi-label">Sem canal aceito</span>
          <strong>{m.sem_canal}</strong>
        </div>
        <div>
          <span className="kpi-label">Bloqueadas</span>
          <strong>{m.mensagens.bloqueadas}</strong>
        </div>
        <div>
          <span className="kpi-label">Na fila</span>
          <strong>{m.mensagens.na_fila}</strong>
        </div>
      </div>
    </div>
  );
}

function DetalheCampanha({ api, id }: { api: Api; id: string }) {
  const d = useCarga(() => api.campanha(id), [api, id], 10_000);
  if (d.erro) return <CaixaErro erro={d.erro} onTentar={d.recarregar} />;
  if (!d.dados) return <p className="carregando">Carregando…</p>;
  const { campanha: c, metricas, envios } = d.dados;
  return (
    <div className="ficha">
      <h4 className="subtitulo sem-margem">{c.nome}</h4>
      <FunilResultado m={metricas} />
      <Cartao titulo="Mensagem">
        <p className="texto-mensagem">{c.mensagem}</p>
      </Cartao>
      <h5 className="subtitulo">Pessoas ({envios.length})</h5>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Contato</th>
              <th>Situação</th>
              <th>Canal atual</th>
              <th>Clique</th>
              <th>Compra</th>
            </tr>
          </thead>
          <tbody>
            {envios.map((e) => (
              <tr key={e.id}>
                <td>{e.nome}</td>
                <td>
                  <span className={`badge ${e.estado === 'COMPROU' ? 'badge-green' : e.estado === 'SEM_CANAL' ? 'badge-gray' : 'badge-blue'}`}>{ESTADO_ENVIO[e.estado] ?? e.estado}</span>
                </td>
                <td>{e.canal_atual ? `${NOME_CANAL[e.canal_atual as keyof typeof NOME_CANAL]} (passo ${e.passo + 1})` : '—'}</td>
                <td>{fmtData(e.clicou_em)}</td>
                <td>{e.pedido_codigo ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="nota">Público congelado no disparo, a partir dos filtros: {JSON.stringify(c.segmento)}</p>
    </div>
  );
}
