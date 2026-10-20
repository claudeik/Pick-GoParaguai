import { useEffect, useState } from 'react';
import type { Api, MovimentoErp } from '../../api.ts';
import { CaixaErro, Cartao, Dialogo, useAcao, Vazio } from '../../componentes/comum.tsx';
import { useEquipe } from '../../equipe.tsx';
import { fmtData } from '../../formato.ts';
import { useCarga } from '../../sessao.tsx';
import { fmtGs, fmtQtd } from './comum.tsx';

// Controle de estoque do Portal: saldos por depósito, movimentações, kardex e inventário.

const NOME_MOV: Record<string, string> = {
  ENTRADA_COMPRA: 'Entrada de compra',
  SAIDA_VENDA: 'Saída por venda',
  DEVOLUCAO_VENDA: 'Devolução de venda',
  ESTORNO_COMPRA: 'Estorno de compra',
  AJUSTE_ENTRADA: 'Ajuste (entrada)',
  AJUSTE_SAIDA: 'Ajuste (saída)',
  CONSUMO_INTERNO: 'Consumo interno',
  TRANSFERENCIA_SAIDA: 'Transferência (saída)',
  TRANSFERENCIA_ENTRADA: 'Transferência (entrada)',
  INVENTARIO: 'Ajuste de inventário',
};

export function Estoque({ api }: { api: Api }) {
  const { pode } = useEquipe();
  const depositos = useCarga(() => api.erpDepositos(), [api]);
  const itens = useCarga(() => api.erpItens(), [api]);
  const [deposito, setDeposito] = useState('');
  const [soAbaixo, setSoAbaixo] = useState(false);
  const saldos = useCarga(() => api.erpSaldos({ deposito_id: deposito || undefined, abaixo_minimo: soAbaixo }), [api, deposito, soAbaixo]);
  const [kardex, setKardex] = useState<string | null>(null);
  const [movendo, setMovendo] = useState(false);
  const recarregar = async () => {
    await Promise.all([saldos.recarregar(), itens.recarregar()]);
  };
  const totalValor = (saldos.dados?.saldos ?? []).reduce((s, x) => s + Number(x.valor_pyg), 0);

  return (
    <>
      <Cartao
        tag="Controle de estoque"
        titulo="Saldos por depósito"
        extra={
          pode('erp.estoque') ? (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setMovendo(true)} disabled={!depositos.dados?.depositos.length}>
              + Movimentação
            </button>
          ) : undefined
        }
      >
        <div className="filtros-gestao">
          <select className="form-control" aria-label="Depósito" value={deposito} onChange={(e) => setDeposito(e.target.value)}>
            <option value="">Todos os depósitos</option>
            {depositos.dados?.depositos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.codigo} · {d.nome}
              </option>
            ))}
          </select>
          <label className="marca">
            <input type="checkbox" checked={soAbaixo} onChange={(e) => setSoAbaixo(e.target.checked)} /> Só abaixo do mínimo
            {!!saldos.dados?.abaixo_minimo && <span className="badge badge-red">{saldos.dados.abaixo_minimo}</span>}
          </label>
          <span className="nota">Valor em estoque: {fmtGs(totalValor)} (custo médio, sem IVA)</span>
        </div>
        {saldos.erro && <CaixaErro erro={saldos.erro} onTentar={saldos.recarregar} />}
        {saldos.dados?.saldos.length === 0 && <Vazio>Nenhum saldo. A entrada vem pelas compras ou por ajuste.</Vazio>}
        {!!saldos.dados?.saldos.length && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Depósito</th>
                  <th className="numero">Saldo</th>
                  <th className="numero">Total do item</th>
                  <th className="numero">Custo médio</th>
                  <th className="numero">Valor</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {saldos.dados.saldos.map((s) => {
                  const abaixo = Number(s.estoque_minimo) > 0 && Number(s.total_item) < Number(s.estoque_minimo);
                  return (
                    <tr key={`${s.item_id}-${s.deposito_id}`}>
                      <td>
                        <strong>{s.codigo}</strong> · {s.descricao}
                        {abaixo && <div className="nota destaque">abaixo do mínimo ({fmtQtd(s.estoque_minimo)})</div>}
                      </td>
                      <td>{s.deposito_nome}</td>
                      <td className="numero">
                        {fmtQtd(s.quantidade)} {s.unidade}
                      </td>
                      <td className="numero">{fmtQtd(s.total_item)}</td>
                      <td className="numero">{fmtGs(Number(s.custo_medio_pyg))}</td>
                      <td className="numero">{fmtGs(Number(s.valor_pyg))}</td>
                      <td>
                        <button type="button" className="btn btn-sm btn-outline" onClick={() => setKardex(s.item_id)}>
                          Kardex
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      <Inventarios api={api} depositos={depositos.dados?.depositos ?? []} aoMudar={recarregar} />

      <Dialogo aberto={movendo} aoFechar={() => setMovendo(false)} titulo="Movimentação de estoque">
        {movendo && (
          <FormMovimento
            api={api}
            itens={(itens.dados?.itens ?? []).filter((i) => i.controla_estoque && i.ativo)}
            depositos={depositos.dados?.depositos ?? []}
            aoSalvar={async () => {
              setMovendo(false);
              await recarregar();
            }}
          />
        )}
      </Dialogo>
      <Dialogo aberto={!!kardex} aoFechar={() => setKardex(null)} titulo="Kardex do item">
        {kardex && <Kardex api={api} itemId={kardex} />}
      </Dialogo>
    </>
  );
}

function FormMovimento({ api, itens, depositos, aoSalvar }: { api: Api; itens: { id: string; codigo: string; descricao: string; custo_medio_pyg: number }[]; depositos: { id: string; codigo: string; nome: string }[]; aoSalvar: () => Promise<void> }) {
  const { ocupado, executar } = useAcao();
  const [f, setF] = useState({ tipo: 'AJUSTE_ENTRADA' as 'AJUSTE_ENTRADA' | 'AJUSTE_SAIDA' | 'CONSUMO_INTERNO' | 'TRANSFERENCIA', item_id: itens[0]?.id ?? '', deposito_id: depositos[0]?.id ?? '', destino_id: depositos[1]?.id ?? '', quantidade: '', custo: '', observacao: '' });
  const item = itens.find((i) => i.id === f.item_id);
  useEffect(() => {
    if (f.tipo === 'AJUSTE_ENTRADA' && item && !f.custo) setF((x) => ({ ...x, custo: String(Math.round(Number(item.custo_medio_pyg))) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.item_id, f.tipo]);
  const qtd = Number(f.quantidade.replace(',', '.'));
  const ok = item && f.deposito_id && qtd > 0 && f.observacao.trim().length >= 3 && (f.tipo !== 'TRANSFERENCIA' || (f.destino_id && f.destino_id !== f.deposito_id));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        void executar(
          'mov',
          async () => {
            await api.erpMovimentar({
              tipo: f.tipo,
              item_id: f.item_id,
              deposito_id: f.deposito_id,
              destino_id: f.tipo === 'TRANSFERENCIA' ? f.destino_id : undefined,
              quantidade: qtd,
              custo_unitario_pyg: f.tipo === 'AJUSTE_ENTRADA' ? Number(f.custo.replace(/\D/g, '')) : undefined,
              observacao: f.observacao.trim(),
            });
            await aoSalvar();
          },
          'Movimentação registrada.',
        );
      }}
    >
      <div className="grid-2">
        <div className="form-group">
          <label htmlFor="mv-tipo">Tipo</label>
          <select id="mv-tipo" className="form-control" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as typeof f.tipo })}>
            <option value="AJUSTE_ENTRADA">Ajuste de entrada</option>
            <option value="AJUSTE_SAIDA">Ajuste de saída (perda, avaria)</option>
            <option value="CONSUMO_INTERNO">Consumo interno</option>
            <option value="TRANSFERENCIA">Transferência entre depósitos</option>
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="mv-item">Item</label>
          <select id="mv-item" className="form-control" value={f.item_id} onChange={(e) => setF({ ...f, item_id: e.target.value, custo: '' })}>
            {itens.map((i) => (
              <option key={i.id} value={i.id}>
                {i.codigo} · {i.descricao}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="mv-dep">{f.tipo === 'TRANSFERENCIA' ? 'De' : 'Depósito'}</label>
          <select id="mv-dep" className="form-control" value={f.deposito_id} onChange={(e) => setF({ ...f, deposito_id: e.target.value })}>
            {depositos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.codigo} · {d.nome}
              </option>
            ))}
          </select>
        </div>
        {f.tipo === 'TRANSFERENCIA' && (
          <div className="form-group">
            <label htmlFor="mv-dest">Para</label>
            <select id="mv-dest" className="form-control" value={f.destino_id} onChange={(e) => setF({ ...f, destino_id: e.target.value })}>
              {depositos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.codigo} · {d.nome}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="form-group">
          <label htmlFor="mv-qtd">Quantidade</label>
          <input id="mv-qtd" className="form-control" inputMode="decimal" value={f.quantidade} onChange={(e) => setF({ ...f, quantidade: e.target.value })} />
        </div>
        {f.tipo === 'AJUSTE_ENTRADA' && (
          <div className="form-group">
            <label htmlFor="mv-custo">Custo unitário (Gs., sem IVA)</label>
            <input id="mv-custo" className="form-control" inputMode="numeric" value={f.custo} onChange={(e) => setF({ ...f, custo: e.target.value })} />
          </div>
        )}
      </div>
      <div className="form-group">
        <label htmlFor="mv-obs">Motivo</label>
        <input id="mv-obs" className="form-control" required minLength={3} maxLength={300} value={f.observacao} onChange={(e) => setF({ ...f, observacao: e.target.value })} />
      </div>
      <p className="nota">Movimentações não se apagam; para corrigir, registre a movimentação contrária. Entrada de compra é feita em Compras.</p>
      <button type="submit" className="btn btn-primary btn-block" disabled={!ok || !!ocupado}>
        Registrar
      </button>
    </form>
  );
}

function Kardex({ api, itemId }: { api: Api; itemId: string }) {
  const m = useCarga(() => api.erpMovimentos({ item_id: itemId }), [api, itemId]);
  if (m.erro) return <CaixaErro erro={m.erro} />;
  if (!m.dados) return <p className="carregando">Carregando…</p>;
  const lista: MovimentoErp[] = m.dados.movimentos;
  if (!lista.length) return <Vazio>Sem movimentos.</Vazio>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Quando</th>
            <th>Movimento</th>
            <th>Depósito</th>
            <th className="numero">Qtd.</th>
            <th className="numero">Saldo no depósito</th>
            <th className="numero">Custo</th>
            <th className="numero">Custo médio</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((x) => (
            <tr key={x.id}>
              <td>
                {fmtData(x.criado_em)}
                <div className="nota">{x.autor.split(':').pop()}</div>
              </td>
              <td>
                {NOME_MOV[x.tipo] ?? x.tipo}
                {x.observacao && <div className="nota">{x.observacao}</div>}
              </td>
              <td>{x.deposito_nome}</td>
              <td className={`numero ${Number(x.quantidade) < 0 ? 'valor-negativo' : 'valor-positivo'}`}>{fmtQtd(x.quantidade)}</td>
              <td className="numero">{fmtQtd(x.saldo_apos)}</td>
              <td className="numero">{fmtGs(Number(x.custo_unitario_pyg))}</td>
              <td className="numero">{fmtGs(Number(x.custo_medio_apos))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Inventarios({ api, depositos, aoMudar }: { api: Api; depositos: { id: string; codigo: string; nome: string }[]; aoMudar: () => Promise<void> }) {
  const { pode } = useEquipe();
  const lista = useCarga(() => api.erpInventarios(), [api]);
  const { ocupado, executar } = useAcao();
  const [dep, setDep] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  return (
    <Cartao tag="Inventário" titulo="Contagem de estoque">
      {pode('erp.estoque') && (
        <form
          className="busca"
          onSubmit={(e) => {
            e.preventDefault();
            if (dep)
              void executar('abrir', async () => {
                const r = await api.erpAbrirInventario(dep);
                await lista.recarregar();
                setAberto(r.id);
              }, 'Inventário aberto: o saldo de agora foi fotografado.');
          }}
        >
          <select className="form-control" aria-label="Depósito do inventário" value={dep} onChange={(e) => setDep(e.target.value)}>
            <option value="">Depósito a contar</option>
            {depositos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.codigo} · {d.nome}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-sm btn-outline" disabled={!dep || !!ocupado}>
            Abrir inventário
          </button>
        </form>
      )}
      {lista.dados?.inventarios.length === 0 && <Vazio>Nenhum inventário.</Vazio>}
      <ul className="lista-compacta">
        {lista.dados?.inventarios.map((v) => (
          <li key={v.id}>
            <button type="button" className="link" onClick={() => setAberto(v.id)}>
              {v.deposito_nome} · {fmtData(v.aberto_em)}
            </button>{' '}
            <span className={`badge ${v.estado === 'ABERTO' ? 'badge-gold' : 'badge-green'}`}>{v.estado.toLowerCase()}</span>{' '}
            <span className="nota">
              {v.contados}/{v.itens} itens contados
            </span>
          </li>
        ))}
      </ul>
      <Dialogo aberto={!!aberto} aoFechar={() => setAberto(null)} titulo="Inventário">
        {aberto && (
          <Contagem
            api={api}
            id={aberto}
            aoFechar={async () => {
              setAberto(null);
              await Promise.all([lista.recarregar(), aoMudar()]);
            }}
          />
        )}
      </Dialogo>
    </Cartao>
  );
}

function Contagem({ api, id, aoFechar }: { api: Api; id: string; aoFechar: () => Promise<void> }) {
  const { pode } = useEquipe();
  const d = useCarga(() => api.erpInventario(id), [api, id]);
  const { ocupado, executar } = useAcao();
  const [contado, setContado] = useState<Record<string, string>>({});
  useEffect(() => {
    if (d.dados) setContado(Object.fromEntries(d.dados.itens.map((i) => [i.item_id, i.quantidade_contada === null ? '' : String(i.quantidade_contada)])));
  }, [d.dados]);
  if (d.erro) return <CaixaErro erro={d.erro} />;
  if (!d.dados) return <p className="carregando">Carregando…</p>;
  const aberto = d.dados.inventario.estado === 'ABERTO' && pode('erp.estoque');
  const salvar = () =>
    api.erpContagem(
      id,
      d.dados!.itens.map((i) => ({ item_id: i.item_id, quantidade_contada: contado[i.item_id]?.trim() ? Number(contado[i.item_id]!.replace(',', '.')) : null })),
    );
  return (
    <div className="ficha">
      <p className="texto-apoio">
        {d.dados.inventario.deposito_nome}. Item deixado em branco não é ajustado. Diferença = contado − saldo no momento da abertura.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th className="numero">Sistema</th>
              <th>Contado</th>
              <th className="numero">Diferença</th>
            </tr>
          </thead>
          <tbody>
            {d.dados.itens.map((i) => {
              const c = contado[i.item_id]?.trim();
              const dif = c ? Number(c.replace(',', '.')) - Number(i.quantidade_sistema) : null;
              return (
                <tr key={i.item_id}>
                  <td>
                    {i.codigo} · {i.descricao}
                  </td>
                  <td className="numero">{fmtQtd(i.quantidade_sistema)}</td>
                  <td>
                    <input className="form-control estreito" inputMode="decimal" aria-label={`Contado de ${i.descricao}`} readOnly={!aberto} value={contado[i.item_id] ?? ''} onChange={(e) => setContado({ ...contado, [i.item_id]: e.target.value })} />
                  </td>
                  <td className={`numero ${dif ? (dif < 0 ? 'valor-negativo' : 'valor-positivo') : ''}`}>{dif === null ? '—' : fmtQtd(dif)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {aberto && (
        <div className="botoes-linha">
          <button type="button" className="btn btn-sm btn-outline" disabled={!!ocupado} onClick={() => void executar('salvar', async () => (await salvar(), await d.recarregar()), 'Contagem salva.')}>
            Salvar contagem
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={!!ocupado}
            onClick={() => {
              if (!confirm('Fechar o inventário? As diferenças viram ajustes de estoque.')) return;
              void executar('fechar', async () => {
                await salvar();
                const r = await api.erpFecharInventario(id);
                await aoFechar();
                return r;
              }, (r) => `Inventário fechado: ${r?.ajustes ?? 0} ajuste(s).`);
            }}
          >
            Fechar e ajustar
          </button>
        </div>
      )}
    </div>
  );
}
