import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { dirname, relative, resolve } from 'path';

// src/core is what every adapter builds on, and it runs on a server, in a
// worker and in React Native. It must not reach for React or the DOM, nor for
// the adapter layers that sit above it. tsconfig.core.json catches DOM globals
// at typecheck; this catches imports.

const core = resolve(process.cwd(), 'src/core');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = resolve(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

const IMPORT = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

describe('src/core', () => {
  const files = sources(core);

  it('finds the core sources', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('imports nothing outside itself except relative core modules', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const match of readFileSync(file, 'utf8').matchAll(IMPORT)) {
        const spec = match[1]!;
        const where = `${relative(core, file)} imports "${spec}"`;
        if (!spec.startsWith('.')) {
          offenders.push(where);
        } else if (
          relative(core, resolve(dirname(file), spec)).startsWith('..')
        ) {
          offenders.push(where);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('does not touch window or document', () => {
    const offenders = files.filter((file) =>
      /\b(?:window|document)\./.test(
        readFileSync(file, 'utf8').replace(/\/\/.*$/gm, ''),
      ),
    );
    expect(offenders.map((f) => relative(core, f))).toEqual([]);
  });
});
