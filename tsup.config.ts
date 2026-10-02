import { defineConfig } from 'tsup';

// One config so the entries share chunks. No `banner` for "use client": tsup
// stamps it on every file, shared chunks included, which would make the core a
// client module and break ./server in a React Server Component.
// scripts/postbuild.mjs adds it to the root entry only.
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    server: 'src/server.ts',
    core: 'src/core/index.ts',
    native: 'src/native/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,
  external: ['react', 'react-dom', 'react-native-svg'],
  target: 'es2020',
  minify: true,
  sourcemap: false,
  onSuccess: 'node scripts/postbuild.mjs',
});
