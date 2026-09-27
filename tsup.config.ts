import { defineConfig } from 'tsup';

const shared = {
  format: ['esm', 'cjs'] as const,
  dts: true,
  external: ['react', 'react-dom'],
  target: 'es2020',
  minify: true,
  sourcemap: false,
};

// Two configs so only the root entry gets the banner. dist is cleaned by the
// build script instead of tsup, because a per-config clean would race the other
// config's output.
export default defineConfig([
  {
    ...shared,
    entry: ['src/index.ts'],
    // <QRCode> makes this entry a client boundary
    banner: { js: '"use client";' },
  },
  {
    ...shared,
    entry: ['src/server.ts'],
    // Deliberately no banner: RSC must be able to call these directly.
  },
]);
