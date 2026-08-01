import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  external: ['react', 'react-dom'],
  target: 'es2020',
  minify: true,
  clean: true,
  sourcemap: true,
  banner: {
    js: '"use client";',
  },
});
