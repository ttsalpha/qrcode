import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  external: ['react', 'react-dom'],
  target: 'es2018',
  clean: true,
  sourcemap: true,
  treeshake: true,
  banner: {
    js: '"use client";',
  },
});
