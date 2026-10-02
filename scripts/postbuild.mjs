import { readFileSync, writeFileSync } from 'node:fs';

// Only the root entry is a client boundary; see tsup.config.ts for why no other
// file may carry the directive.
const DIRECTIVE = '"use client";\n';

for (const file of ['dist/index.js', 'dist/index.cjs']) {
  const source = readFileSync(file, 'utf8');
  if (!source.startsWith(DIRECTIVE)) writeFileSync(file, DIRECTIVE + source);
}
