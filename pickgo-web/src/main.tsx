import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { ProvedorEquipe } from './equipe.tsx';
import { ProvedorSessao } from './sessao.tsx';
import './styles.css';
import './app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProvedorEquipe>
      <ProvedorSessao>
        <App />
      </ProvedorSessao>
    </ProvedorEquipe>
  </StrictMode>,
);
