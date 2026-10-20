import { useEffect, useState } from 'react';
import { criarApi, type Api, type ConfigPublica, type ItemPedido, type Loja, type Pedido } from '../api.ts';
import { CaixaErro, Cartao, Estado, Kpi, PedirLogin, SemPermissao, useAcao, Vazio } from '../componentes/comum.tsx';
import { GestaoCatalogo } from '../componentes/GestaoCatalogo.tsx';
import { PainelOcorrencias } from '../componentes/Ocorrencias.tsx';
import { aplicarBps, fmtBRL, fmtData, fmtPct, NOME_MODO } from '../formato.ts';
import { modoKeycloak, useEquipe } from '../equipe.tsx';
import { useApiEquipe, useCarga } from '../sessao.tsx';
import { ConferenciaQr } from './Central.tsx';

// T9 · RF-25, RF-49, RF-50: vendas e comissão da loja, separação das retiradas
// no balcão e bancada de teste de defeitos antes da liberação ao cliente.

export function Lojista({ config }: { config: ConfigPublica | null }) {
  const lojas = useCarga(() => criarApi(null).lojas(), []);
  const [lojaId, setLojaId] = useState('');
  const equipe = useEquipe();
  useEffect(() => {
    if (!modoKeycloak && !lojaId && lojas.dados?.lojas[0]) setLojaId(lojas.dados.lojas[0].id);
  }, [lojas.dados, lojaId]);

  // Com Keycloak, a loja é a de quem entrou; não há seletor.
  if (modoKeycloak) {
    if (equipe.carregando) return <p className="carregando">Verificando a sessão…</p>;
    if (!equipe.token) return <PedirLogin motivo="Entre com a conta da sua loja para ver pedidos, catálogo e vendas." />;
    if (!equipe.eu) return <p className="carregando">Carregando seu acesso…</p>;
    if (equipe.eu.organizacao !== 'LOJA' || !equipe.eu.loja_id) return <SemPermissao oQue="painel da loja (é para as equipes das lojas)" />;
    return <PainelDaLojaComLogin lojaId={equipe.eu.loja_id} config={config} lojas={lojas.dados?.lojas ?? []} />;
  }

  return (
    <>
      <div className="barra-cliente">
        <label htmlFor="loja-painel">
          🏪 Loja: <span className="nota">(no piloto, o login da loja é simulado)</span>
        </label>
        <select id="loja-painel" className="form-control seletor-loja" value={lojaId} onChange={(e) => setLojaId(e.target.value)}>
          {lojas.dados?.lojas.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nome}
            </option>
          ))}
        </select>
      </div>
      {lojas.erro && <CaixaErro erro={lojas.erro} onTentar={lojas.recarregar} />}
      {lojaId && <PainelDaLojaComLogin key={lojaId} lojaId={lojaId} config={config} lojas={lojas.dados?.lojas ?? []} />}
    </>
  );
}

function PainelDaLojaComLogin({ lojaId, config, lojas }: { lojaId: string; config: ConfigPublica | null; lojas: Loja[] }) {
  const { api, erro } = useApiEquipe('lojista', `lojista-${lojaId}`, lojaId);
  const { pode } = useEquipe();
  if (erro) return <CaixaErro erro={erro} />;
  if (!api) return <p className="carregando">Entrando como lojista…</p>;
  return (
    <>
      {pode('pedidos.ver') && <PainelDaLoja api={api} lojaId={lojaId} config={config} />}
      {pode('catalogo.ver') && <GestaoCatalogo api={api} config={config} lojas={lojas} lojaFixa={lojaId} />}
    </>
  );
}

function PainelDaLoja({ api, lojaId, config }: { api: Api; lojaId: string; config: ConfigPublica | null }) {
  const { pode } = useEquipe();
  const relatorio = useCarga(pode('financeiro.loja') ? () => api.relatorioLoja(lojaId) : null, [api, lojaId], 15_000);
  const pedidos = useCarga(() => api.pedidosDaLoja(), [api], 5000);
  const lista = pedidos.dados?.pedidos ?? [];
  const recarregar = async () => {
    await Promise.all([pedidos.recarregar(), relatorio.recarregar()]);
  };

  const meus = (p: Pedido) => p.itens.filter((i) => i.loja_id === lojaId);
  const emTeste = lista.filter((p) => p.estado === 'EM_TESTE_LOJA' && meus(p).some((i) => i.teste_resultado !== 'APROVADO'));
  const aSeparar = lista.filter((p) => p.modo === 'RETIRADA_LOJA' && p.estado === 'EM_SEPARACAO');
  const noBalcao = lista.filter((p) => p.modo === 'RETIRADA_LOJA' && p.estado === 'PRONTO_RETIRADA');
  const r = relatorio.dados;
  const pctLoja = config ? 10_000 - config.comissao_portal_bps - config.comissao_epyx_bps : null;

  return (
    <>
      {relatorio.erro && <CaixaErro erro={relatorio.erro} onTentar={relatorio.recarregar} />}
      {pode('financeiro.loja') && (
      <div className="grid-4">
        <Kpi rotulo="Vendas brutas" valor={r ? fmtBRL(r.bruto_brl_centavos) : '—'} sub="Pedidos pagos, sem taxas do comprador" />
        <Kpi
          rotulo={`Comissão Portal${config ? ` (${fmtPct(config.comissao_portal_bps)})` : ''}`}
          valor={r ? `− ${fmtBRL(r.comissao_portal_brl_centavos)}` : '—'}
          sub="Inclui coleta e operação da central"
          destaque="red"
        />
        <Kpi
          rotulo={`Comissão EPYX${config ? ` (${fmtPct(config.comissao_epyx_bps)})` : ''}`}
          valor={r ? `− ${fmtBRL(r.comissao_epyx_brl_centavos)}` : '—'}
          sub={r && r.ajustes_brl_centavos ? `Ajustes de ocorrências: − ${fmtBRL(r.ajustes_brl_centavos)}` : 'Sem ajustes de ocorrências'}
        />
        <Kpi
          rotulo={`Líquido da loja${pctLoja != null ? ` (${fmtPct(pctLoja)})` : ''}`}
          valor={r ? fmtBRL(r.liquido_brl_centavos) : '—'}
          sub={r ? Object.entries(r.pedidos_por_modo).map(([m, n]) => `${n} ${NOME_MODO[m as keyof typeof NOME_MODO].toLowerCase()}`).join(' · ') || 'Sem pedidos' : undefined}
          destaque="green"
        />
      </div>
      )}

      {pedidos.erro && <CaixaErro erro={pedidos.erro} onTentar={pedidos.recarregar} />}

      {pode('operacao.loja') && (
      <div className="grid-2">
        <Cartao tag="RF-50" titulo="Bancada de teste de defeitos" vermelho extra={<span className="badge badge-red">{emTeste.length} aguardando</span>}>
          <p className="texto-apoio">Depois da conferência do Portal, a loja testa cada item. Aprovado segue para retirada; defeito volta para troca.</p>
          {emTeste.length === 0 ? (
            <Vazio>Nenhum item aguardando teste.</Vazio>
          ) : (
            emTeste.map((p) => (
              <div key={p.id} className="bloco-pedido">
                <strong>{p.codigo}</strong>
                {meus(p).map((i) => (
                  <LinhaTeste key={i.id} api={api} pedido={p} item={i} aoMudar={recarregar} />
                ))}
              </div>
            ))
          )}
        </Cartao>

        <Cartao tag="RF-11 · RF-49" titulo="Separação para retirada no balcão">
          {aSeparar.length === 0 ? (
            <Vazio>Nenhum pedido para separar.</Vazio>
          ) : (
            aSeparar.map((p) => (
              <div key={p.id} className="bloco-pedido">
                <strong>
                  {p.codigo} · {p.cliente_nome ?? ''}
                </strong>
                {p.cliente_chegou_em && <span className="badge badge-red">🔔 Cliente chegou</span>}
                {meus(p).map((i) => (
                  <LinhaSeparacao key={i.id} api={api} pedido={p} item={i} aoMudar={recarregar} />
                ))}
              </div>
            ))
          )}
        </Cartao>
      </div>

      )}

      {pode('retirada.entregar') && noBalcao.length > 0 && <ConferenciaQr api={api} aoMudar={recarregar} destacarPedido={noBalcao[0]!.id} pedidos={noBalcao} />}

      <Cartao tag="T9 · RF-25" titulo="Pedidos da loja">
        {lista.length === 0 ? (
          <Vazio>Nenhum pedido com itens desta loja.</Vazio>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Data</th>
                  <th>Modo</th>
                  <th>Estado</th>
                  <th>Itens da loja</th>
                  <th>Bruto</th>
                  <th>Comissões</th>
                  <th>Líquido</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => {
                  const bruto = meus(p).reduce((s, i) => s + i.subtotal_brl_centavos, 0);
                  const portal = config ? aplicarBps(bruto, config.comissao_portal_bps) : 0;
                  const epyx = config ? aplicarBps(bruto, config.comissao_epyx_bps) : 0;
                  return (
                    <tr key={p.id}>
                      <td>
                        <strong>{p.codigo}</strong>
                      </td>
                      <td>{fmtData(p.criado_em)}</td>
                      <td>{NOME_MODO[p.modo]}</td>
                      <td>
                        <Estado estado={p.estado} />
                      </td>
                      <td>{meus(p).map((i) => `${i.quantidade}× ${i.nome_produto}`).join(', ')}</td>
                      <td>{fmtBRL(bruto)}</td>
                      <td className="valor-negativo">− {fmtBRL(portal + epyx)}</td>
                      <td className="valor-positivo">{fmtBRL(bruto - portal - epyx)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="nota">Comissões por pedido estimadas pela regra vigente; o valor oficial é o do ledger (indicadores acima).</p>
      </Cartao>

      <PainelOcorrencias api={api} pedidos={lista} podeAbrir={false} podeResolver={false} tag="3.3.2 · ocorrências encaminhadas à loja" />
    </>
  );
}

function LinhaTeste({ api, pedido, item, aoMudar }: { api: Api; pedido: Pedido; item: ItemPedido; aoMudar: () => Promise<void> }) {
  const { ocupado, executar } = useAcao();
  const [defeito, setDefeito] = useState(false);
  const [descricao, setDescricao] = useState('');
  const registrar = (resultado: 'APROVADO' | 'DEFEITO') =>
    executar(
      resultado,
      async () => {
        await api.registrarTeste(pedido.id, item.id, resultado, resultado === 'DEFEITO' ? descricao.trim() : undefined);
        await aoMudar();
      },
      resultado === 'APROVADO' ? `${item.nome_produto} aprovado.` : `Defeito registrado. Troque a unidade para a nova coleta.`,
    );

  if (item.teste_resultado === 'DEFEITO') {
    return <div className="linha-acao">⚠️ {item.nome_produto} — defeito registrado, aguardando troca</div>;
  }
  return (
    <div className="linha-acao">
      <span>
        {item.quantidade}× {item.nome_produto}
      </span>
      {defeito ? (
        <form
          className="botoes-linha"
          onSubmit={(e) => {
            e.preventDefault();
            void registrar('DEFEITO');
          }}
        >
          <input className="form-control" placeholder="Defeito encontrado" aria-label="Defeito encontrado" required value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          <button type="submit" className="btn btn-sm btn-outline-red" disabled={!!ocupado}>
            Registrar defeito
          </button>
          <button type="button" className="btn btn-sm btn-outline" onClick={() => setDefeito(false)}>
            Voltar
          </button>
        </form>
      ) : (
        <div className="botoes-linha">
          <button type="button" className="btn btn-sm btn-success" disabled={!!ocupado} onClick={() => void registrar('APROVADO')}>
            ✅ Aprovado
          </button>
          <button type="button" className="btn btn-sm btn-outline-red" onClick={() => setDefeito(true)}>
            ⚠️ Defeito
          </button>
        </div>
      )}
    </div>
  );
}

function LinhaSeparacao({ api, pedido, item, aoMudar }: { api: Api; pedido: Pedido; item: ItemPedido; aoMudar: () => Promise<void> }) {
  const { ocupado, executar } = useAcao();
  return (
    <div className="linha-acao">
      <span>
        {item.quantidade}× {item.nome_produto}
      </span>
      {item.status === 'SEPARADO' ? (
        <span className="badge badge-green">Separado</span>
      ) : (
        <button
          type="button"
          className="btn btn-sm btn-blue"
          disabled={!!ocupado}
          onClick={() =>
            void executar('separar', async () => {
              await api.separarItem(pedido.id, item.id);
              await aoMudar();
            }, `${item.nome_produto} separado.`)
          }
        >
          📦 Marcar separado
        </button>
      )}
    </div>
  );
}
