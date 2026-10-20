import { useState } from 'react';
import { ErroApi, type Api, type EstadoPedido, type Pedido } from '../api.ts';
import { CaixaErro, Cartao, Estado, Kpi, PedirLogin, SemPermissao, useAcao, Vazio } from '../componentes/comum.tsx';
import { LeitorCamera, temCamera } from '../componentes/LeitorCamera.tsx';
import { PainelOcorrencias } from '../componentes/Ocorrencias.tsx';
import { fmtBRL, fmtData, fmtUSD, NOME_MODO } from '../formato.ts';
import { useEquipe } from '../equipe.tsx';
import { useApiEquipe, useCarga, useSessao } from '../sessao.tsx';

// T30 · RF-42 a RF-47 e RF-50: fila da central do Portal, coleta na loja,
// teste da loja, entrega por QR (T7) e conferência de saída do Scan & Go.

const OPERADOR = 'op-central-01';

export function Central() {
  const { api, erro, precisaLogin } = useApiEquipe('central', OPERADOR);
  const { pode, eu } = useEquipe();
  if (precisaLogin) return <PedirLogin />;
  if (erro) return <CaixaErro erro={erro} />;
  if (eu?.organizacao === 'LOJA' || !(pode('operacao.central') || pode('pedidos.ver'))) return <SemPermissao oQue="central do Portal" />;
  if (!api) return <p className="carregando">Entrando como equipe da central…</p>;
  return <PainelCentral api={api} />;
}

const COLUNAS: { titulo: string; estados: EstadoPedido[]; badge: string }[] = [
  { titulo: '1. A separar', estados: ['PAGO', 'EM_SEPARACAO'], badge: 'badge-gold' },
  { titulo: '2. Coleta pelo Portal', estados: ['EM_COLETA'], badge: 'badge-blue' },
  { titulo: '3. Teste na loja', estados: ['EM_TESTE_LOJA'], badge: 'badge-red' },
  { titulo: '4. Pronto / saída', estados: ['PRONTO_RETIRADA', 'LIBERADO_SAIDA'], badge: 'badge-red' },
  { titulo: '5. Retirado', estados: ['RETIRADO'], badge: 'badge-green' },
];

function PainelCentral({ api }: { api: Api }) {
  const { pode } = useEquipe();
  const fila = useCarga(() => api.filaCentral(), [api], 5000);
  const pedidos = fila.dados?.pedidos ?? [];
  const ind = fila.dados?.indicadores;
  const ativos = pedidos.filter((p) => p.estado !== 'RETIRADO');
  const noBalcao = ativos.filter((p) => p.cliente_chegou_em).length;
  const [qrInicial, setQrInicial] = useState('');

  return (
    <>
      {fila.erro && <CaixaErro erro={fila.erro} onTentar={fila.recarregar} />}
      <div className="grid-4">
        <Kpi rotulo="Fila ativa" valor={`${ativos.length} pedidos`} sub={`${noBalcao} cliente(s) avisaram que chegaram`} destaque="red" />
        <Kpi rotulo="Em teste na loja (RF-50)" valor={ind?.por_estado.EM_TESTE_LOJA ?? 0} sub="Aprovado → pronto · defeito → troca" />
        <Kpi
          rotulo="Tempos médios (RF-47)"
          valor={ind?.tempo_medio_separacao_min != null ? `${Math.round(ind.tempo_medio_separacao_min)} min` : '—'}
          sub={`separação · até a entrega: ${ind?.tempo_medio_entrega_min != null ? `${Math.round(ind.tempo_medio_entrega_min)} min` : '—'}`}
        />
        <Kpi rotulo="Ocorrências abertas" valor={ind?.ocorrencias_abertas ?? 0} sub={`${ind?.nao_retirados ?? 0} pedido(s) não retirado(s)`} />
      </div>

      <Cartao
        tag="T30 · RF-42 a RF-50"
        titulo="Fila de picking, coleta, teste da loja e entrega"
        extra={
          <span className="nota" aria-live="polite">
            {fila.carregando ? 'Atualizando…' : 'Atualiza a cada 5 s'}
          </span>
        }
      >
        <div className="kanban-board">
          {COLUNAS.map((c) => {
            const lista = pedidos.filter((p) => c.estados.includes(p.estado));
            return (
              <div key={c.titulo} className="kanban-col">
                <div className="kanban-col-header">
                  <span>
                    {c.titulo} ({lista.length})
                  </span>
                </div>
                {lista.length === 0 && <p className="nota">Vazio</p>}
                {lista.map((p) => (
                  <CartaoKanban key={p.id} p={p} api={api} aoMudar={fila.recarregar} aoConferir={() => setQrInicial(p.id)} />
                ))}
              </div>
            );
          })}
        </div>
      </Cartao>

      {pode('retirada.entregar') && <ConferenciaQr api={api} aoMudar={fila.recarregar} destacarPedido={qrInicial} pedidos={pedidos} />}

      {pode('ocorrencias.ver') && <PainelOcorrencias api={api} pedidos={pedidos} podeAbrir={pode('ocorrencias.abrir')} podeResolver={pode('ocorrencias.resolver')} />}
    </>
  );
}

function CartaoKanban({ p, api, aoMudar, aoConferir }: { p: Pedido; api: Api; aoMudar: () => Promise<void>; aoConferir: () => void }) {
  const { ocupado, executar } = useAcao();
  const { pode } = useEquipe();
  const opera = pode('operacao.central');
  const [divergindo, setDivergindo] = useState(false);
  const [div, setDiv] = useState<{ item_id: string; tipo: 'ITEM_FALTANTE' | 'ITEM_A_MAIS'; descricao: string }>({
    item_id: p.itens[0]?.id ?? '',
    tipo: 'ITEM_FALTANTE',
    descricao: '',
  });
  const lojas = [...new Set(p.itens.map((i) => i.loja_nome))];
  const acao = (chave: string, fn: () => Promise<unknown>, ok: string) =>
    executar(chave, async () => {
      await fn();
      await aoMudar();
    }, ok);

  return (
    <div className={`kanban-item ${p.cliente_chegou_em && p.estado !== 'RETIRADO' ? 'priority' : ''}`}>
      <div className="kanban-topo">
        <strong>{p.codigo}</strong>
        <span className="badge badge-blue">{NOME_MODO[p.modo]}</span>
      </div>
      {p.cliente_chegou_em && p.estado !== 'RETIRADO' && <span className="badge badge-red">🔔 Cliente no balcão</span>}
      <div className="kanban-cliente">👤 {p.cliente_nome ?? 'Cliente'}</div>
      <div className="nota">
        🏬 {lojas.join(', ')}
        <br />
        💵 {fmtUSD(p.valores.total_usd_centavos)} · {fmtBRL(p.valores.total_brl_centavos)}
        {p.janela_chegada && (
          <>
            <br />🕒 {p.janela_chegada}
          </>
        )}
        {p.operacao.coletado_por && (
          <>
            <br />👷 {p.operacao.coletado_por}
          </>
        )}
      </div>

      {p.estado === 'EM_TESTE_LOJA' && (
        <ul className="testes">
          {p.itens.map((i) => (
            <li key={i.id}>
              {i.teste_resultado === 'APROVADO' ? '✅' : i.teste_resultado === 'DEFEITO' ? '⚠️' : '⏳'} {i.nome_produto}
            </li>
          ))}
        </ul>
      )}

      {opera && p.estado === 'EM_SEPARACAO' && p.modo === 'RETIRADA_PORTAL' && (
        <button type="button" className="btn btn-sm btn-blue btn-block" disabled={!!ocupado} onClick={() => void acao('coleta', () => api.iniciarColeta(p.id), `Coleta do ${p.codigo} iniciada.`)}>
          🏃 Iniciar coleta na loja
        </button>
      )}
      {p.estado === 'EM_SEPARACAO' && p.modo === 'RETIRADA_LOJA' && <p className="nota">Separação feita pela loja.</p>}
      {opera && p.estado === 'EM_COLETA' && !divergindo && (
        <>
          <button
            type="button"
            className="btn btn-sm btn-blue btn-block"
            disabled={!!ocupado}
            onClick={() => void acao('conferir', () => api.conferirColeta(p.id), `${p.codigo} conferido e enviado ao teste da loja.`)}
          >
            🔬 Conferido · enviar ao teste da loja
          </button>
          <button type="button" className="btn btn-sm btn-outline-red btn-block" onClick={() => setDivergindo(true)}>
            Conferir com divergência
          </button>
        </>
      )}
      {p.estado === 'EM_COLETA' && divergindo && (
        <form
          className="form-divergencia"
          onSubmit={(e) => {
            e.preventDefault();
            void acao('conferir', () => api.conferirColeta(p.id, [{ ...div, descricao: div.descricao.trim() }]), 'Conferência registrada com ocorrência.');
          }}
        >
          <select className="form-control" aria-label="Item" value={div.item_id} onChange={(e) => setDiv({ ...div, item_id: e.target.value })}>
            {p.itens.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome_produto}
              </option>
            ))}
          </select>
          <select className="form-control" aria-label="Tipo" value={div.tipo} onChange={(e) => setDiv({ ...div, tipo: e.target.value as typeof div.tipo })}>
            <option value="ITEM_FALTANTE">Item faltante</option>
            <option value="ITEM_A_MAIS">Item a mais</option>
          </select>
          <input className="form-control" placeholder="O que foi encontrado" aria-label="Descrição" required value={div.descricao} onChange={(e) => setDiv({ ...div, descricao: e.target.value })} />
          <div className="botoes-linha">
            <button type="submit" className="btn btn-sm btn-primary" disabled={!!ocupado}>
              Registrar
            </button>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setDivergindo(false)}>
              Voltar
            </button>
          </div>
        </form>
      )}
      {pode('retirada.entregar') && (p.estado === 'PRONTO_RETIRADA' || p.estado === 'LIBERADO_SAIDA') && (
        <button type="button" className="btn btn-sm btn-primary btn-block" onClick={aoConferir}>
          📲 Ler QR e {p.estado === 'LIBERADO_SAIDA' ? 'conferir saída' : 'entregar'}
        </button>
      )}
      {p.estado === 'RETIRADO' && <p className="nota">Retirado {fmtData(p.operacao.retirado_em)}</p>}
    </div>
  );
}

/** T7 · RF-13, RF-44, RF-45: lê o QR, confere documento ou itens e registra a saída. */
export function ConferenciaQr({ api, aoMudar, destacarPedido, pedidos }: { api: Api; aoMudar: () => Promise<void>; destacarPedido: string; pedidos: Pedido[] }) {
  const { avisar } = useSessao();
  const { ocupado, executar } = useAcao();
  const [qr, setQr] = useState('');
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [documento, setDocumento] = useState(false);
  const [conferencia, setConferencia] = useState<'AMOSTRAGEM' | 'TOTAL'>('AMOSTRAGEM');
  const [divergencia, setDivergencia] = useState('');
  const [camera, setCamera] = useState(false);
  const esperado = pedidos.find((p) => p.id === destacarPedido);

  const consultar = async (valor: string) => {
    setErro(null);
    setPedido(null);
    try {
      setPedido(await api.consultarQr(valor.trim()));
      setDocumento(false);
      setDivergencia('');
    } catch (e) {
      setErro(e instanceof ErroApi && e.codigo === 'qr-ja-usado' ? 'Este QR já foi usado. A retirada não pode ser repetida.' : e instanceof Error ? e.message : String(e));
    }
  };

  const concluir = () =>
    executar('concluir', async () => {
      if (!pedido) return;
      try {
        const r =
          pedido.estado === 'LIBERADO_SAIDA'
            ? await api.liberarSaida(pedido.id, qr.trim(), conferencia, divergencia.trim() ? { descricao: divergencia.trim() } : undefined)
            : await api.confirmarRetirada(pedido.id, qr.trim(), documento);
        setPedido(r);
        if (r.estado === 'RETIRADO') {
          avisar(`✅ ${r.codigo} entregue. A responsabilidade passa a ser da loja (3.3.2).`);
          setQr('');
          setPedido(null);
        } else {
          avisar(`Divergência registrada no ${r.codigo}. A saída fica bloqueada até a ocorrência ser resolvida.`, 'erro');
        }
        await aoMudar();
      } catch (e) {
        if (e instanceof ErroApi && e.codigo === 'qr-ja-usado') setErro('Este QR já foi usado. A retirada não pode ser repetida.');
        throw e;
      }
    });

  return (
    <Cartao tag="T7 · RF-13 · RF-44 · RF-45" titulo="Conferência de QR e entrega ao cliente">
      <div className="grid-2">
        <div>
          {esperado && (
            <p className="nota">
              Aguardando o QR do pedido <strong>{esperado.codigo}</strong> ({esperado.cliente_nome}).
            </p>
          )}
          {camera ? (
            <LeitorCamera
              aoLer={(v) => {
                setQr(v);
                setCamera(false);
                void consultar(v);
              }}
              aoFechar={() => setCamera(false)}
            />
          ) : (
            <form
              className="busca"
              onSubmit={(e) => {
                e.preventDefault();
                void consultar(qr);
              }}
            >
              <input className="form-control" placeholder="Leia ou cole o código do QR (PG1…)" aria-label="Código do QR" value={qr} onChange={(e) => setQr(e.target.value)} />
              <button type="submit" className="btn btn-sm btn-blue" disabled={!qr.trim()}>
                Consultar
              </button>
            </form>
          )}
          {temCamera() && !camera && (
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setCamera(true)}>
              📷 Ler com a câmera
            </button>
          )}
          <p className="nota">No ambiente de teste, copie o código em “Meus pedidos” do turista e cole aqui.</p>
          {erro && (
            <div className="caixa-erro" role="alert">
              {erro}
            </div>
          )}
        </div>

        <div>
          {!pedido ? (
            <Vazio>Leia um QR para ver o pedido.</Vazio>
          ) : (
            <div className="conferencia">
              <div className="kanban-topo">
                <strong>
                  {pedido.codigo} · {pedido.cliente_nome ?? 'Cliente'}
                </strong>
                <Estado estado={pedido.estado} />
              </div>
              <ul className="itens-pedido">
                {pedido.itens.map((i) => (
                  <li key={i.id}>
                    {i.quantidade}× {i.nome_produto} <span className="nota">({i.loja_nome})</span>
                  </li>
                ))}
              </ul>

              {pedido.estado === 'PRONTO_RETIRADA' && (
                <label className="marca">
                  <input type="checkbox" checked={documento} onChange={(e) => setDocumento(e.target.checked)} /> Documento com foto conferido
                </label>
              )}
              {pedido.estado === 'LIBERADO_SAIDA' && (
                <>
                  <fieldset className="opcoes">
                    <legend>Conferência de saída</legend>
                    <label>
                      <input type="radio" name="conf" checked={conferencia === 'AMOSTRAGEM'} onChange={() => setConferencia('AMOSTRAGEM')} /> Por amostragem
                    </label>
                    <label>
                      <input type="radio" name="conf" checked={conferencia === 'TOTAL'} onChange={() => setConferencia('TOTAL')} /> Total
                    </label>
                  </fieldset>
                  <label htmlFor="divergencia">Divergência encontrada (deixe vazio se conferiu)</label>
                  <input id="divergencia" className="form-control" value={divergencia} onChange={(e) => setDivergencia(e.target.value)} placeholder="Ex.: 1 perfume a mais na sacola" />
                </>
              )}
              {pedido.estado !== 'PRONTO_RETIRADA' && pedido.estado !== 'LIBERADO_SAIDA' ? (
                <p className="nota">Este pedido não está pronto para entrega.</p>
              ) : (
                <button
                  type="button"
                  className={`btn btn-block ${divergencia.trim() ? 'btn-outline-red' : 'btn-primary'}`}
                  disabled={ocupado === 'concluir' || (pedido.estado === 'PRONTO_RETIRADA' && !documento)}
                  onClick={() => void concluir()}
                >
                  {pedido.estado === 'LIBERADO_SAIDA' ? (divergencia.trim() ? 'Registrar divergência' : '✅ Liberar saída') : '✅ Confirmar entrega'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </Cartao>
  );
}
