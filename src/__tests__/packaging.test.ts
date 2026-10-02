import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { gzipSync } from 'zlib';

// Nothing exercised the published bundles before, so defects that only exist
// after the build went unnoticed: the ./server entry threw on import inside a
// React Server Component, and importing <QRCode> pulled react-dom/server into
// the client bundle. Both are invisible from the source tree.

const root = process.cwd();
const dist = resolve(root, 'dist');
const built = existsSync(resolve(dist, 'index.js'));

const node = (code: string, conditions?: string) =>
  execFileSync(
    process.execPath,
    [...(conditions ? [`--conditions=${conditions}`] : []), '-e', code],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();

const bundles = () =>
  built ? readdirSync(dist).filter((f) => /\.c?js$/.test(f)) : [];
const read = (file: string) => readFileSync(resolve(dist, file), 'utf8');

// Every file an entry loads: itself plus the shared chunks it imports.
function reachable(entry: string, seen = new Set<string>()): Set<string> {
  const file = resolve(dist, entry);
  if (seen.has(file)) return seen;
  seen.add(file);
  const source = readFileSync(file, 'utf8');
  for (const m of source.matchAll(
    /(?:from\s*|require\()\s*['"](\.[^'"]+)['"]/g,
  )) {
    reachable(resolve(dirname(file), m[1]!), seen);
  }
  return seen;
}

const bareImports = (entry: string) => {
  const found = new Set<string>();
  for (const file of reachable(entry)) {
    for (const m of readFileSync(file, 'utf8').matchAll(
      /(?:from\s*|require\()\s*['"]([^.'"][^'"]*)['"]/g,
    )) {
      found.add(m[1]!);
    }
  }
  return [...found].sort();
};

const gzipSize = (entry: string) =>
  gzipSync(Buffer.concat([...reachable(entry)].map((f) => readFileSync(f))), {
    level: 9,
  }).length;

describe.skipIf(!built)('published bundles', () => {
  it('only the root entry is a client boundary', () => {
    for (const file of ['index.js', 'index.cjs']) {
      expect(read(file)).toMatch(/^"use client";/);
    }
    // Shared chunks included: a directive on one would turn the core into a
    // client module and break ./server in a React Server Component.
    const others = bundles().filter((f) => !/^index\.c?js$/.test(f));
    expect(others.length).toBeGreaterThan(4);
    for (const file of others) {
      expect(read(file), file).not.toMatch(/use client/);
    }
  });

  it('no bundle imports react-dom/server', () => {
    for (const file of bundles()) {
      expect(read(file), file).not.toMatch(/react-dom\/server/);
    }
  });

  it('the server and core entries need no package at runtime', () => {
    for (const entry of ['server.js', 'server.cjs', 'core.js', 'core.cjs']) {
      expect(bareImports(entry), entry).toEqual([]);
    }
  });

  it('the server entry works under the react-server condition', () => {
    const out = node(
      `import('./dist/server.js')
        .then(m => { const s = m.toSVGString({ value: 'HELLO' }); console.log(s.startsWith('<svg') && s.endsWith('</svg>')); })
        .catch(e => { console.log('FAILED: ' + e.message); });`,
      'react-server',
    );
    expect(out).toBe('true');
  });

  it('the CJS server entry works under the react-server condition', () => {
    const out = node(
      `const s = require('./dist/server.cjs').toSVGString({ value: 'HELLO' });
       console.log(s.startsWith('<svg') && s.endsWith('</svg>'));`,
      'react-server',
    );
    expect(out).toBe('true');
  });

  it('the core entry runs on Node with no React installed', () => {
    // A resolver that refuses anything React: the entry must never ask for it.
    const hook = `
      import { register } from 'node:module';
      register('data:text/javascript,' + encodeURIComponent(\`
        export async function resolve(spec, ctx, next) {
          if (/^react/.test(spec)) throw new Error('core asked for ' + spec);
          return next(spec, ctx);
        }\`));
    `;
    const out = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `${hook}
         const m = await import('./dist/core.js');
         const g = m.buildQR({ value: 'HELLO' });
         const s = m.toSVGString({ value: 'HELLO' });
         console.log(g.finders.length + ':' + s.startsWith('<svg'));`,
      ],
      { cwd: root, encoding: 'utf8' },
    ).trim();
    expect(out).toBe('3:true');
  });

  it('exports the documented surface of every entry and format', () => {
    const surface: Record<string, string> = {
      index: 'QRCode,toDataURL,toSVGString',
      server: 'toDataURL,toSVGString',
      core: 'buildQR,toSVGString',
    };
    for (const [entry, expected] of Object.entries(surface)) {
      expect(
        node(
          `import('./dist/${entry}.js').then(m => console.log(Object.keys(m).sort().join(',')));`,
        ),
        `${entry}.js`,
      ).toBe(expected);
      expect(
        node(
          `console.log(Object.keys(require('./dist/${entry}.cjs')).sort().join(','));`,
        ),
        `${entry}.cjs`,
      ).toBe(expected);
    }
  });

  it('every path in package.json exports and typesVersions exists', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    const paths: string[] = [];
    const walk = (value: unknown) => {
      if (typeof value === 'string') paths.push(value);
      else if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object')
        Object.values(value).forEach(walk);
    };
    walk(pkg.exports);
    walk(pkg.typesVersions);
    expect(paths.length).toBeGreaterThan(10);
    for (const path of paths) {
      expect(existsSync(resolve(root, path)), path).toBe(true);
    }
  });

  // They were 82% of the tarball, with the TypeScript source inlined.
  it('ships no sourcemaps', () => {
    expect(readdirSync(dist).filter((f) => f.endsWith('.map'))).toEqual([]);
  });

  // Guard rails, not targets: a few percent above the build at the time they
  // were set. Raise one on purpose when a feature earns the bytes. Counted per
  // entry as gzip of the entry plus the shared chunks it loads.
  it('keeps each entry within its size budget', () => {
    const budgets: Record<string, number> = {
      'index.js': 12_000,
      'server.js': 10_800,
      'core.js': 10_200,
    };
    for (const [entry, budget] of Object.entries(budgets)) {
      expect(gzipSize(entry), entry).toBeLessThanOrEqual(budget);
    }
  });
});
