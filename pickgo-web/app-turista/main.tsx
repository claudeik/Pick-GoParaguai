import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppTurista } from '../src/AppTurista.tsx';
import { ProvedorSessao } from '../src/sessao.tsx';
import '../src/styles.css';
import '../src/app.css';

// Entrada do app do turista publicado na Play Store e na App Store (Capacitor).
// Só o app do turista: as telas da equipe ficam no sistema web.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ProvedorSessao>
      <AppTurista />
    </ProvedorSessao>
  </StrictMode>,
);
