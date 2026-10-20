import { useState } from 'react';
import type { Pedido } from '../../api.ts';
import { CaixaErro, Cartao, Estado, Qr, useAcao, Vazio } from '../../componentes/comum.tsx';
import { fmtBRL, fmtData, fmtUSD, NOME_MODO } from '../../formato.ts';
import { useApiCliente, useCarga } from '../../sessao.tsx';

// T4 · T19 · RF-11 e RF-12: status do pedido, QR de retirada ou de saída e "Avisar que cheguei".

const ETAPAS_RETIRADA_PORTAL = ['PAGO', 'EM_SEPARACAO', 'EM_COLETA', 'EM_TESTE_LOJA', 'PRONTO_RETIRADA', 'RETIRADO'] as const;
const ETAPAS_RETIRADA_LOJA = ['PAGO', 'EM_SEPARACAO', 'PRONTO_RETIRADA', 'RETIRADO'] as const;
const ETAPAS_SCAN_GO = ['PAGO', 'LIBERADO_SAIDA', 'RETIRADO'] as const;
const ROTULO_ETAPA: Record<string, string> = {
  PAGO: 'Pago',
  EM_SEPARACAO: 'Separação',
  EM_COLETA: 'Coleta',
  EM_TESTE_LOJA: 'Teste na loja',
  PRONTO_RETIRADA: 'Pronto',
  LIBERADO_SAIDA: 'Saída liberada',
  RETIRADO: 'Retirado',
};

const AGUARDA_RETIRADA = new Set(['EM_SEPARACAO', 'EM_COLETA', 'EM_TESTE_LOJA', 'PRONTO_RETIRADA']);

export function MeusPedidos({ aoPagar, irParaCentral }: { aoPagar: (id: string) => void; irParaCentral: () => void }) {
  const api = useApiCliente();
  // A lista traz o resumo; os detalhes (itens e QR) vêm de GET /pedidos/{id}.
  const lista = useCarga(
    async () => {
      const r = await api.meusPedidos();
      return Promise.all(r.pedidos.slice(0, 20).map((p) => api.pedido(p.id)));
    },
    [api],
    10_000,
  );

  return (
    <Cartao
      tag="T4 · T6 · T19 · RF-11 a RF-13"
      titulo="Meus pedidos"
      extra={
        <button type="button" className="btn btn-sm btn-outline" onClick={() => void lista.recarregar()} disabled={lista.carregando}>
          {lista.carregando ? 'Atualizando…' : '↻ Atualizar'}
        </button>
      }
    >
      {lista.erro && <CaixaErro erro={lista.erro} onTentar={lista.recarregar} />}
      {lista.dados?.length === 0 && <Vazio>Você ainda não fez pedidos.</Vazio>}
      <div className="lista-pedidos">
        {lista.dados?.map((p) => (
          <CartaoPedido key={p.id} pedido={p} aoPagar={aoPagar} irParaCentral={irParaCentral} aoMudar={lista.recarregar} />
        ))}
      </div>
    </Cartao>
  );
}

function CartaoPedido({
  pedido: p,
  aoPagar,
  irParaCentral,
  aoMudar,
}: {
  pedido: Pedido;
  aoPagar: (id: string) => void;
  irParaCentral: () => void;
  aoMudar: () => Promise<void>;
}) {
  const api = useApiCliente();
  const { ocupado, executar } = useAcao();
  const [reclamando, setReclamando] = useState(false);
  const [descricao, setDescricao] = useState('');

  const etapas = p.modo === 'SCAN_GO' ? ETAPAS_SCAN_GO : p.modo === 'RETIRADA_LOJA' ? ETAPAS_RETIRADA_LOJA : ETAPAS_RETIRADA_PORTAL;
  const idxAtual = (etapas as readonly string[]).indexOf(p.estado);
  const lojas = [...new Set(p.itens.map((i) => i.loja_nome))];

  const acao = (chave: string, fn: () => Promise<unknown>, ok: string) =>
    executar(chave, async () => {
      await fn();
      await aoMudar();
    }, ok);

  return (
    <article className="pedido">
      <header className="pedido-topo">
        <div>
          <strong className="pedido-codigo">Pedido {p.codigo}</strong>
          <span className="nota">
            {fmtData(p.criado_em)} · {NOME_MODO[p.modo]}
          </span>
        </div>
        <Estado estado={p.estado} />
      </header>

      {idxAtual >= 0 && (
        <ol className="linha-etapas" aria-label="Andamento do pedido">
          {etapas.map((e, i) => (
            <li key={e} className={i < idxAtual ? 'feita' : i === idxAtual ? 'atual' : ''}>
              {ROTULO_ETAPA[e]}
            </li>
          ))}
        </ol>
      )}

      <div className="grid-2 pedido-corpo">
        <div>
          <ul className="itens-pedido">
            {p.itens.map((i) => (
              <li key={i.id}>
                <strong>
                  {i.quantidade}× {i.nome_produto}
                </strong>{' '}
                <span className="nota">
                  ({i.loja_nome}) · {fmtUSD(i.subtotal_usd_centavos)}
                </span>
              </li>
            ))}
          </ul>
          <div className="nota">
            Total pago: <strong className="destaque">{fmtBRL(p.valores.total_brl_centavos)}</strong> · {fmtUSD(p.valores.total_usd_centavos)} a R${' '}
            {p.valores.cotacao_usd_brl.toFixed(4).replace('.', ',')}
          </div>
          {p.janela_chegada && <div className="nota">Chegada prevista: {p.janela_chegada}</div>}
          {p.estado === 'PRONTO_RETIRADA' && (
            <div className="quota-alert">
              <strong>Pronto!</strong> Retire em {p.modo === 'RETIRADA_LOJA' ? lojas.join(', ') : 'a central do Portal Paraguai'} com o QR e um documento com foto.
            </div>
          )}
          {p.estado === 'RETIRADO' && <div className="nota">Retirado em {fmtData(p.operacao.retirado_em)}.</div>}

          <div className="botoes-linha">
            {p.estado === 'AGUARDANDO_PIX' || p.estado === 'CRIADO' ? (
              <>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => aoPagar(p.id)}>
                  💠 Pagar Pix
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-red"
                  disabled={ocupado === 'cancelar'}
                  onClick={() => void acao('cancelar', () => api.cancelar(p.id), `Pedido ${p.codigo} cancelado.`)}
                >
                  Cancelar pedido
                </button>
              </>
            ) : null}
            {AGUARDA_RETIRADA.has(p.estado) && (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={!!p.cliente_chegou_em || ocupado === 'cheguei'}
                onClick={() => void acao('cheguei', () => api.cheguei(p.id), 'A equipe foi avisada. Vá ao ponto de retirada com seu documento.')}
              >
                📍 {p.cliente_chegou_em ? `Aviso enviado às ${fmtData(p.cliente_chegou_em).split(' ')[1]}` : 'Avisar que cheguei'}
              </button>
            )}
            {(p.estado === 'PRONTO_RETIRADA' || p.estado === 'LIBERADO_SAIDA') && (
              <button type="button" className="btn btn-sm btn-outline" onClick={irParaCentral}>
                Abrir a conferência da equipe (teste)
              </button>
            )}
            {p.estado === 'RETIRADO' && !reclamando && (
              <button type="button" className="btn btn-sm btn-outline-red" onClick={() => setReclamando(true)}>
                🛠️ Relatar defeito
              </button>
            )}
          </div>

          {reclamando && (
            <form
              className="form-reclamacao"
              onSubmit={(e) => {
                e.preventDefault();
                void executar(
                  'reclamar',
                  async () => {
                    await api.abrirOcorrencia({ pedido_id: p.id, tipo: 'DEFEITO_POS_SAIDA', descricao: descricao.trim() });
                    setReclamando(false);
                    setDescricao('');
                  },
                  'Recebemos seu relato. O chamado foi encaminhado à loja, que cuida da garantia.',
                );
              }}
            >
              <label htmlFor={`defeito-${p.id}`}>O que aconteceu com o produto?</label>
              <textarea id={`defeito-${p.id}`} className="form-control" rows={3} required minLength={5} maxLength={1000} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
              <p className="nota">Depois da saída, a garantia é da loja (regra 3.3.2).</p>
              <div className="botoes-linha">
                <button type="submit" className="btn btn-sm btn-primary" disabled={ocupado === 'reclamar'}>
                  Enviar relato
                </button>
                <button type="button" className="btn btn-sm btn-outline" onClick={() => setReclamando(false)}>
                  Voltar
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="qr-box">
          {p.qr ? (
            <>
              <span className="badge badge-green">{p.modo === 'SCAN_GO' ? 'QR de saída' : 'QR de retirada'}</span>
              <Qr valor={p.qr} tamanho={150} rotulo={`QR do pedido ${p.codigo}`} />
              <code className="qr-token" title={p.qr}>
                {p.qr.slice(0, 18)}…
              </code>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => void navigator.clipboard?.writeText(p.qr!)}
                title="Para colar na conferência da central no ambiente de teste"
              >
                Copiar código do QR
              </button>
              {p.estado !== 'PRONTO_RETIRADA' && p.estado !== 'LIBERADO_SAIDA' && <p className="nota">Válido quando o pedido ficar pronto.</p>}
            </>
          ) : (
            <p className="nota">
              {p.estado === 'RETIRADO' ? '✓ QR já utilizado' : p.estado === 'AGUARDANDO_PIX' ? 'O QR aparece depois do Pix.' : 'Sem QR para este pedido.'}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
