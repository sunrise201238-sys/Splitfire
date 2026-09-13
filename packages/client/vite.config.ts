import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@splitfire/sim': new URL('../sim/src/index.ts', import.meta.url).pathname,
      '@splitfire/bot': new URL('../bot/src/index.ts', import.meta.url).pathname,
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
