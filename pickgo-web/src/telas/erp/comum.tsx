import { Trash2 } from 'lucide-react';
import type { IvaErp, ItemErp, LinhaPagamentoErp, MoedaErp } from '../../api.ts';

// Peças comuns das telas do ERP: valores em guaranis (sem centavos) e dólares (centavos).

export const fmtGs = (v: number) => `Gs. ${Math.round(v).toLocaleString('es-PY')}`;
export const fmtMoeda = (v: number, m: MoedaErp) => (m === 'PYG' ? fmtGs(v) : (v / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' }));
export const fmtQtd = (v: number) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
export const hojePy = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Asuncion' });
export const mesPy = () => hojePy().slice(0, 7);
export const dataCurta = (d: string | null | undefined) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
export const NOME_IVA: Record<IvaErp, string> = { '10': 'IVA 10%', '5': 'IVA 5%', EXENTO: 'Exento' };

/** Lê valor digitado na moeda: guaranis inteiros ("1.100.000") ou dólares com centavos ("199,90"). */
export function lerValor(texto: string, moeda: MoedaErp): number | null {
  const t = texto.trim();
  if (!t) return null;
  if (moeda === 'PYG') {
    const n = Number(t.replace(/\D/g, ''));
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  const normal = t.includes(',') ? t.replaceAll('.', '').replace(',', '.') : t;
  const n = Number(normal.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export interface LinhaEditavel {
  item_id: string;
  descricao: string;
  quantidade: string;
  preco: string;
  iva: IvaErp;
}

export const linhaVazia = (): LinhaEditavel => ({ item_id: '', descricao: '', quantidade: '1', preco: '', iva: '10' });

/** Total com IVA de cada linha e por alíquota, para conferir antes de gravar. */
export function totaisLinhas(linhas: LinhaEditavel[], moeda: MoedaErp) {
  let total = 0;
  let iva = 0;
  for (const l of linhas) {
    const v = Math.round(Number(l.quantidade.replace(',', '.')) * (lerValor(l.preco, moeda) ?? 0));
    if (!Number.isFinite(v)) continue;
    total += v;
    iva += l.iva === '10' ? v / 11 : l.iva === '5' ? v / 21 : 0;
  }
  return { total, iva: Math.round(iva) };
}

export function EditorLinhas({
  linhas,
  setLinhas,
  itens,
  moeda,
  livre,
}: {
  linhas: LinhaEditavel[];
  setLinhas: (l: LinhaEditavel[]) => void;
  itens: ItemErp[];
  moeda: MoedaErp;
  /** Fatura aceita linha sem item cadastrado (só descrição). */
  livre?: boolean;
}) {
  const muda = (i: number, d: Partial<LinhaEditavel>) => setLinhas(linhas.map((l, j) => (j === i ? { ...l, ...d } : l)));
  const t = totaisLinhas(linhas, moeda);
  return (
    <div className="editor-linhas">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Qtd.</th>
              <th>Preço unitário (com IVA)</th>
              <th>IVA</th>
              <th>Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => {
              const total = Math.round(Number(l.quantidade.replace(',', '.')) * (lerValor(l.preco, moeda) ?? 0));
              return (
                <tr key={i}>
                  <td>
                    <select
                      className="form-control"
                      aria-label="Item"
                      value={l.item_id}
                      onChange={(e) => {
                        const it = itens.find((x) => x.id === e.target.value);
                        muda(i, { item_id: e.target.value, iva: it?.iva ?? l.iva, descricao: it?.descricao ?? l.descricao, preco: l.preco || (it?.preco_venda_pyg && moeda === 'PYG' ? String(it.preco_venda_pyg) : '') });
                      }}
                    >
                      <option value="">{livre ? 'Sem item (só descrição)' : 'Escolha o item'}</option>
                      {itens.filter((x) => x.ativo).map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.codigo} · {x.descricao}
                        </option>
                      ))}
                    </select>
                    {livre && !l.item_id && <input className="form-control" placeholder="Descrição" aria-label="Descrição" value={l.descricao} onChange={(e) => muda(i, { descricao: e.target.value })} />}
                  </td>
                  <td>
                    <input className="form-control estreito" inputMode="decimal" aria-label="Quantidade" value={l.quantidade} onChange={(e) => muda(i, { quantidade: e.target.value })} />
                  </td>
                  <td>
                    <input className="form-control" inputMode="decimal" aria-label="Preço unitário" placeholder={moeda === 'PYG' ? 'Gs.' : 'US$'} value={l.preco} onChange={(e) => muda(i, { preco: e.target.value })} />
                  </td>
                  <td>
                    <select className="form-control" aria-label="IVA" value={l.iva} onChange={(e) => muda(i, { iva: e.target.value as IvaErp })}>
                      {Object.entries(NOME_IVA).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="numero">{Number.isFinite(total) ? fmtMoeda(total, moeda) : '—'}</td>
                  <td>
                    <button type="button" className="icone" aria-label="Tirar linha" disabled={linhas.length === 1} onClick={() => setLinhas(linhas.filter((_, j) => j !== i))}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="kanban-topo">
        <button type="button" className="btn btn-sm btn-outline" onClick={() => setLinhas([...linhas, linhaVazia()])}>
          + Linha
        </button>
        <span>
          Total <strong>{fmtMoeda(t.total, moeda)}</strong> · IVA incluído {fmtMoeda(t.iva, moeda)}
        </span>
      </div>
    </div>
  );
}

/** Converte as linhas digitadas no formato da API; null se faltar algo. */
export function linhasParaApi(linhas: LinhaEditavel[], moeda: MoedaErp, exigeItem: boolean) {
  const r: { item_id?: string; descricao?: string; quantidade: number; preco_unitario: number; iva: IvaErp }[] = [];
  for (const l of linhas) {
    const q = Number(l.quantidade.replace(',', '.'));
    const p = lerValor(l.preco, moeda);
    if (!(q > 0) || p === null) return null;
    if (exigeItem && !l.item_id) return null;
    if (!l.item_id && l.descricao.trim().length < 2) return null;
    r.push({ ...(l.item_id ? { item_id: l.item_id } : { descricao: l.descricao.trim() }), quantidade: q, preco_unitario: p, iva: l.iva });
  }
  return r;
}

export function CamposPagamento({ v, setV, rotulo }: { v: LinhaPagamentoErp; setV: (v: LinhaPagamentoErp) => void; rotulo: string }) {
  return (
    <div className="grid-2">
      <div className="form-group">
        <label htmlFor="pg-cond">{rotulo}</label>
        <select id="pg-cond" className="form-control" value={v.condicao} onChange={(e) => setV({ ...v, condicao: e.target.value as 'CONTADO' | 'CREDITO' })}>
          <option value="CONTADO">À vista (contado)</option>
          <option value="CREDITO">A prazo (crédito)</option>
        </select>
      </div>
      {v.condicao === 'CONTADO' ? (
        <div className="form-group">
          <label htmlFor="pg-meio">Meio</label>
          <select id="pg-meio" className="form-control" value={v.meio ?? 'TRANSFERENCIA'} onChange={(e) => setV({ ...v, meio: e.target.value as LinhaPagamentoErp['meio'] })}>
            {['TRANSFERENCIA', 'EFECTIVO', 'CHEQUE', 'PIX', 'TARJETA'].map((m) => (
              <option key={m} value={m}>
                {m.toLowerCase()}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <>
          <div className="form-group">
            <label htmlFor="pg-parc">Parcelas</label>
            <input id="pg-parc" type="number" min={1} max={60} className="form-control" value={v.parcelas ?? 1} onChange={(e) => setV({ ...v, parcelas: Number(e.target.value) || 1 })} />
          </div>
          <div className="form-group">
            <label htmlFor="pg-venc">Primeiro vencimento</label>
            <input id="pg-venc" type="date" className="form-control" value={v.primeiro_vencimento ?? ''} onChange={(e) => setV({ ...v, primeiro_vencimento: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="pg-int">Intervalo (dias)</label>
            <input id="pg-int" type="number" min={1} max={365} className="form-control" value={v.intervalo_dias ?? 30} onChange={(e) => setV({ ...v, intervalo_dias: Number(e.target.value) || 30 })} />
          </div>
        </>
      )}
    </div>
  );
}
