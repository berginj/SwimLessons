import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      'tests/e2e/**',
      'playwright.config.ts',
      'node_modules/**',
      'dist/**',
    ],
  },
});

