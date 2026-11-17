import { defineConfig } from 'vite';

// base './' sayesinde build çıktısı GitHub Pages alt klasöründe de çalışır.
export default defineConfig({
  base: './',
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 2000 },
});
