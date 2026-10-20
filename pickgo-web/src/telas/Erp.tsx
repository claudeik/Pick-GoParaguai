import { useState } from 'react';
import type { Api, Permissao } from '../api.ts';
import { CaixaErro, Kpi, PedirLogin, SemPermissao } from '../componentes/comum.tsx';
import { useEquipe } from '../equipe.tsx';
import { useApiEquipe, useCarga } from '../sessao.tsx';
import { Cadastros } from './erp/Cadastros.tsx';
import { fmtGs, fmtMoeda } from './erp/comum.tsx';
import { Contas, Livros } from './erp/Contas.tsx';
import { Compras, Faturas } from './erp/Documentos.tsx';
import { Estoque } from './erp/Estoque.tsx';

// ERP do Portal Paraguai (controle interno): estoque, compras, faturas, contas e livros do IVA.

type Aba = 'estoque' | 'compras' | 'faturas' | 'contas' | 'livros' | 'cadastros';

const ABAS: { id: Aba; rotulo: string; precisa?: Permissao[] }[] = [
  { id: 'estoque', rotulo: '📦 Estoque' },
  { id: 'compras', rotulo: '🧾 Compras' },
  { id: 'faturas', rotulo: '🧮 Faturas' },
  { id: 'contas', rotulo: '💰 Contas a pagar e receber' },
  { id: 'livros', rotulo: '📒 Livros do IVA', precisa: ['erp.fiscal', 'erp.financeiro'] },
  { id: 'cadastros', rotulo: '🗃️ Cadastros' },
];

export function Erp() {
  const { api, erro, precisaLogin } = useApiEquipe('admin', 'admin-portal');
  const { pode } = useEquipe();
  const [aba, setAba] = useState<Aba>('estoque');
  if (precisaLogin) return <PedirLogin />;
  if (erro) return <CaixaErro erro={erro} />;
  if (!pode('erp.ver')) return <SemPermissao oQue="ERP do Portal" />;
  if (!api) return <p className="carregando">Entrando…</p>;
  const abas = ABAS.filter((a) => !a.precisa || a.precisa.some((p) => pode(p)));
  return (
    <>
      <Painel api={api} />
      <div className="sub-nav" role="tablist" aria-label="ERP">
        {abas.map((a) => (
          <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} className={`sub-tab ${aba === a.id ? 'active' : ''}`} onClick={() => setAba(a.id)}>
            {a.rotulo}
          </button>
        ))}
      </div>
      {aba === 'estoque' && <Estoque api={api} />}
      {aba === 'compras' && <Compras api={api} />}
      {aba === 'faturas' && <Faturas api={api} />}
      {aba === 'contas' && <Contas api={api} />}
      {aba === 'livros' && <Livros api={api} />}
      {aba === 'cadastros' && <Cadastros api={api} />}
    </>
  );
}

function Painel({ api }: { api: Api }) {
  const p = useCarga(() => api.erpPainel(), [api], 30_000);
  if (p.erro) return <CaixaErro erro={p.erro} onTentar={p.recarregar} />;
  const d = p.dados;
  const t = (tipo: 'PAGAR' | 'RECEBER') => (d?.titulos ?? []).filter((x) => x.tipo === tipo);
  const somar = (tipo: 'PAGAR' | 'RECEBER', k: 'aberto' | 'vencido' | 'vence_30') => t(tipo).map((x) => fmtMoeda(Number(x[k]), x.moeda)).join(' + ') || fmtGs(0);
  return (
    <>
      {d && !d.empresa_configurada && <p className="quota-alert warning">Cadastre os dados da empresa e o timbrado em Cadastros para emitir faturas.</p>}
      <div className="grid-4">
        <Kpi rotulo="A receber" valor={somar('RECEBER', 'aberto')} sub={`vencido: ${somar('RECEBER', 'vencido')}`} destaque="green" />
        <Kpi rotulo="A pagar" valor={somar('PAGAR', 'aberto')} sub={`vence em 30 dias: ${somar('PAGAR', 'vence_30')}`} destaque="red" />
        <Kpi
          rotulo={`IVA do mês ${d?.periodo ?? ''}`}
          valor={d ? fmtGs(d.iva_a_pagar_pyg) : '—'}
          sub={d ? `${d.iva_a_pagar_pyg >= 0 ? 'a pagar' : 'crédito'} · débito ${fmtGs(d.iva_debito_pyg)} − crédito ${fmtGs(d.iva_credito_pyg)}` : undefined}
        />
        <Kpi rotulo="Estoque" valor={d ? fmtGs(d.estoque_valor_pyg) : '—'} sub={d ? `${d.estoque_itens} item(ns) · ${d.itens_abaixo_minimo} abaixo do mínimo` : undefined} destaque={d?.itens_abaixo_minimo ? 'red' : undefined} />
      </div>
    </>
  );
}
