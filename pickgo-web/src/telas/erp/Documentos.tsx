import { useState } from 'react';
import type { Api, LinhaPagamentoErp, MoedaErp } from '../../api.ts';
import { CaixaErro, Cartao, Dialogo, useAcao, Vazio } from '../../componentes/comum.tsx';
import { useEquipe } from '../../equipe.tsx';
import { useCarga, useSessao } from '../../sessao.tsx';
import { CamposPagamento, dataCurta, EditorLinhas, fmtMoeda, fmtQtd, hojePy, linhasParaApi, linhaVazia, mesPy, NOME_IVA, type LinhaEditavel } from './comum.tsx';

// Compras (entrada de produtos) e faturas do Portal, com nota de crédito e comissões.

function CamposMoeda({ moeda, setMoeda, cambio, setCambio }: { moeda: MoedaErp; setMoeda: (m: MoedaErp) => void; cambio: string; setCambio: (c: string) => void }) {
  return (
    <div className="grid-2">
      <div className="form-group">
        <label htmlFor="doc-moeda">Moeda</label>
        <select id="doc-moeda" className="form-control" value={moeda} onChange={(e) => setMoeda(e.target.value as MoedaErp)}>
          <option value="PYG">Guaranis (Gs.)</option>
          <option value="USD">Dólares (US$)</option>
        </select>
      </div>
      {moeda === 'USD' && (
        <div className="form-group">
          <label htmlFor="doc-tc">Tipo de câmbio (Gs. por US$)</label>
          <input id="doc-tc" className="form-control" inputMode="numeric" value={cambio} onChange={(e) => setCambio(e.target.value.replace(/\D/g, ''))} />
        </div>
      )}
    </div>
  );
}

export function Compras({ api }: { api: Api }) {
  const { pode } = useEquipe();
  const lista = useCarga(() => api.erpCompras(), [api]);
  const [nova, setNova] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  return (
    <Cartao
      tag="Entrada de produtos"
      titulo="Compras"
      extra={
        pode('erp.fiscal') ? (
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setNova(true)}>
            + Registrar compra
          </button>
        ) : undefined
      }
    >
      <p className="texto-apoio">A fatura do fornecedor dá entrada no estoque pelo custo sem IVA, gera as contas a pagar e entra no livro de compras.</p>
      {lista.erro && <CaixaErro erro={lista.erro} onTentar={lista.recarregar} />}
      {lista.dados?.compras.length === 0 && <Vazio>Nenhuma compra.</Vazio>}
      {!!lista.dados?.compras.length && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Fornecedor</th>
                <th>Fatura</th>
                <th>Condição</th>
                <th className="numero">Total</th>
                <th className="numero">IVA</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {lista.dados.compras.map((c) => (
                <tr key={c.id} className={c.estado === 'ANULADA' ? 'linha-inativa' : ''}>
                  <td>{dataCurta(c.data)}</td>
                  <td>{c.fornecedor}</td>
                  <td>
                    <button type="button" className="link" onClick={() => setAberta(c.id)}>
                      {c.numero}
                    </button>
                    <div className="nota">timbrado {c.timbrado}</div>
                  </td>
                  <td>{c.condicao === 'CONTADO' ? 'à vista' : 'a prazo'}</td>
                  <td className="numero">{fmtMoeda(c.total, c.moeda)}</td>
                  <td className="numero">{fmtMoeda(c.iva_10 + c.iva_5, c.moeda)}</td>
                  <td>
                    <span className={`badge ${c.estado === 'ANULADA' ? 'badge-gray' : 'badge-green'}`}>{c.estado.toLowerCase()}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialogo aberto={nova} aoFechar={() => setNova(false)} titulo="Registrar compra">
        {nova && (
          <FormCompra
            api={api}
            aoSalvar={async () => {
              setNova(false);
              await lista.recarregar();
            }}
          />
        )}
      </Dialogo>
      <Dialogo aberto={!!aberta} aoFechar={() => setAberta(null)} titulo="Compra">
        {aberta && (
          <DetalheCompra
            api={api}
            id={aberta}
            aoMudar={async () => {
              setAberta(null);
              await lista.recarregar();
            }}
          />
        )}
      </Dialogo>
    </Cartao>
  );
}

function FormCompra({ api, aoSalvar }: { api: Api; aoSalvar: () => Promise<void> }) {
  const { ocupado, executar } = useAcao();
  const fornecedores = useCarga(() => api.erpTerceiros({ papel: 'fornecedor' }), [api]);
  const itens = useCarga(() => api.erpItens(), [api]);
  const depositos = useCarga(() => api.erpDepositos(), [api]);
  const [f, setF] = useState({ fornecedor_id: '', timbrado: '', numero: '', data: hojePy(), deposito_id: '', observacao: '' });
  const [moeda, setMoeda] = useState<MoedaErp>('PYG');
  const [cambio, setCambio] = useState('7800');
  const [pg, setPg] = useState<LinhaPagamentoErp>({ condicao: 'CREDITO', parcelas: 1, primeiro_vencimento: hojePy(), intervalo_dias: 30 });
  const [linhas, setLinhas] = useState<LinhaEditavel[]>([linhaVazia()]);
  const api_ = linhasParaApi(linhas, moeda, true);
  const precisaDeposito = linhas.some((l) => itens.dados?.itens.find((i) => i.id === l.item_id)?.controla_estoque);
  const ok = f.fornecedor_id && /^\d{8}$/.test(f.timbrado) && /^\d{3}-\d{3}-\d{7}$/.test(f.numero) && api_ && (!precisaDeposito || f.deposito_id);
  return (
    <form
      className="form-documento"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        void executar(
          'compra',
          async () => {
            await api.erpRegistrarCompra({ ...f, ...pg, deposito_id: f.deposito_id || undefined, observacao: f.observacao || undefined, moeda, tipo_cambio: moeda === 'PYG' ? 1 : Number(cambio), itens: api_ as { item_id: string; quantidade: number; preco_unitario: number }[] });
            await aoSalvar();
          },
          'Compra registrada: estoque, contas a pagar e livro atualizados.',
        );
      }}
    >
      <div className="grid-2">
        <div className="form-group">
          <label htmlFor="cp-forn">Fornecedor</label>
          <select id="cp-forn" className="form-control" value={f.fornecedor_id} onChange={(e) => setF({ ...f, fornecedor_id: e.target.value })}>
            <option value="">Escolha</option>
            {fornecedores.dados?.terceiros.filter((t) => t.ativo).map((t) => (
              <option key={t.id} value={t.id}>
                {t.razao_social} · {t.documento}
                {t.dv !== null ? `-${t.dv}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="cp-data">Data da fatura</label>
          <input id="cp-data" type="date" className="form-control" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} />
        </div>
        <div className="form-group">
          <label htmlFor="cp-timb">Timbrado do fornecedor</label>
          <input id="cp-timb" className="form-control" inputMode="numeric" maxLength={8} placeholder="8 dígitos" value={f.timbrado} onChange={(e) => setF({ ...f, timbrado: e.target.value.replace(/\D/g, '') })} />
        </div>
        <div className="form-group">
          <label htmlFor="cp-num">Número da fatura</label>
          <input id="cp-num" className="form-control" placeholder="001-001-0000123" maxLength={15} value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value })} />
        </div>
        <div className="form-group">
          <label htmlFor="cp-dep">Depósito de entrada</label>
          <select id="cp-dep" className="form-control" value={f.deposito_id} onChange={(e) => setF({ ...f, deposito_id: e.target.value })}>
            <option value="">{precisaDeposito ? 'Escolha o depósito' : 'Sem item de estoque'}</option>
            {depositos.dados?.depositos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.codigo} · {d.nome}
              </option>
            ))}
          </select>
        </div>
      </div>
      <CamposMoeda moeda={moeda} setMoeda={setMoeda} cambio={cambio} setCambio={setCambio} />
      <EditorLinhas linhas={linhas} setLinhas={setLinhas} itens={itens.dados?.itens ?? []} moeda={moeda} />
      <CamposPagamento v={pg} setV={setPg} rotulo="Condição de pagamento" />
      <button type="submit" className="btn btn-primary btn-block botao-pix" disabled={!ok || !!ocupado}>
        Registrar compra
      </button>
    </form>
  );
}

function DetalheCompra({ api, id, aoMudar }: { api: Api; id: string; aoMudar: () => Promise<void> }) {
  const { pode } = useEquipe();
  const d = useCarga(() => api.erpCompra(id), [api, id]);
  const { ocupado, executar } = useAcao();
  if (d.erro) return <CaixaErro erro={d.erro} />;
  if (!d.dados) return <p className="carregando">Carregando…</p>;
  const { compra: c, itens, titulos } = d.dados;
  return (
    <div className="ficha">
      <h4 className="subtitulo sem-margem">
        {c.fornecedor} · {c.numero} · {dataCurta(c.data)}
      </h4>
      <LinhasLeitura itens={itens} moeda={c.moeda} />
      <Totais d={c} />
      <TitulosLeitura titulos={titulos} />
      {pode('erp.fiscal') && c.estado !== 'ANULADA' && (
        <button
          type="button"
          className="btn btn-sm btn-outline-red"
          disabled={!!ocupado}
          onClick={() => {
            if (!confirm('Anular a compra? O estoque que entrou sai de novo e as contas a pagar são canceladas.')) return;
            void executar('anular', async () => (await api.erpAnularCompra(id), await aoMudar()), 'Compra anulada.');
          }}
        >
          Anular compra
        </button>
      )}
    </div>
  );
}

export function Faturas({ api }: { api: Api }) {
  const { pode } = useEquipe();
  const { avisar } = useSessao();
  const lista = useCarga(() => api.erpFaturas(), [api]);
  const [nova, setNova] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState(mesPy());
  const { ocupado, executar } = useAcao();
  return (
    <Cartao
      tag="Faturamento"
      titulo="Faturas e notas de crédito do Portal"
      extra={
        pode('erp.fiscal') ? (
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setNova(true)}>
            + Emitir fatura
          </button>
        ) : undefined
      }
    >
      {pode('erp.fiscal') && (
        <form
          className="caixa-teste comissoes"
          onSubmit={(e) => {
            e.preventDefault();
            void executar('comissoes', async () => {
              const r = await api.erpFaturarComissoes(periodo);
              await lista.recarregar();
              avisar(`${r.emitidas.length} fatura(s) de comissão emitida(s)${r.pendentes.length ? `; ${r.pendentes.map((p) => `${p.loja}: ${p.motivo}`).join('; ')}` : ''}.`, r.pendentes.length && !r.emitidas.length ? 'erro' : 'ok');
            });
          }}
        >
          <strong>Comissões do mês</strong>
          <span className="nota">Uma fatura por loja com a comissão do Portal no ledger do Pick & Go, em guaranis, IVA 10%, quitada pela retenção no split. A loja precisa estar cadastrada como cliente com RUC.</span>
          <div className="busca">
            <input type="month" className="form-control" aria-label="Mês" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
            <button type="submit" className="btn btn-sm btn-blue" disabled={!!ocupado}>
              Faturar comissões
            </button>
          </div>
        </form>
      )}
      {lista.erro && <CaixaErro erro={lista.erro} onTentar={lista.recarregar} />}
      {lista.dados?.faturas.length === 0 && <Vazio>Nenhuma fatura emitida.</Vazio>}
      {!!lista.dados?.faturas.length && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Número</th>
                <th>Cliente</th>
                <th>Condição</th>
                <th className="numero">Total</th>
                <th className="numero">A receber</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {lista.dados.faturas.map((f) => (
                <tr key={f.id} className={f.estado === 'ANULADA' ? 'linha-inativa' : ''}>
                  <td>{dataCurta(f.data)}</td>
                  <td>
                    <button type="button" className="link" onClick={() => setAberta(f.id)}>
                      {f.tipo === 'NOTA_CREDITO' ? 'NC ' : ''}
                      {f.numero_formatado}
                    </button>
                    <div className="nota">
                      {f.origem === 'COMISSAO' ? `comissão ${f.periodo}` : f.tipo === 'NOTA_CREDITO' ? `sobre ${f.origem_numero}` : 'manual'}
                    </div>
                  </td>
                  <td>{f.cliente}</td>
                  <td>{f.condicao === 'CONTADO' ? 'à vista' : 'a prazo'}</td>
                  <td className={`numero ${f.tipo === 'NOTA_CREDITO' ? 'valor-negativo' : ''}`}>{f.tipo === 'NOTA_CREDITO' ? '− ' : ''}{fmtMoeda(f.total, f.moeda)}</td>
                  <td className="numero">{f.tipo === 'FACTURA' ? fmtMoeda(f.a_receber, f.moeda) : '—'}</td>
                  <td>
                    <span className={`badge ${f.estado === 'ANULADA' ? 'badge-gray' : 'badge-green'}`}>{f.estado.toLowerCase()}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="nota">Controle interno: estes documentos não substituem a fatura eletrônica (SIFEN/e-Kuatia) da DNIT.</p>
      <Dialogo aberto={nova} aoFechar={() => setNova(false)} titulo="Emitir fatura">
        {nova && (
          <FormFatura
            api={api}
            aoSalvar={async (id) => {
              setNova(false);
              await lista.recarregar();
              setAberta(id);
            }}
          />
        )}
      </Dialogo>
      <Dialogo aberto={!!aberta} aoFechar={() => setAberta(null)} titulo="Documento">
        {aberta && <DetalheFatura api={api} id={aberta} aoMudar={lista.recarregar} aoAbrir={setAberta} />}
      </Dialogo>
    </Cartao>
  );
}

function FormFatura({ api, aoSalvar }: { api: Api; aoSalvar: (id: string) => Promise<void> }) {
  const { ocupado, executar } = useAcao();
  const clientes = useCarga(() => api.erpTerceiros({ papel: 'cliente' }), [api]);
  const itens = useCarga(() => api.erpItens(), [api]);
  const depositos = useCarga(() => api.erpDepositos(), [api]);
  const [f, setF] = useState({ terceiro_id: '', data: hojePy(), deposito_id: '', observacao: '' });
  const [moeda, setMoeda] = useState<MoedaErp>('PYG');
  const [cambio, setCambio] = useState('7800');
  const [pg, setPg] = useState<LinhaPagamentoErp>({ condicao: 'CONTADO', meio: 'TRANSFERENCIA', parcelas: 1, primeiro_vencimento: hojePy(), intervalo_dias: 30 });
  const [linhas, setLinhas] = useState<LinhaEditavel[]>([linhaVazia()]);
  const api_ = linhasParaApi(linhas, moeda, false);
  const precisaDeposito = linhas.some((l) => itens.dados?.itens.find((i) => i.id === l.item_id)?.controla_estoque);
  const ok = f.terceiro_id && api_ && (!precisaDeposito || f.deposito_id);
  return (
    <form
      className="form-documento"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        void executar(
          'fatura',
          async () => {
            const r = await api.erpEmitirFatura({ ...f, ...pg, deposito_id: f.deposito_id || undefined, observacao: f.observacao || undefined, moeda, tipo_cambio: moeda === 'PYG' ? 1 : Number(cambio), itens: api_! });
            await aoSalvar(r.id);
            return r;
          },
          (r) => `Fatura ${r?.numero_formatado} emitida.`,
        );
      }}
    >
      <div className="grid-2">
        <div className="form-group">
          <label htmlFor="ft-cli">Cliente</label>
          <select id="ft-cli" className="form-control" value={f.terceiro_id} onChange={(e) => setF({ ...f, terceiro_id: e.target.value })}>
            <option value="">Escolha</option>
            {clientes.dados?.terceiros.filter((t) => t.ativo).map((t) => (
              <option key={t.id} value={t.id}>
                {t.razao_social} · {t.documento}
                {t.dv !== null ? `-${t.dv}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="ft-data">Data</label>
          <input id="ft-data" type="date" className="form-control" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} />
        </div>
        {precisaDeposito && (
          <div className="form-group">
            <label htmlFor="ft-dep">Depósito de saída</label>
            <select id="ft-dep" className="form-control" value={f.deposito_id} onChange={(e) => setF({ ...f, deposito_id: e.target.value })}>
              <option value="">Escolha o depósito</option>
              {depositos.dados?.depositos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.codigo} · {d.nome}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <CamposMoeda moeda={moeda} setMoeda={setMoeda} cambio={cambio} setCambio={setCambio} />
      <EditorLinhas linhas={linhas} setLinhas={setLinhas} itens={itens.dados?.itens ?? []} moeda={moeda} livre />
      <CamposPagamento v={pg} setV={setPg} rotulo="Condição" />
      <div className="form-group">
        <label htmlFor="ft-obs">Observação</label>
        <input id="ft-obs" className="form-control" maxLength={1000} value={f.observacao} onChange={(e) => setF({ ...f, observacao: e.target.value })} />
      </div>
      <p className="nota">O número sai do timbrado configurado em Cadastros; número anulado não é reaproveitado.</p>
      <button type="submit" className="btn btn-primary btn-block botao-pix" disabled={!ok || !!ocupado}>
        Emitir fatura
      </button>
    </form>
  );
}

function DetalheFatura({ api, id, aoMudar, aoAbrir }: { api: Api; id: string; aoMudar: () => Promise<void>; aoAbrir: (id: string) => void }) {
  const { pode } = useEquipe();
  const d = useCarga(() => api.erpFatura(id), [api, id]);
  const { ocupado, executar } = useAcao();
  const [nc, setNc] = useState<Record<string, string> | null>(null);
  const [motivo, setMotivo] = useState('');
  const [devolver, setDevolver] = useState(true);
  if (d.erro) return <CaixaErro erro={d.erro} />;
  if (!d.dados) return <p className="carregando">Carregando…</p>;
  const { fatura: f, empresa, itens, titulos, notas } = d.dados;
  const emitida = f.estado === 'EMITIDA';
  return (
    <div className="ficha">
      <div className="documento-impresso">
        <header className="doc-cabecalho">
          <div>
            <strong>{empresa?.razao_social ?? 'Portal Paraguai'}</strong>
            <div className="nota">
              RUC {empresa?.ruc}-{empresa?.dv} · {empresa?.endereco}
            </div>
          </div>
          <div className="doc-numero">
            <div>{f.tipo === 'FACTURA' ? 'FACTURA' : 'NOTA DE CRÉDITO'}</div>
            <strong>{f.numero_formatado}</strong>
            <div className="nota">
              Timbrado {f.timbrado} · vigência {dataCurta(empresa?.timbrado_inicio)} a {dataCurta(empresa?.timbrado_fim)}
            </div>
          </div>
        </header>
        <div className="nota">
          Fecha {dataCurta(f.data)} · Condición {f.condicao === 'CONTADO' ? 'contado' : 'crédito'} · {f.moeda === 'USD' ? `US$ (Gs. ${f.tipo_cambio}/US$)` : 'Guaraníes'}
          <br />
          Cliente: <strong>{f.cliente}</strong> · {f.tipo_documento} {f.documento}
          {f.dv !== null ? `-${f.dv}` : ''}
          {f.origem_numero && <> · sobre a fatura {f.origem_numero}</>}
        </div>
        <LinhasLeitura itens={itens} moeda={f.moeda} />
        <Totais d={f} />
        {f.estado === 'ANULADA' && <div className="carimbo">ANULADA</div>}
        <p className="nota">Documento de controle interno; não é a fatura eletrônica da DNIT.</p>
      </div>
      <div className="botoes-linha sem-margem nao-imprimir">
        <button type="button" className="btn btn-sm btn-outline" onClick={() => print()}>
          Imprimir
        </button>
        {pode('erp.fiscal') && emitida && f.tipo === 'FACTURA' && !nc && (
          <button type="button" className="btn btn-sm btn-outline" onClick={() => setNc(Object.fromEntries(itens.map((i) => [i.id, ''])))}>
            Nota de crédito
          </button>
        )}
        {pode('erp.fiscal') && emitida && f.tipo === 'FACTURA' && (
          <button
            type="button"
            className="btn btn-sm btn-outline-red"
            disabled={!!ocupado}
            onClick={() => {
              if (!confirm(`Anular a fatura ${f.numero_formatado}? O número não volta a ser usado.`)) return;
              void executar('anular', async () => (await api.erpAnularFatura(id), await Promise.all([d.recarregar(), aoMudar()])), 'Fatura anulada.');
            }}
          >
            Anular
          </button>
        )}
      </div>
      {nc && (
        <form
          className="painel-form nao-imprimir"
          onSubmit={(e) => {
            e.preventDefault();
            const sel = Object.entries(nc)
              .map(([k, v]) => ({ fatura_item_id: k, quantidade: Number(v.replace(',', '.')) }))
              .filter((x) => x.quantidade > 0);
            void executar(
              'nc',
              async () => {
                const r = await api.erpNotaCredito(id, { data: hojePy(), motivo: motivo.trim(), itens: sel.length ? sel : undefined, devolver_estoque: devolver });
                setNc(null);
                await Promise.all([d.recarregar(), aoMudar()]);
                return r;
              },
              (r) => `Nota de crédito ${r?.numero_formatado} emitida.`,
            );
          }}
        >
          <h5 className="subtitulo sem-margem">Nota de crédito</h5>
          <p className="nota">Informe a quantidade a creditar em cada linha; tudo em branco credita o restante da fatura inteira.</p>
          {itens.map((i) => (
            <label key={i.id} className="linha-acao">
              <span>
                {i.descricao} ({fmtQtd(i.quantidade)})
              </span>
              <input className="form-control estreito" inputMode="decimal" aria-label={`Quantidade a creditar de ${i.descricao}`} value={nc[i.id] ?? ''} onChange={(e) => setNc({ ...nc, [i.id]: e.target.value })} />
            </label>
          ))}
          <input className="form-control" placeholder="Motivo" aria-label="Motivo" required minLength={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <label className="marca">
            <input type="checkbox" checked={devolver} onChange={(e) => setDevolver(e.target.checked)} /> Devolver mercadoria ao estoque
          </label>
          <div className="botoes-linha sem-margem">
            <button type="submit" className="btn btn-sm btn-primary" disabled={!!ocupado || motivo.trim().length < 3}>
              Emitir nota de crédito
            </button>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setNc(null)}>
              Voltar
            </button>
          </div>
        </form>
      )}
      {notas.length > 0 && (
        <div className="nao-imprimir">
          <h5 className="subtitulo">Notas de crédito</h5>
          <ul className="lista-compacta">
            {notas.map((n) => (
              <li key={n.id}>
                <button type="button" className="link" onClick={() => aoAbrir(n.id)}>
                  NC {n.numero_formatado}
                </button>{' '}
                · {dataCurta(n.data)} · {fmtMoeda(n.total, f.moeda)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="nao-imprimir">
        <TitulosLeitura titulos={titulos} />
      </div>
    </div>
  );
}

function LinhasLeitura({ itens, moeda }: { itens: { id: string; descricao: string; quantidade: number; preco_unitario: number; iva: '10' | '5' | 'EXENTO'; total: number }[]; moeda: MoedaErp }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Descrição</th>
            <th className="numero">Qtd.</th>
            <th className="numero">Preço unit.</th>
            <th>IVA</th>
            <th className="numero">Total</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((i) => (
            <tr key={i.id}>
              <td>{i.descricao}</td>
              <td className="numero">{fmtQtd(i.quantidade)}</td>
              <td className="numero">{fmtMoeda(Number(i.preco_unitario), moeda)}</td>
              <td>{NOME_IVA[i.iva]}</td>
              <td className="numero">{fmtMoeda(Number(i.total), moeda)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Totais({ d }: { d: { moeda: MoedaErp; total_10: number; iva_10: number; total_5: number; iva_5: number; exento: number; total: number } }) {
  const m = (v: number) => fmtMoeda(Number(v), d.moeda);
  return (
    <dl className="resumo totais-fiscais">
      {!!d.total_10 && (
        <div>
          <dt>Gravado 10% (IVA {m(d.iva_10)})</dt>
          <dd>{m(d.total_10)}</dd>
        </div>
      )}
      {!!d.total_5 && (
        <div>
          <dt>Gravado 5% (IVA {m(d.iva_5)})</dt>
          <dd>{m(d.total_5)}</dd>
        </div>
      )}
      {!!d.exento && (
        <div>
          <dt>Exento</dt>
          <dd>{m(d.exento)}</dd>
        </div>
      )}
      <div className="resumo-total">
        <dt>Total</dt>
        <dd>{m(d.total)}</dd>
      </div>
    </dl>
  );
}

function TitulosLeitura({ titulos }: { titulos: { id: string; parcela: number; parcelas: number; vencimento: string; valor: number; saldo: number; estado: string; moeda: MoedaErp; tipo: string }[] }) {
  if (!titulos.length) return null;
  return (
    <>
      <h5 className="subtitulo">{titulos[0]!.tipo === 'PAGAR' ? 'Contas a pagar' : 'Contas a receber'}</h5>
      <ul className="lista-compacta">
        {titulos.map((t) => (
          <li key={t.id}>
            Parcela {t.parcela}/{t.parcelas} · vence {dataCurta(t.vencimento)} · {fmtMoeda(Number(t.valor), t.moeda)} · saldo {fmtMoeda(Number(t.saldo), t.moeda)}{' '}
            <span className={`badge ${t.estado === 'QUITADO' ? 'badge-green' : t.estado === 'CANCELADO' ? 'badge-gray' : 'badge-gold'}`}>{t.estado.toLowerCase()}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
