import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@splitfire/sim': new URL('./packages/sim/src/index.ts', import.meta.url).pathname,
      '@splitfire/bot': new URL('./packages/bot/src/index.ts', import.meta.url).pathname,
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
  },
});
