import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node22',
  outDir: 'dist',
  external: ['better-sqlite3', 'playwright'],
});
