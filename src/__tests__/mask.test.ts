import { describe, it, expect } from 'vitest';
import { applyMask, calculatePenalty, selectBestMask } from '../core/mask';

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
