import { useState } from 'react';
import type { Api, ConfigPublica, Lancamento } from '../api.ts';
import { CaixaErro, Cartao, Estado, Kpi, PedirLogin, SemPermissao, useAcao, Vazio } from '../componentes/comum.tsx';
import { fmtBRL, fmtData, fmtPct, NOME_MODO, nomeConta } from '../formato.ts';
import { useEquipe } from '../equipe.tsx';
import { useApiEquipe, useCarga } from '../sessao.tsx';

// T10 · RF-26, RF-27, RF-08, RF-09: vendas, split no ledger de dupla entrada,
// estorno com reversão e exportação para conciliação.

export function Plataforma({ config }: { config: ConfigPublica | null }) {
  const { api, erro, precisaLogin } = useApiEquipe('admin', 'admin-portal');
  const { pode } = useEquipe();
  if (precisaLogin) return <PedirLogin />;
  if (erro) return <CaixaErro erro={erro} />;
  if (!pode('financeiro.plataforma')) return <SemPermissao oQue="painel da plataforma" />;
  if (!api) return <p className="carregando">Entrando como administrador…</p>;
  return <PainelPlataforma api={api} config={config} />;
}

const ESTORNAVEIS = new Set(['PAGO', 'EM_SEPARACAO', 'PRONTO_RETIRADA', 'LIBERADO_SAIDA', 'RETIRADO', 'NAO_RETIRADO']);

function soma(saldos: Record<string, number>, filtro: (conta: string) => boolean) {
  return Object.entries(saldos)
    .filter(([c]) => filtro(c))
    .reduce((s, [, v]) => s + v, 0);
}

function PainelPlataforma({ api, config }: { api: Api; config: ConfigPublica | null }) {
  const rel = useCarga(() => api.relatorioPlataforma(), [api], 10_000);
  const pedidos = useCarga(() => api.todosPedidos(), [api], 10_000);
  const [pedidoFiltro, setPedidoFiltro] = useState('');
  const lanc = useCarga(() => api.lancamentos({ pedido_id: pedidoFiltro || undefined, limite: 200 }), [api, pedidoFiltro], 10_000);
  const { ocupado, executar } = useAcao();
  const { pode } = useEquipe();

  const saldos = rel.dados?.saldos_por_conta ?? {};
  const lojas = soma(saldos, (c) => /^loja:.+:repasse$/.test(c));
  const portal = saldos['portal:comissao'] ?? 0;
  const epyx = soma(saldos, (c) => c.startsWith('epyx:'));
  const estornos = saldos['pix:estornos_a_pagar'] ?? 0;
  const recarregarTudo = () => Promise.all([rel.recarregar(), pedidos.recarregar(), lanc.recarregar()]);

  const estornar = (pedidoId: string, codigo: string) =>
    executar(
      `estorno-${pedidoId}`,
      async () => {
        if (!confirm(`Estornar o pedido ${codigo}? O split será revertido com lançamentos inversos.`)) return null;
        const p = await api.pedido(pedidoId);
        if (!p.pagamento || p.pagamento.estado !== 'CONFIRMADO') throw new Error('O pedido não tem pagamento confirmado para estornar.');
        const r = await api.estornar(p.pagamento.id);
        await recarregarTudo();
        return r;
      },
      (r) => (r ? `Pedido ${codigo} estornado. Split revertido no ledger.` : 'Estorno cancelado.'),
    );

  const exportar = () => {
    const linhas = lanc.dados?.lancamentos ?? [];
    const cab = ['id', 'criado_em', 'pedido', 'transacao_id', 'conta_debito', 'conta_credito', 'valor_reais', 'tipo'];
    const csv = [
      cab.join(';'),
      ...linhas.map((l) =>
        [l.id, l.criado_em, l.pedido_codigo ?? l.pedido_id ?? '', l.transacao_id, l.conta_debito, l.conta_credito, (l.valor_centavos / 100).toFixed(2).replace('.', ','), l.tipo].join(';'),
      ),
    ].join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `ledger-pickgo-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {rel.erro && <CaixaErro erro={rel.erro} onTentar={rel.recarregar} />}
      <div className="grid-4">
        <Kpi rotulo="Vendas (GMV no Pix)" valor={rel.dados ? fmtBRL(rel.dados.gmv_brl_centavos) : '—'} sub={estornos ? `Estornos a pagar: ${fmtBRL(estornos)}` : 'Sem estornos pendentes'} />
        <Kpi rotulo={`Repasse às lojas${config ? ` (${fmtPct(10_000 - config.comissao_portal_bps - config.comissao_epyx_bps)})` : ''}`} valor={fmtBRL(lojas)} sub="Saldo no ledger, já com ajustes" />
        <Kpi rotulo={`Comissão Portal${config ? ` (${fmtPct(config.comissao_portal_bps)})` : ''}`} valor={fmtBRL(portal)} sub="Operação da central inclusa (RF-46)" destaque="red" />
        <Kpi
          rotulo="EPYX"
          valor={fmtBRL(epyx)}
          sub={config ? `${fmtPct(config.comissao_epyx_bps)} + Pix ${fmtPct(config.taxa_pix_bps)} + câmbio ${fmtPct(config.taxa_cambio_bps)}` : undefined}
        />
      </div>

      <div className="grid-2">
        <Cartao tag="RF-26" titulo="Vendas por loja">
          {rel.dados?.por_loja.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Loja</th>
                    <th>Bruto</th>
                    <th>Repasse (saldo)</th>
                  </tr>
                </thead>
                <tbody>
                  {rel.dados.por_loja.map((l) => (
                    <tr key={l.loja_id}>
                      <td>{l.loja_nome ?? l.loja_id}</td>
                      <td>{fmtBRL(l.bruto_brl_centavos)}</td>
                      <td>{fmtBRL(l.liquido_brl_centavos ?? saldos[`loja:${l.loja_id}:repasse`] ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Vazio>Sem vendas ainda.</Vazio>
          )}
        </Cartao>
        <Cartao tag="Ledger" titulo="Saldos por conta">
          {Object.keys(saldos).length ? (
            <div className="table-wrap">
              <table>
                <tbody>
                  {Object.entries(saldos)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([c, v]) => (
                      <tr key={c}>
                        <td>
                          {nomeConta(c)} <code>{c}</code>
                        </td>
                        <td className={v < 0 ? 'valor-negativo' : ''}>{fmtBRL(v)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Vazio>Sem lançamentos.</Vazio>
          )}
          <p className="nota">Saldo = créditos − débitos. Recebimentos Pix fica negativo pelo total recebido, e a soma de todas as contas é zero.</p>
        </Cartao>
      </div>

      <Cartao tag="RF-08 · RF-09 · RF-31" titulo="Pedidos e estorno com reversão do split" vermelho>
        {pedidos.erro && <CaixaErro erro={pedidos.erro} onTentar={pedidos.recarregar} />}
        {pedidos.dados?.pedidos.length === 0 && <Vazio>Nenhum pedido.</Vazio>}
        {!!pedidos.dados?.pedidos.length && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Data</th>
                  <th>Modo</th>
                  <th>Estado</th>
                  <th>Total</th>
                  <th>Ledger</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {pedidos.dados.pedidos.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.codigo}</strong>
                    </td>
                    <td>{fmtData(p.criado_em)}</td>
                    <td>{NOME_MODO[p.modo]}</td>
                    <td>
                      <Estado estado={p.estado} />
                    </td>
                    <td>{fmtBRL(p.total_brl_centavos)}</td>
                    <td>
                      <button type="button" className="btn btn-sm btn-outline" onClick={() => setPedidoFiltro(pedidoFiltro === p.id ? '' : p.id)}>
                        {pedidoFiltro === p.id ? 'Ver todos' : 'Ver lançamentos'}
                      </button>
                    </td>
                    <td>
                      {ESTORNAVEIS.has(p.estado) && pode('estorno.executar') ? (
                        <button type="button" className="btn btn-sm btn-outline-red" disabled={!!ocupado} onClick={() => void estornar(p.id, p.codigo)}>
                          ↩️ Estornar
                        </button>
                      ) : (
                        <span className="nota">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      <Cartao
        tag="Seção 5.3 · RF-27"
        titulo={pedidoFiltro ? `Ledger do pedido ${pedidos.dados?.pedidos.find((p) => p.id === pedidoFiltro)?.codigo ?? ''}` : 'Ledger de dupla entrada (últimos 200)'}
        extra={
          <button type="button" className="btn btn-sm btn-outline" disabled={!lanc.dados?.lancamentos.length} onClick={exportar}>
            📥 Exportar CSV
          </button>
        }
      >
        {lanc.erro && <CaixaErro erro={lanc.erro} onTentar={lanc.recarregar} />}
        {pedidoFiltro && lanc.dados && <ProvaSplit lancamentos={lanc.dados.lancamentos} />}
        {lanc.dados?.lancamentos.length === 0 && <Vazio>Nenhum lançamento.</Vazio>}
        {!!lanc.dados?.lancamentos.length && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Pedido</th>
                  <th>Débito</th>
                  <th>Crédito</th>
                  <th>Valor</th>
                  <th>Tipo</th>
                </tr>
              </thead>
              <tbody>
                {lanc.dados.lancamentos.map((l) => (
                  <tr key={l.id}>
                    <td>{fmtData(l.criado_em)}</td>
                    <td>{l.pedido_codigo ?? '—'}</td>
                    <td>{nomeConta(l.conta_debito)}</td>
                    <td>{nomeConta(l.conta_credito)}</td>
                    <td className={l.tipo.startsWith('ESTORNO') ? 'valor-negativo' : ''}>{fmtBRL(l.valor_centavos)}</td>
                    <td>
                      <span className={`badge ${l.tipo.startsWith('ESTORNO') ? 'badge-red' : 'badge-blue'}`}>{l.tipo}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="nota">Lançamentos são imutáveis: estorno e ajuste criam lançamentos novos.</p>
      </Cartao>
    </>
  );
}

/** Mostra que o split de um pagamento fecha exatamente com o valor recebido (critério 14.2). */
function ProvaSplit({ lancamentos }: { lancamentos: Lancamento[] }) {
  const recebido = lancamentos.filter((l) => l.conta_debito === 'pix:recebimentos');
  if (!recebido.length) return null;
  const total = recebido.reduce((s, l) => s + l.valor_centavos, 0);
  return (
    <div className="prova-split">
      <strong>Divisão do valor recebido:</strong>{' '}
      {recebido.map((l) => (
        <span key={l.id}>
          {nomeConta(l.conta_credito)} {fmtBRL(l.valor_centavos)} ·{' '}
        </span>
      ))}
      <span className="badge badge-green">Soma {fmtBRL(total)}</span>
    </div>
  );
}
