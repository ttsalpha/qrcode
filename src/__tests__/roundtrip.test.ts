import { describe, it, expect } from 'vitest';
import jsQR from 'jsqr';
import { computeQRMatrix } from '../core/matrix';
import { encodeQR } from '../core/encode';
import type { ErrorCorrectionLevel } from '../types';

// End-to-end proof that generated symbols actually decode. The golden snapshots
// pin output bytes and mask.test.ts pins the fast scorer against the reference
// scorer, but a symbol can satisfy both and still be unreadable: a misplaced
// function pattern or a wrong capacity produces output that is stable and
// self-consistent, just not a valid QR code.
//
// jsQR is an independent decoder (pure JS, no browser) used purely as an oracle;
// the alternative would be @zxing/library.
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

// Spread across the three character-count-indicator groups (1-9, 10-26, 27-40)
// and over the versions with irregular structure: v32's alignment step is the
// documented exception to even spacing, and v30-40 split the data into the most
// EC blocks.
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

  // Mixed payloads are the ones the segmentation search actually splits, so
  // these are the cases where a wrong mode indicator, character count or
  // segment boundary would surface.
  const MIXED: Array<[string, string]> = [
    [
      'EMVCo / VietQR',
      '00020101021238570010A00000072701270006970436011312345678901230208QRIBFTTA53037045802VN62150811Thanh toan6304A1B2',
    ],
    [
      'uppercase URL with digits',
      'HTTPS://SHOP.EXAMPLE.COM/ORDER/1234567890123456789012345',
    ],
    ['wifi', 'WIFI:S:MyNetwork5G;T:WPA;P:s3cr3tPassw0rd2024;;'],
    ['digit run inside alphanumeric', 'ABC' + '9'.repeat(120)],
    [
      'multi-byte and digits',
      'Xin chào 0123456789012345678901234567890 thế giới',
    ],
    ['astral characters', 'abc😀def😀' + '1'.repeat(60)],
    ['alternating', 'A1B22C333D4444E55555F666666G7777777H88888888'],
  ];

  for (const [label, value] of MIXED) {
    for (const ecl of ECLS) {
      it(`mixed: ${label} (${ecl})`, () => {
        const { matrix, size } = computeQRMatrix(value, ecl);
        const { rgba, side } = rasterize(matrix, size);
        expect(jsQR(rgba, side, side)?.data).toBe(value);
      });
    }
  }
});
