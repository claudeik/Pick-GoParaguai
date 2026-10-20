import { useState } from 'react';
import type { Api, MoedaErp, TituloErp } from '../../api.ts';
import { CaixaErro, Cartao, Dialogo, useAcao, Vazio } from '../../componentes/comum.tsx';
import { useEquipe } from '../../equipe.tsx';
import { useCarga, useSessao } from '../../sessao.tsx';
import { dataCurta, fmtGs, fmtMoeda, hojePy, lerValor, mesPy } from './comum.tsx';

// Contas a pagar e a receber, e livros do IVA.

export function Contas({ api }: { api: Api }) {
  const { pode } = useEquipe();
  const [tipo, setTipo] = useState<'RECEBER' | 'PAGAR'>('RECEBER');
  const [situacao, setSituacao] = useState<'ABERTOS' | 'VENCIDOS' | 'QUITADOS' | 'TODOS'>('ABERTOS');
  const lista = useCarga(() => api.erpTitulos({ tipo, situacao }), [api, tipo, situacao]);
  const [aberto, setAberto] = useState<string | null>(null);
  const [nova, setNova] = useState(false);
  const total = (lista.dados?.titulos ?? []).reduce<Record<string, number>>((s, t) => ({ ...s, [t.moeda]: (s[t.moeda] ?? 0) + Number(t.saldo) }), {});
  return (
    <Cartao
      tag="Financeiro"
      titulo={tipo === 'RECEBER' ? 'Contas a receber' : 'Contas a pagar'}
      extra={
        pode('erp.financeiro') ? (
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setNova(true)}>
            + Conta avulsa
          </button>
        ) : undefined
      }
    >
      <div className="filtros-gestao">
        <div className="store-pills" role="group" aria-label="Tipo">
          {(['RECEBER', 'PAGAR'] as const).map((t) => (
            <button key={t} type="button" className={`store-pill ${tipo === t ? 'active' : ''}`} aria-pressed={tipo === t} onClick={() => setTipo(t)}>
              {t === 'RECEBER' ? 'A receber' : 'A pagar'}
            </button>
          ))}
        </div>
        <select className="form-control" aria-label="Situação" value={situacao} onChange={(e) => setSituacao(e.target.value as typeof situacao)}>
          <option value="ABERTOS">Em aberto</option>
          <option value="VENCIDOS">Vencidos</option>
          <option value="QUITADOS">Quitados</option>
          <option value="TODOS">Todos</option>
        </select>
        <span className="nota">Saldo na lista: {Object.entries(total).map(([m, v]) => fmtMoeda(v, m as MoedaErp)).join(' + ') || '—'}</span>
      </div>
      {lista.erro && <CaixaErro erro={lista.erro} onTentar={lista.recarregar} />}
      {lista.dados?.titulos.length === 0 && <Vazio>Nada aqui.</Vazio>}
      {!!lista.dados?.titulos.length && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Vencimento</th>
                <th>{tipo === 'RECEBER' ? 'Cliente' : 'Fornecedor'}</th>
                <th>Descrição</th>
                <th className="numero">Valor</th>
                <th className="numero">Saldo</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {lista.dados.titulos.map((t) => (
                <tr key={t.id} className={t.estado === 'CANCELADO' ? 'linha-inativa' : ''}>
                  <td>
                    {dataCurta(t.vencimento)}
                    {t.vencido && <div className="nota destaque">{t.dias_atraso} dia(s) de atraso</div>}
                  </td>
                  <td>{t.razao_social}</td>
                  <td>
                    <button type="button" className="link" onClick={() => setAberto(t.id)}>
                      {t.descricao}
                    </button>
                    {t.parcelas > 1 && <span className="nota"> · parcela {t.parcela}/{t.parcelas}</span>}
                  </td>
                  <td className="numero">{fmtMoeda(Number(t.valor), t.moeda)}</td>
                  <td className="numero">{fmtMoeda(Number(t.saldo), t.moeda)}</td>
                  <td>
                    <span className={`badge ${t.estado === 'QUITADO' ? 'badge-green' : t.vencido ? 'badge-red' : t.estado === 'CANCELADO' ? 'badge-gray' : 'badge-gold'}`}>{t.vencido ? 'vencido' : t.estado.toLowerCase()}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialogo aberto={!!aberto} aoFechar={() => setAberto(null)} titulo="Título">
        {aberto && <DetalheTitulo api={api} id={aberto} aoMudar={lista.recarregar} />}
      </Dialogo>
      <Dialogo aberto={nova} aoFechar={() => setNova(false)} titulo="Conta avulsa">
        {nova && (
          <FormTitulo
            api={api}
            tipoInicial={tipo}
            aoSalvar={async () => {
              setNova(false);
              await lista.recarregar();
            }}
          />
        )}
      </Dialogo>
    </Cartao>
  );
}

function DetalheTitulo({ api, id, aoMudar }: { api: Api; id: string; aoMudar: () => Promise<void> }) {
  const { pode } = useEquipe();
  const d = useCarga(() => api.erpTitulo(id), [api, id]);
  const { ocupado, executar } = useAcao();
  const [b, setB] = useState({ data: hojePy(), valor: '', meio: 'TRANSFERENCIA' as 'TRANSFERENCIA' | 'EFECTIVO' | 'CHEQUE' | 'PIX' | 'TARJETA' });
  if (d.erro) return <CaixaErro erro={d.erro} />;
  if (!d.dados) return <p className="carregando">Carregando…</p>;
  const t: TituloErp = d.dados.titulo;
  const valor = lerValor(b.valor, t.moeda);
  const recarregar = async () => {
    await Promise.all([d.recarregar(), aoMudar()]);
  };
  return (
    <div className="ficha">
      <h4 className="subtitulo sem-margem">{t.descricao}</h4>
      <div className="nota">
        {t.razao_social} · emissão {dataCurta(t.emissao)} · vence {dataCurta(t.vencimento)} · parcela {t.parcela}/{t.parcelas}
      </div>
      <dl className="resumo">
        <div>
          <dt>Valor</dt>
          <dd>{fmtMoeda(Number(t.valor), t.moeda)}</dd>
        </div>
        <div className="resumo-total">
          <dt>Saldo</dt>
          <dd>{fmtMoeda(Number(t.saldo), t.moeda)}</dd>
        </div>
      </dl>
      {pode('erp.financeiro') && (t.estado === 'ABERTO' || t.estado === 'PARCIAL') && (
        <form
          className="responder"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valor) return;
            void executar('baixa', async () => (await api.erpBaixar(id, { ...b, valor }), await recarregar()), 'Baixa registrada.');
          }}
        >
          <input type="date" className="form-control" aria-label="Data" value={b.data} onChange={(e) => setB({ ...b, data: e.target.value })} />
          <input className="form-control" inputMode="decimal" placeholder={`Valor (${t.moeda === 'PYG' ? 'Gs.' : 'US$'})`} aria-label="Valor" value={b.valor} onChange={(e) => setB({ ...b, valor: e.target.value })} />
          <select className="form-control" aria-label="Meio" value={b.meio} onChange={(e) => setB({ ...b, meio: e.target.value as typeof b.meio })}>
            {['TRANSFERENCIA', 'EFECTIVO', 'CHEQUE', 'PIX', 'TARJETA'].map((m) => (
              <option key={m} value={m}>
                {m.toLowerCase()}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-sm btn-outline" onClick={() => setB({ ...b, valor: String(t.moeda === 'PYG' ? t.saldo : (t.saldo / 100).toFixed(2).replace('.', ',')) })}>
            Saldo total
          </button>
          <button type="submit" className="btn btn-sm btn-primary" disabled={!valor || !!ocupado}>
            {t.tipo === 'RECEBER' ? 'Registrar recebimento' : 'Registrar pagamento'}
          </button>
        </form>
      )}
      <h5 className="subtitulo">Baixas</h5>
      {!d.dados.baixas.length && <p className="nota">Nenhuma.</p>}
      <ul className="lista-compacta">
        {d.dados.baixas.map((x) => (
          <li key={x.id} className={x.estornada ? 'linha-inativa' : ''}>
            {dataCurta(x.data)} · {fmtMoeda(Number(x.valor), t.moeda)} · {x.meio.toLowerCase().replace('_', ' ')}
            {x.automatica && <span className="nota"> · registrada com o documento</span>}
            {x.observacao && <span className="nota"> · {x.observacao}</span>}
            {x.estornada && <span className="badge badge-gray"> estornada</span>}
            {pode('erp.financeiro') && !x.estornada && !x.automatica && (
              <button
                type="button"
                className="btn btn-sm btn-outline-red btn-mini"
                disabled={!!ocupado}
                onClick={() => {
                  if (!confirm('Estornar esta baixa? O saldo volta a ficar em aberto.')) return;
                  void executar('estorno', async () => (await api.erpEstornarBaixa(x.id), await recarregar()), 'Baixa estornada.');
                }}
              >
                Estornar
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FormTitulo({ api, tipoInicial, aoSalvar }: { api: Api; tipoInicial: 'RECEBER' | 'PAGAR'; aoSalvar: () => Promise<void> }) {
  const { ocupado, executar } = useAcao();
  const terceiros = useCarga(() => api.erpTerceiros(), [api]);
  const [f, setF] = useState({ tipo: tipoInicial, terceiro_id: '', descricao: '', emissao: hojePy(), moeda: 'PYG' as MoedaErp, valor: '', parcelas: 1, primeiro_vencimento: hojePy(), intervalo_dias: 30 });
  const valor = lerValor(f.valor, f.moeda);
  const ok = f.terceiro_id && f.descricao.trim().length >= 3 && valor;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        void executar('titulo', async () => (await api.erpCriarTitulo({ ...f, descricao: f.descricao.trim(), valor: valor! }), await aoSalvar()), 'Conta lançada.');
      }}
    >
      <p className="texto-apoio">Para despesas e receitas sem fatura registrada aqui (aluguel, energia, serviços). Compras e faturas geram as contas sozinhas.</p>
      <div className="grid-2">
        <div className="form-group">
          <label htmlFor="tt-tipo">Tipo</label>
          <select id="tt-tipo" className="form-control" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as 'RECEBER' | 'PAGAR' })}>
            <option value="PAGAR">A pagar</option>
            <option value="RECEBER">A receber</option>
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="tt-ter">{f.tipo === 'PAGAR' ? 'Fornecedor' : 'Cliente'}</label>
          <select id="tt-ter" className="form-control" value={f.terceiro_id} onChange={(e) => setF({ ...f, terceiro_id: e.target.value })}>
            <option value="">Escolha</option>
            {terceiros.dados?.terceiros.filter((t) => t.ativo && (f.tipo === 'PAGAR' ? t.fornecedor : t.cliente)).map((t) => (
              <option key={t.id} value={t.id}>
                {t.razao_social}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="tt-desc">Descrição</label>
          <input id="tt-desc" className="form-control" maxLength={200} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        </div>
        <div className="form-group">
          <label htmlFor="tt-valor">Valor total</label>
          <div className="busca">
            <select className="form-control" aria-label="Moeda" value={f.moeda} onChange={(e) => setF({ ...f, moeda: e.target.value as MoedaErp })}>
              <option value="PYG">Gs.</option>
              <option value="USD">US$</option>
            </select>
            <input id="tt-valor" className="form-control" inputMode="decimal" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} />
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="tt-parc">Parcelas</label>
          <input id="tt-parc" type="number" min={1} max={60} className="form-control" value={f.parcelas} onChange={(e) => setF({ ...f, parcelas: Number(e.target.value) || 1 })} />
        </div>
        <div className="form-group">
          <label htmlFor="tt-venc">Primeiro vencimento</label>
          <input id="tt-venc" type="date" className="form-control" value={f.primeiro_vencimento} onChange={(e) => setF({ ...f, primeiro_vencimento: e.target.value })} />
        </div>
      </div>
      <button type="submit" className="btn btn-primary btn-block" disabled={!ok || !!ocupado}>
        Lançar
      </button>
    </form>
  );
}

export function Livros({ api }: { api: Api }) {
  const { avisarErro } = useSessao();
  const [periodo, setPeriodo] = useState(mesPy());
  const [tipo, setTipo] = useState<'ventas' | 'compras'>('ventas');
  const l = useCarga(() => api.erpLivro(tipo, periodo), [api, tipo, periodo]);
  const baixar = async () => {
    try {
      const texto = await api.erpLivroCsv(tipo, periodo);
      const url = URL.createObjectURL(new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `libro-${tipo}-${periodo}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      avisarErro(e);
    }
  };
  return (
    <Cartao
      tag="IVA"
      titulo={tipo === 'ventas' ? 'Livro de vendas' : 'Livro de compras'}
      extra={
        <button type="button" className="btn btn-sm btn-outline" onClick={() => void baixar()}>
          📥 CSV (RG 90)
        </button>
      }
    >
      <div className="filtros-gestao">
        <div className="store-pills" role="group" aria-label="Livro">
          {(['ventas', 'compras'] as const).map((t) => (
            <button key={t} type="button" className={`store-pill ${tipo === t ? 'active' : ''}`} aria-pressed={tipo === t} onClick={() => setTipo(t)}>
              {t === 'ventas' ? 'Vendas' : 'Compras'}
            </button>
          ))}
        </div>
        <input type="month" className="form-control" aria-label="Mês" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
      </div>
      {l.erro && <CaixaErro erro={l.erro} onTentar={l.recarregar} />}
      {l.dados && (
        <>
          <div className="grid-4">
            <div className="kpi-card">
              <span className="kpi-label">Gravado 10%</span>
              <span className="kpi-value">{fmtGs(l.dados.totais.total_10)}</span>
              <span className="kpi-sub">IVA {fmtGs(l.dados.totais.iva_10)}</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Gravado 5%</span>
              <span className="kpi-value">{fmtGs(l.dados.totais.total_5)}</span>
              <span className="kpi-sub">IVA {fmtGs(l.dados.totais.iva_5)}</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Exento</span>
              <span className="kpi-value">{fmtGs(l.dados.totais.exento)}</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">{tipo === 'ventas' ? 'IVA débito' : 'IVA crédito'}</span>
              <span className="kpi-value red">{fmtGs(l.dados.totais.iva)}</span>
              <span className="kpi-sub">Total {fmtGs(l.dados.totais.total)}</span>
            </div>
          </div>
          {!l.dados.linhas.length ? (
            <Vazio>Nenhum documento no mês.</Vazio>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Documento</th>
                    <th>{tipo === 'ventas' ? 'Cliente' : 'Fornecedor'}</th>
                    <th className="numero">Gravado 10%</th>
                    <th className="numero">Gravado 5%</th>
                    <th className="numero">Exento</th>
                    <th className="numero">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {l.dados.linhas.map((x) => (
                    <tr key={x.id} className={x.anulado ? 'linha-inativa' : ''}>
                      <td>{dataCurta(x.data)}</td>
                      <td>
                        {x.comprovante === 'NOTA_CREDITO' ? 'NC ' : ''}
                        {x.numero}
                        <div className="nota">timbrado {x.timbrado}{x.anulado ? ' · anulado' : ''}{x.moeda === 'USD' ? ' · em dólar' : ''}</div>
                      </td>
                      <td>
                        {x.razao_social}
                        <div className="nota">
                          {x.tipo_documento} {x.documento}
                          {x.dv !== null ? `-${x.dv}` : ''}
                        </div>
                      </td>
                      <td className="numero">{fmtGs(x.pyg.total_10)}</td>
                      <td className="numero">{fmtGs(x.pyg.total_5)}</td>
                      <td className="numero">{fmtGs(x.pyg.exento)}</td>
                      <td className={`numero ${x.comprovante === 'NOTA_CREDITO' ? 'valor-negativo' : ''}`}>{fmtGs(x.pyg.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="nota">Valores em guaranis, com o IVA incluído; documento em dólar convertido pelo câmbio dele. Leiaute do CSV a validar com o contador antes de enviar à DNIT.</p>
        </>
      )}
    </Cartao>
  );
}
