import { useEffect, useState } from 'react';
import { criarApi, type ConfigPublica } from './api.ts';
import { Brasao } from './componentes/Brasao.tsx';
import { Turista } from './telas/Turista.tsx';

/** Casca do app do turista nas lojas: cabeçalho enxuto, cotação do dia e o app. */
export function AppTurista() {
  const [config, setConfig] = useState<ConfigPublica | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = () => {
    setErro(null);
    criarApi(null)
      .config()
      .then(setConfig)
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)));
  };
  useEffect(carregar, []);

  return (
    <div className="app-loja">
      <div className="paraguay-tricolor-bar" role="presentation" />
      <header className="app-header app-header-loja">
        <div className="brand-identity">
          <Brasao />
          <div className="brand-title">
            <span className="brand-eyebrow">Portal Paraguai</span>
            <h1>Pick &amp; Go</h1>
            {config && (
              <span className="brand-subtitle">
                US$ 1 = R$ {config.cotacao_usd_brl.toFixed(4).replace('.', ',')} · pague por Pix e retire sem fila
              </span>
            )}
          </div>
        </div>
      </header>
      <main className="main-container">
        {erro && (
          <div className="caixa-erro" role="alert">
            Sem conexão com o Pick &amp; Go. Confira a internet e tente de novo.{' '}
            <button type="button" className="link" onClick={carregar}>
              Tentar de novo
            </button>
          </div>
        )}
        <Turista config={config} loja />
      </main>
    </div>
  );
}
