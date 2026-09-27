import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

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

describe.skipIf(!built)('published bundles', () => {
  it('the root entry is a client boundary and the server entry is not', () => {
    expect(readFileSync(resolve(dist, 'index.js'), 'utf8')).toMatch(
      /^"use client";/,
    );
    expect(readFileSync(resolve(dist, 'index.cjs'), 'utf8')).toMatch(
      /^"use client";/,
    );
    expect(readFileSync(resolve(dist, 'server.js'), 'utf8')).not.toMatch(
      /use client/,
    );
    expect(readFileSync(resolve(dist, 'server.cjs'), 'utf8')).not.toMatch(
      /use client/,
    );
  });

  it('no bundle imports react-dom/server', () => {
    for (const file of ['index.js', 'index.cjs', 'server.js', 'server.cjs']) {
      expect(readFileSync(resolve(dist, file), 'utf8')).not.toMatch(
        /react-dom\/server/,
      );
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

  it('exports the documented surface from both entries and both formats', () => {
    const expected = ['QRCode', 'toDataURL', 'toSVGString'];
    expect(
      node(
        `import('./dist/index.js').then(m => console.log(Object.keys(m).sort().join(',')));`,
      ),
    ).toBe(expected.join(','));
    expect(
      node(
        `console.log(Object.keys(require('./dist/index.cjs')).sort().join(','));`,
      ),
    ).toBe(expected.join(','));
    for (const entry of ['./dist/server.js', './dist/server.cjs']) {
      const code = entry.endsWith('.cjs')
        ? `console.log(Object.keys(require('${entry}')).sort().join(','));`
        : `import('${entry}').then(m => console.log(Object.keys(m).sort().join(',')));`;
      expect(node(code)).toBe('toDataURL,toSVGString');
    }
  });

  // They were 82% of the tarball, with the TypeScript source inlined.
  it('ships no sourcemaps', () => {
    for (const file of ['index.js', 'index.cjs', 'server.js', 'server.cjs']) {
      expect(existsSync(resolve(dist, `${file}.map`))).toBe(false);
    }
  });
});
