import { describe, it, expect } from 'vitest';
import {
  applyMask,
  calculatePenalty,
  selectBestMask,
  selectAndApplyBestMask,
  selectAndApplyBestMaskFlat,
  type MaskPattern,
} from '../core/mask';

function makeMatrix(size: number, fill: boolean): boolean[][] {
  return Array.from(
    { length: size },
    () => new Array(size).fill(fill) as boolean[],
  );
}

function makeFunctionModules(size: number): boolean[][] {
  return makeMatrix(size, false);
}

describe('applyMask', () => {
  it('all 8 masks produce valid boolean matrices', () => {
    const size = 21;
    const matrix = makeMatrix(size, false);
    const fn = makeFunctionModules(size);

    for (let p = 0; p < 8; p++) {
      const result = applyMask(matrix, fn, p as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7);
      expect(result).toHaveLength(size);
      for (const row of result) {
        expect(row).toHaveLength(size);
        for (const val of row) {
          expect(typeof val).toBe('boolean');
        }
      }
    }
  });

  it('mask 0 inverts (r+c) even modules', () => {
    const size = 4;
    const matrix = makeMatrix(size, false);
    const fn = makeFunctionModules(size);

    const result = applyMask(matrix, fn, 0);
    // (0,0): r+c=0 even -> true
    expect(result[0][0]).toBe(true);
    // (0,1): r+c=1 odd -> false
    expect(result[0][1]).toBe(false);
    // (1,1): r+c=2 even -> true
    expect(result[1][1]).toBe(true);
  });

  it('function modules are not masked', () => {
    const size = 4;
    const matrix = makeMatrix(size, false);
    const fn = makeMatrix(size, true); // all function modules

    const result = applyMask(matrix, fn, 0);
    // All function modules should remain as-is
    for (const row of result) {
      for (const val of row) {
        expect(val).toBe(false);
      }
    }
  });

  it('mask 1 inverts even rows', () => {
    const size = 4;
    const matrix = makeMatrix(size, false);
    const fn = makeFunctionModules(size);

    const result = applyMask(matrix, fn, 1);
    // Row 0 (even): should be true
    expect(result[0][0]).toBe(true);
    expect(result[0][3]).toBe(true);
    // Row 1 (odd): should be false
    expect(result[1][0]).toBe(false);
    expect(result[1][3]).toBe(false);
  });
});

describe('calculatePenalty', () => {
  it('returns non-negative integer', () => {
    const size = 21;
    const matrix = makeMatrix(size, false);
    const penalty = calculatePenalty(matrix);
    expect(penalty).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(penalty)).toBe(true);
  });

  it('all-dark matrix has high penalty', () => {
    const size = 21;
    const darkMatrix = makeMatrix(size, true);
    const lightMatrix = makeMatrix(size, false);
    const darkPenalty = calculatePenalty(darkMatrix);
    const lightPenalty = calculatePenalty(lightMatrix);
    // Both should be equal by symmetry (N4 applies to both extremes)
    expect(darkPenalty).toBe(lightPenalty);
    expect(darkPenalty).toBeGreaterThan(0);
  });
});

describe('selectBestMask', () => {
  it('returns a valid mask pattern (0-7)', () => {
    const size = 21;
    const matrix = makeMatrix(size, false);
    const fn = makeFunctionModules(size);

    const best = selectBestMask(matrix, fn);
    expect(best).toBeGreaterThanOrEqual(0);
    expect(best).toBeLessThanOrEqual(7);
  });

  it('selected mask has lowest or equal penalty among all 8', () => {
    const size = 21;
    const matrix = makeMatrix(size, false);
    const fn = makeFunctionModules(size);

    const best = selectBestMask(matrix, fn);
    const bestMasked = applyMask(matrix, fn, best);
    const bestPenalty = calculatePenalty(bestMasked);

    for (let p = 0; p < 8; p++) {
      const masked = applyMask(matrix, fn, p as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7);
      const penalty = calculatePenalty(masked);
      expect(bestPenalty).toBeLessThanOrEqual(penalty);
    }
  });
});

// mulberry32 — deterministic PRNG so failures are reproducible
function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomMatrix(size: number, rand: () => number): boolean[][] {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => rand() < 0.5),
  );
}

function randomFunctionModules(size: number, rand: () => number): boolean[][] {
  // ~20% function modules, roughly matching real QR layouts
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => rand() < 0.2),
  );
}

describe('selectAndApplyBestMaskFlat (production apply) vs reference', () => {
  // Covers the flat MASK_TABLE XOR apply loop that production actually runs
  // (via generateQRMatrix) — the bridge test below applies via the reference
  // path, so without this a bug in the flat apply would ship undetected.
  const sizes = [21, 57, 177];
  const casesPerSize = { 21: 15, 57: 10, 177: 3 } as Record<number, number>;

  for (const size of sizes) {
    it(`flat apply matches reference apply (size ${size})`, () => {
      const rand = seededRandom(size * 7919 + 3);

      for (let n = 0; n < casesPerSize[size]; n++) {
        const matrix = randomMatrix(size, rand);
        const fn = randomFunctionModules(size, rand);

        // Flatten inputs for the production path
        const base = new Uint8Array(size * size);
        const fnFlat = new Uint8Array(size * size);
        for (let r = 0; r < size; r++) {
          for (let c = 0; c < size; c++) {
            if (matrix[r][c]) base[r * size + c] = 1;
            if (fn[r][c]) fnFlat[r * size + c] = 1;
          }
        }

        const flatChoice = selectAndApplyBestMaskFlat(base, fnFlat, size);
        const referenceChoice = selectBestMask(matrix, fn);
        expect(flatChoice).toBe(referenceChoice);

        // The flat-applied buffer must equal the reference-applied matrix
        const expected = applyMask(matrix, fn, referenceChoice);
        for (let r = 0; r < size; r++) {
          for (let c = 0; c < size; c++) {
            expect(base[r * size + c] === 1).toBe(expected[r][c]);
          }
        }
      }
    });
  }
});

describe('selectAndApplyBestMask (fast path) vs reference', () => {
  // The fast path fuses mask application and penalty scoring into two passes.
  // Verify it picks the exact same mask as the reference brute-force scorer
  // and applies it correctly, across random matrices of real QR sizes.
  const sizes = [21, 57, 177]; // v1, v10, v40
  const casesPerSize = { 21: 25, 57: 20, 177: 5 } as Record<number, number>;

  for (const size of sizes) {
    it(`matches reference mask choice and application (size ${size})`, () => {
      const rand = seededRandom(size * 1000 + 7);

      for (let n = 0; n < casesPerSize[size]; n++) {
        const matrix = randomMatrix(size, rand);
        const fn = randomFunctionModules(size, rand);

        const referenceChoice = selectBestMask(matrix, fn);

        const applied = matrix.map((row) => row.slice());
        const fastChoice = selectAndApplyBestMask(applied, fn);

        expect(fastChoice).toBe(referenceChoice);

        const expected = applyMask(matrix, fn, fastChoice as MaskPattern);
        expect(applied).toEqual(expected);
      }
    });
  }
});
