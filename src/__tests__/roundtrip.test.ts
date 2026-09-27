import { describe, it, expect } from 'vitest';
import jsQR from 'jsqr';
import { computeQRMatrix } from '../core/matrix';
import { encodeQR } from '../core/encode';
import type { ErrorCorrectionLevel } from '../types';

// End-to-end proof that generated symbols actually decode. The golden snapshots
// pin the output bytes and mask.test.ts pins the fast scorer against the
// reference scorer, but a systematically malformed symbol satisfies both: that
// is how the v31/v32 alignment bug and the v30-40 ECL M capacity bug shipped.
// jsQR is an independent decoder (pure JS, no browser) used here purely as an
// oracle; the alternative would be @zxing/library.
const SCALE = 4;
const QUIET = 4;

function rasterize(matrix: Uint8Array, size: number) {
  const side = (size + QUIET * 2) * SCALE;
  const rgba = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (matrix[row * size + col] !== 1) continue;
      const x0 = (col + QUIET) * SCALE;
      const y0 = (row + QUIET) * SCALE;
      for (let y = y0; y < y0 + SCALE; y++) {
        for (let x = x0; x < x0 + SCALE; x++) {
          const i = (y * side + x) * 4;
          rgba[i] = 0;
          rgba[i + 1] = 0;
          rgba[i + 2] = 0;
        }
      }
    }
  }
  return { rgba, side };
}

// One payload per mode, truncated to an exact character count. Encoded size is
// monotonic in the count, so the largest fitting count can be found by search.
const MODES = {
  numeric: (n: number) => '8675309'.repeat(n).slice(0, n),
  alphanumeric: (n: number) =>
    'QR-CODE TEST 0123 $%*+-./:'.repeat(n).slice(0, n),
  byte: (n: number) => 'Xin chào, mã QR 123 ø∆'.repeat(n).slice(0, n),
} as const;

// Largest payload that still fits the forced version, so the symbol is filled
// rather than mostly padding. Binary search over encodeQR, which is cheap;
// growing one character at a time would call it thousands of times.
function fillVersion(
  build: (n: number) => string,
  ecl: ErrorCorrectionLevel,
  version: number,
): string {
  let lo = 1;
  let hi = 8000;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    try {
      encodeQR(build(mid), ecl, version);
      lo = mid;
    } catch {
      hi = mid - 1;
    }
  }
  return build(lo);
}

const ECLS: ErrorCorrectionLevel[] = ['L', 'M', 'Q', 'H'];

// Spread across the three character-count-indicator groups (1-9, 10-26, 27-40),
// over the alignment-pattern edge versions fixed in b8c168b, and over the high
// versions where the ECL M capacity rows were wrong.
const VERSIONS = [1, 2, 7, 10, 26, 27, 30, 31, 32, 40];

describe('round-trip: generated matrices decode', () => {
  for (const [mode, build] of Object.entries(MODES)) {
    for (const version of VERSIONS) {
      for (const ecl of ECLS) {
        it(`v${version} ${ecl} ${mode}`, { timeout: 30000 }, () => {
          const value = fillVersion(build, ecl, version);
          expect(value.length).toBeGreaterThan(0);

          const result = computeQRMatrix(value, ecl, version);
          expect(result.version).toBe(version);

          const { rgba, side } = rasterize(result.matrix, result.size);
          expect(jsQR(rgba, side, side)?.data).toBe(value);
        });
      }
    }
  }

  it('decodes an auto-selected version', () => {
    const value = 'https://qrcode.ttsalpha.com/?x=1&y=2';
    const { matrix, size } = computeQRMatrix(value, 'M');
    const { rgba, side } = rasterize(matrix, size);
    expect(jsQR(rgba, side, side)?.data).toBe(value);
  });
});
