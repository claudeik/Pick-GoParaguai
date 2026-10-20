import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A API roda em outra porta; o proxy evita CORS no desenvolvimento.
// `--mode turista`: só o app do turista (app-turista/), que vai para Android e iOS pelo Capacitor.
export default defineConfig(({ mode }) => {
  const proxy = { '/v1': process.env.API_URL ?? 'http://localhost:3333' };
  if (mode !== 'turista') {
    return { plugins: [react()], server: { port: 5180, proxy } };
  }
  return {
    plugins: [react()],
    root: 'app-turista',
    envDir: import.meta.dirname,
    // O app instalado abre os arquivos do próprio aparelho: caminhos relativos.
    base: './',
    build: { outDir: '../dist-turista', emptyOutDir: true },
    server: { port: 5181, proxy },
  };
});
