import { useEffect, useState } from 'react';
import { criarApi, type ConfigPublica } from './api.ts';
import { fmtPct } from './formato.ts';
import { useEquipe } from './equipe.tsx';
import type { Permissao, QuemSou } from './api.ts';
import { Catalogo } from './telas/Catalogo.tsx';
import { Crm } from './telas/Crm.tsx';
import { Erp } from './telas/Erp.tsx';
import { Usuarios } from './telas/Usuarios.tsx';
import { Central } from './telas/Central.tsx';
import { Lojista } from './telas/Lojista.tsx';
import { Plataforma } from './telas/Plataforma.tsx';
import { Turista } from './telas/Turista.tsx';
import { Brasao } from './componentes/Brasao.tsx';

type Visao = 'turista' | 'central' | 'lojista' | 'catalogo' | 'crm' | 'plataforma' | 'erp' | 'usuarios';

/** Quando a aba aparece para quem entrou pelo Keycloak (sem login, todas aparecem e pedem login). */
const VISIVEL: Record<Visao, (eu: QuemSou, pode: (p: Permissao) => boolean) => boolean> = {
  turista: () => true,
  central: (eu, pode) => eu.organizacao !== 'LOJA' && (pode('operacao.central') || pode('pedidos.ver')),
  lojista: (eu) => eu.organizacao === 'LOJA',
  catalogo: (eu, pode) => eu.organizacao !== 'LOJA' && pode('catalogo.ver'),
  crm: (_eu, pode) => pode('crm.ver'),
  plataforma: (_eu, pode) => pode('financeiro.plataforma'),
  erp: (_eu, pode) => pode('erp.ver'),
  usuarios: (_eu, pode) => pode('usuarios.ver'),
};

const VISOES: { id: Visao; rotulo: string; telas: string }[] = [
  { id: 'turista', rotulo: '🛍️ App do turista', telas: 'T1–T6 · T19' },
  { id: 'central', rotulo: '📦 Central do Portal e saída', telas: 'T7 · T30' },
  { id: 'lojista', rotulo: '🏪 Painel do lojista', telas: 'T9' },
  { id: 'catalogo', rotulo: '🗂️ Lista mestre das lojas', telas: 'Admin' },
  { id: 'crm', rotulo: '💬 CRM e atendimento', telas: 'T17 · T18' },
  { id: 'plataforma', rotulo: '🏦 Plataforma, split e ledger', telas: 'T10' },
  { id: 'erp', rotulo: '🧾 ERP do Portal', telas: 'Fiscal PY' },
  { id: 'usuarios', rotulo: '👥 Usuários e acesso', telas: 'Keycloak' },
];

function lerVisao(): Visao {
  // O link da campanha chega como #turista?c=…&oferta=…
  const h = location.hash.replace('#', '').split('?')[0] as Visao;
  return VISOES.some((v) => v.id === h) ? h : 'turista';
}

export function App() {
  const [visao, setVisao] = useState<Visao>(lerVisao);
  const [config, setConfig] = useState<ConfigPublica | null>(null);
  const equipe = useEquipe();
  const visoes = VISOES.filter((v) => !equipe.eu || VISIVEL[v.id](equipe.eu, equipe.pode));
  const [erroConfig, setErroConfig] = useState<string | null>(null);

  useEffect(() => {
    const aoMudar = () => setVisao(lerVisao());
    addEventListener('hashchange', aoMudar);
    return () => removeEventListener('hashchange', aoMudar);
  }, []);

  useEffect(() => {
    criarApi(null)
      .config()
      .then(setConfig)
      .catch((e: unknown) => setErroConfig(e instanceof Error ? e.message : String(e)));
  }, []);

  const ir = (v: Visao) => {
    location.hash = v;
    setVisao(v);
  };

  const portal = config ? fmtPct(config.comissao_portal_bps) : '7,5%';
  const epyx = config ? fmtPct(config.comissao_epyx_bps) : '7,5%';
  const loja = config ? fmtPct(10_000 - config.comissao_portal_bps - config.comissao_epyx_bps) : '85%';

  return (
    <>
      <div className="paraguay-tricolor-bar" role="presentation" />
      <header className="app-header">
        <div className="header-top">
          <div className="brand-identity">
            <Brasao />
            <div className="brand-title">
              <span className="brand-eyebrow">Portal Paraguai · In-store e cross-border</span>
              <h1>
                Pick &amp; Go <span className="brand-pill">Piloto CDE · Fase 1</span>
              </h1>
              <span className="brand-subtitle">
                Checkout Pix · Split {loja} loja / {portal} Portal / {epyx} EPYX
              </span>
            </div>
          </div>
          <CaixaEquipe />
          <div className="fx-live-banner">
            <div className="fx-indicator">
              <span className="pulse-dot" style={erroConfig ? { background: '#DC2626' } : undefined} />
              <div className="fx-values">
                {config ? (
                  <>
                    <span>
                      Cotação do pedido: <strong>US$ 1 = R$ {config.cotacao_usd_brl.toFixed(4).replace('.', ',')}</strong>
                    </span>
                    <span className="fx-meta">
                      + Pix {fmtPct(config.taxa_pix_bps)} + câmbio {fmtPct(config.taxa_cambio_bps)} pagos pelo comprador · cota US${' '}
                      {(config.cota_usd_centavos / 100).toFixed(0)}
                    </span>
                  </>
                ) : (
                  <span>{erroConfig ? 'API indisponível' : 'Carregando cotação…'}</span>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="persona-nav-wrapper">
          <nav className="persona-nav" aria-label="Módulos do Pick & Go">
            {visoes.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`nav-tab ${visao === v.id ? 'active' : ''}`}
                aria-current={visao === v.id ? 'page' : undefined}
                onClick={() => ir(v.id)}
              >
                {v.rotulo} <span className="tab-badge">{v.telas}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="main-container">
        {erroConfig && (
          <div className="caixa-erro" role="alert">
            <strong>Sem conexão com a API.</strong> Suba o backend com <code>npm run dev</code> em <code>pickgo-backend</code>{' '}
            (porta 3333). Detalhe: {erroConfig}
          </div>
        )}
        {visao === 'turista' && <Turista config={config} irPara={ir} />}
        {visao === 'central' && <Central />}
        {visao === 'lojista' && <Lojista config={config} />}
        {visao === 'catalogo' && <Catalogo config={config} />}
        {visao === 'crm' && <Crm />}
        {visao === 'plataforma' && <Plataforma config={config} />}
        {visao === 'erp' && <Erp />}
        {visao === 'usuarios' && <Usuarios />}
      </main>

      <div className="paraguay-tricolor-bar" role="presentation" />
      <footer className="app-footer">
        <p>
          <strong>Portal Paraguai · Pick &amp; Go</strong> — Especificação v0.1 · Piloto Ciudad del Este (5 lojas, 08h às 18h)
        </p>
      </footer>
    </>
  );
}

/** Quem está logado na equipe (Keycloak), ou o aviso do modo demonstração. */
function CaixaEquipe() {
  const { modo, eu, token, carregando, entrar, sair } = useEquipe();
  if (modo === 'demonstracao') {
    return (
      <div className="caixa-equipe">
        <span className="nota-clara">Modo demonstração · sem Keycloak</span>
      </div>
    );
  }
  if (carregando) return <div className="caixa-equipe nota-clara">…</div>;
  if (!token) {
    return (
      <div className="caixa-equipe">
        <button type="button" className="btn btn-sm btn-header-ghost" onClick={entrar}>
          🔐 Entrar (equipe)
        </button>
      </div>
    );
  }
  const org = eu?.organizacao === 'LOJA' ? (eu.loja_nome ?? 'Loja') : eu?.organizacao === 'EPYX' ? 'EPYX' : 'Portal Paraguai';
  return (
    <div className="caixa-equipe">
      <div className="quem">
        <strong>{eu?.nome ?? eu?.email ?? '…'}</strong>
        <span className="nota-clara">
          {eu?.perfis.map((p) => p.nome).join(', ')} · {org}
        </span>
      </div>
      <button type="button" className="btn btn-sm btn-header-ghost" onClick={sair}>
        Sair
      </button>
    </div>
  );
}
