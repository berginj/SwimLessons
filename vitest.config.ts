import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(repoRoot, 'src');

export default defineConfig({
  resolve: {
    alias: {
      '@core': path.join(srcRoot, 'core'),
      '@adapters': path.join(srcRoot, 'adapters'),
      '@services': path.join(srcRoot, 'services'),
      '@infrastructure': path.join(srcRoot, 'infrastructure'),
      '@functions': path.join(srcRoot, 'functions'),
    },
  },
  test: {
    exclude: [
      'tests/e2e/**',
      'playwright.config.ts',
      'node_modules/**',
      'dist/**',
    ],
  },
});
