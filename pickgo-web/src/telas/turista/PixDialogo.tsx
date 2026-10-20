import { useEffect, useState } from 'react';
import type { Pedido } from '../../api.ts';
import { CaixaErro, Dialogo, Estado, Qr, useAcao } from '../../componentes/comum.tsx';
import { fmtBRL, fmtUSD, NOME_MODO } from '../../formato.ts';
import { useApiCliente, useSessao } from '../../sessao.tsx';

// T3 · RF-06 e RF-07: cobrança Pix com QR e copia-e-cola; a confirmação chega
// pelo webhook do provedor, então o app consulta o pedido até sair do AGUARDANDO_PIX.

function useRelogio(ate: string | undefined) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (!ate) return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ate]);
  if (!ate) return null;
  const s = Math.max(0, Math.floor((new Date(ate).getTime() - agora) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function PixDialogo({ pedidoId, aoFechar, aoVerPedidos }: { pedidoId: string | null; aoFechar: () => void; aoVerPedidos: () => void }) {
  return (
    <Dialogo aberto={!!pedidoId} aoFechar={aoFechar} titulo="💠 T3 · Pagamento por Pix">
      {pedidoId && <ConteudoPix pedidoId={pedidoId} aoVerPedidos={aoVerPedidos} />}
    </Dialogo>
  );
}

function ConteudoPix({ pedidoId, aoVerPedidos }: { pedidoId: string; aoVerPedidos: () => void }) {
  const api = useApiCliente();
  const { avisar } = useSessao();
  const { ocupado, executar } = useAcao();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [envios, setEnvios] = useState<string[]>([]);

  // Abre o pedido e gera a cobrança se ainda não houver.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        let p = await api.pedido(pedidoId);
        // Repetir é seguro: o backend devolve a cobrança já gerada.
        if (p.estado === 'CRIADO') p = await api.gerarPix(pedidoId);
        if (vivo) setPedido(p);
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      vivo = false;
    };
  }, [api, pedidoId]);

  // Acompanha a confirmação do webhook.
  const aguardando = pedido?.estado === 'AGUARDANDO_PIX';
  useEffect(() => {
    if (!aguardando) return;
    const t = setInterval(async () => {
      try {
        const p = await api.pedido(pedidoId);
        setPedido(p);
        if (p.estado !== 'AGUARDANDO_PIX') avisar(`Pix confirmado! Pedido ${p.codigo}: ${p.estado.replaceAll('_', ' ').toLowerCase()}.`);
      } catch {
        // tenta de novo no próximo ciclo
      }
    }, 2500);
    return () => clearInterval(t);
  }, [aguardando, api, pedidoId, avisar]);

  const relogio = useRelogio(aguardando ? pedido?.pagamento?.expira_em : undefined);

  if (erro) return <CaixaErro erro={erro} />;
  if (!pedido) return <p className="carregando">Gerando cobrança Pix…</p>;

  const pag = pedido.pagamento;
  const simular = () =>
    executar('simular', async () => {
      const r = await api.simularPagamentoPix(pag!.txid);
      const res = r.resultados[0]?.resultado ?? 'sem resposta';
      setEnvios((e) => [...e, res]);
      setPedido(await api.pedido(pedidoId));
      return res;
    });

  return (
    <div className="grid-2 pix">
      <div className="qr-box">
        {aguardando && pag?.copia_e_cola ? (
          <>
            <span className="badge badge-blue">⏱️ Expira em {relogio}</span>
            <Qr valor={pag.copia_e_cola} rotulo="QR Code Pix para pagamento" />
            <div className="pix-valor">{fmtBRL(pedido.valores.total_brl_centavos)}</div>
            <input type="text" className="form-control copia-cola" value={pag.copia_e_cola} readOnly aria-label="Código Pix copia e cola" onFocus={(e) => e.target.select()} />
            <button
              type="button"
              className="btn btn-sm btn-outline btn-block"
              onClick={() => {
                void navigator.clipboard?.writeText(pag.copia_e_cola!).then(() => avisar('Código Pix copiado.'));
              }}
            >
              📋 Copiar código Pix
            </button>
          </>
        ) : (
          <>
            <Estado estado={pedido.estado} />
            <div className="pix-valor">{fmtBRL(pedido.valores.total_brl_centavos)}</div>
            {pedido.qr ? (
              <>
                <Qr valor={pedido.qr} tamanho={140} rotulo={`QR do pedido ${pedido.codigo}`} />
                <p className="nota">Este é o QR de {pedido.modo === 'SCAN_GO' ? 'saída' : 'retirada'} do pedido.</p>
              </>
            ) : (
              <p className="nota">Cobrança encerrada ({pag?.estado ?? 'sem cobrança'}).</p>
            )}
          </>
        )}
      </div>

      <div>
        <h4 className="subtitulo">Pedido {pedido.codigo}</h4>
        <dl className="resumo">
          <div>
            <dt>Recebimento</dt>
            <dd>{NOME_MODO[pedido.modo]}</dd>
          </div>
          <div>
            <dt>Produtos</dt>
            <dd>
              {fmtUSD(pedido.valores.total_usd_centavos)} · {fmtBRL(pedido.valores.subtotal_brl_centavos)}
            </dd>
          </div>
          <div>
            <dt>Taxas Pix e câmbio</dt>
            <dd>{fmtBRL(pedido.valores.taxa_pix_brl_centavos + pedido.valores.taxa_cambio_brl_centavos)}</dd>
          </div>
          <div className="resumo-total">
            <dt>Total</dt>
            <dd>{fmtBRL(pedido.valores.total_brl_centavos)}</dd>
          </div>
        </dl>
        {pedido.avisos?.map((a) => (
          <div key={a.codigo} className="quota-alert warning">
            {a.mensagem}
          </div>
        ))}

        {pag && (
          <div className="caixa-teste">
            <strong>Ambiente de teste</strong>
            <p>Simula o banco do cliente pagando: o backend recebe um webhook assinado, lança o split no ledger e libera o pedido.</p>
            <div className="botoes-coluna">
              <button type="button" className="btn btn-success btn-block" disabled={!aguardando || ocupado === 'simular'} onClick={() => void simular()}>
                ✅ Simular pagamento do Pix
              </button>
              <button type="button" className="btn btn-outline-red btn-block" disabled={aguardando || envios.length === 0 || ocupado === 'simular'} onClick={() => void simular()}>
                🔁 Reenviar o webhook (teste de idempotência)
              </button>
            </div>
            {envios.length > 0 && (
              <p className="nota">
                Webhooks enviados: {envios.length} · respostas: {envios.join(', ')}
                {envios.length > 1 && ' — o split foi lançado uma única vez.'}
              </p>
            )}
          </div>
        )}

        {!aguardando && pedido.estado !== 'CRIADO' && (
          <button type="button" className="btn btn-blue btn-block" onClick={aoVerPedidos}>
            📦 Ver meus pedidos e o QR
          </button>
        )}
      </div>
    </div>
  );
}
