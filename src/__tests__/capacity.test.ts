import { describe, it, expect } from 'vitest';
import jsQR from 'jsqr';
import { encodeQR } from '../core/encode';
import { computeQRMatrix } from '../core/matrix';
import type { ErrorCorrectionLevel } from '../types';

// The boundary tests in encode.test.ts were captured from the encoder itself,
// so an off-by-one in the capacity arithmetic would be frozen rather than
// caught. These two checks are independent of it: published capacities on one
// side, an outside decoder on the other.

const ECLS: ErrorCorrectionLevel[] = ['L', 'M', 'Q', 'H'];
const MODES = ['numeric', 'alphanumeric', 'byte'] as const;
const GENERATE = [
  (n: number) => '1'.repeat(n),
  (n: number) => 'A'.repeat(n),
  (n: number) => 'a'.repeat(n),
];

const fits = (data: string, ecl: ErrorCorrectionLevel, version: number) => {
  try {
    encodeQR(data, ecl, version);
    return true;
  } catch {
    return false;
  }
};

// ISO/IEC 18004:2015 Table 7. Only rows transcribed with confidence are here,
// including v1 and v40, which bracket the narrowest and widest
// character-count indicators. Columns are [numeric, alphanumeric, byte].
// prettier-ignore
const TABLE7_ANCHORS: Record<number, Record<ErrorCorrectionLevel, [number, number, number]>> = {
  1:  { L: [41, 25, 17],       M: [34, 20, 14],       Q: [27, 16, 11],      H: [17, 10, 7] },
  2:  { L: [77, 47, 32],       M: [63, 38, 26],       Q: [48, 29, 20],      H: [34, 20, 14] },
  3:  { L: [127, 77, 53],      M: [101, 61, 42],      Q: [77, 47, 32],      H: [58, 35, 24] },
  4:  { L: [187, 114, 78],     M: [149, 90, 62],      Q: [111, 67, 46],     H: [82, 50, 34] },
  7:  { L: [370, 224, 154],    M: [293, 178, 122],    Q: [207, 125, 86],    H: [154, 93, 64] },
  10: { L: [652, 395, 271],    M: [513, 311, 213],    Q: [364, 221, 151],   H: [288, 174, 119] },
  40: { L: [7089, 4296, 2953], M: [5596, 3391, 2331], Q: [3993, 2420, 1663], H: [3057, 1852, 1273] },
};

describe('character capacity (ISO 18004 Table 7)', () => {
  for (const [v, byEcl] of Object.entries(TABLE7_ANCHORS)) {
    const version = Number(v);
    for (const ecl of ECLS) {
      for (let m = 0; m < MODES.length; m++) {
        const capacity = byEcl[ecl][m];
        it(`v${version} ${ecl} ${MODES[m]} holds exactly ${capacity}`, () => {
          expect(fits(GENERATE[m](capacity), ecl, version)).toBe(true);
          expect(fits(GENERATE[m](capacity + 1), ecl, version)).toBe(false);
        });
      }
    }
  }
});

// jsQR as an outside oracle: a payload sized to the encoder's own declared
// maximum must still come back byte for byte. An over-generous capacity check
// shows up here as a corrupt or failed decode rather than as a silent
// difference of opinion about the table.
const SCALE = 3;
const QUIET = 4;

function rasterize(matrix: Uint8Array, size: number) {
  const side = (size + QUIET * 2) * SCALE;
  const rgba = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (matrix[row * size + col] !== 1) continue;
      for (let y = 0; y < SCALE; y++) {
        for (let x = 0; x < SCALE; x++) {
          const py = (row + QUIET) * SCALE + y;
          const px = (col + QUIET) * SCALE + x;
          const i = (py * side + px) * 4;
          rgba[i] = 0;
          rgba[i + 1] = 0;
          rgba[i + 2] = 0;
        }
      }
    }
  }
  return { rgba, side };
}

// Largest payload the encoder accepts at this version, by binary search.
function maxChars(
  version: number,
  ecl: ErrorCorrectionLevel,
  generate: (n: number) => string,
): number {
  let lo = 1;
  let hi = 7100;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (fits(generate(mid), ecl, version)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

describe('a payload at the declared maximum still decodes', () => {
  // Every version group boundary plus a spread in between.
  const VERSIONS = [1, 2, 6, 7, 9, 10, 11, 20, 26, 27, 28, 39, 40];
  for (const version of VERSIONS) {
    for (const ecl of ECLS) {
      for (let m = 0; m < MODES.length; m++) {
        it(`v${version} ${ecl} ${MODES[m]}`, () => {
          const n = maxChars(version, ecl, GENERATE[m]);
          const payload = GENERATE[m](n);
          const { matrix, size } = computeQRMatrix(payload, ecl, version);
          const { rgba, side } = rasterize(matrix, size);
          expect(jsQR(rgba, side, side)?.data).toBe(payload);
        });
      }
    }
  }
});
