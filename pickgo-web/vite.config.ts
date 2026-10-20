import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A API roda em outra porta; o proxy evita CORS no desenvolvimento.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    proxy: { '/v1': process.env.API_URL ?? 'http://localhost:3333' },
  },
});
