import { describe, it, expect } from 'vitest';
import { generateQRMatrix } from '../core/matrix';

// The matrix is a flat, row-major Uint8Array (1 = dark). Small accessor keeps
// the structural assertions readable.
const at = (m: Uint8Array, size: number, r: number, c: number): boolean =>
  m[r * size + c] === 1;

describe('generateQRMatrix - finder patterns', () => {
  it('top-left finder has correct pattern', () => {
    const { matrix, size } = generateQRMatrix('TEST', 'M');
    // Outer ring of top-left 7x7 should be dark
    for (let i = 0; i < 7; i++) {
      expect(at(matrix, size, 0, i)).toBe(true); // top row
      expect(at(matrix, size, 6, i)).toBe(true); // bottom row
      expect(at(matrix, size, i, 0)).toBe(true); // left col
      expect(at(matrix, size, i, 6)).toBe(true); // right col
    }
    // Inner white ring
    for (let i = 1; i <= 5; i++) {
      expect(at(matrix, size, 1, i)).toBe(false);
      expect(at(matrix, size, 5, i)).toBe(false);
      expect(at(matrix, size, i, 1)).toBe(false);
      expect(at(matrix, size, i, 5)).toBe(false);
    }
    // Inner 3x3 dark
    for (let r = 2; r <= 4; r++) {
      for (let c = 2; c <= 4; c++) {
        expect(at(matrix, size, r, c)).toBe(true);
      }
    }
  });

  it('separator between top-left finder and rest is white', () => {
    const { matrix, size } = generateQRMatrix('TEST', 'M');
    // Column 7 rows 0-7 should be white
    for (let r = 0; r <= 7; r++) {
      expect(at(matrix, size, r, 7)).toBe(false);
    }
    // Row 7 cols 0-7 should be white
    for (let c = 0; c <= 7; c++) {
      expect(at(matrix, size, 7, c)).toBe(false);
    }
  });

  it('timing pattern is alternating starting with dark', () => {
    const { matrix, size } = generateQRMatrix('TEST', 'M');
    // Horizontal timing: row 6, cols 8..12 (first few)
    expect(at(matrix, size, 6, 8)).toBe(true); // even = dark
    expect(at(matrix, size, 6, 9)).toBe(false); // odd = light
    expect(at(matrix, size, 6, 10)).toBe(true);
    expect(at(matrix, size, 6, 11)).toBe(false);
    expect(at(matrix, size, 6, 12)).toBe(true);
  });

  it('dark module is placed at (4v+9, 8)', () => {
    for (const v of [1, 2, 3, 4, 5]) {
      const { matrix, size } = generateQRMatrix('A', 'M', v);
      const darkRow = 4 * v + 9;
      expect(at(matrix, size, darkRow, 8)).toBe(true);
    }
  });
});

describe('generateQRMatrix - alignment patterns', () => {
  it('v1 has no alignment patterns (only finder + timing)', () => {
    // V1 has no alignment patterns, this is just a structural check
    const { matrix, size } = generateQRMatrix('TEST', 'M', 1);
    expect(size).toBe(21);
    // Flat grid has size*size cells
    expect(matrix).toHaveLength(size * size);
  });

  it('v2 has alignment pattern at (18, 18)', () => {
    const { matrix, size } = generateQRMatrix('A'.repeat(10), 'M', 2);
    // Center of alignment pattern at (18, 18)
    expect(at(matrix, size, 18, 18)).toBe(true); // center
    // Outer ring
    expect(at(matrix, size, 16, 16)).toBe(true);
    expect(at(matrix, size, 16, 20)).toBe(true);
    expect(at(matrix, size, 20, 16)).toBe(true);
    expect(at(matrix, size, 20, 20)).toBe(true);
  });
});

describe('generateQRMatrix - dimensions', () => {
  it('versions 1-10 have correct sizes', () => {
    const testData = 'ABCD';
    for (let v = 1; v <= 10; v++) {
      const { size } = generateQRMatrix(testData, 'L', v);
      expect(size).toBe(4 * v + 17);
    }
  });
});

describe('generateQRMatrix - cache', () => {
  it('returns the same reference on repeated identical calls', () => {
    const a = generateQRMatrix('CACHE-HIT-TEST', 'M');
    const b = generateQRMatrix('CACHE-HIT-TEST', 'M');
    expect(b).toBe(a);
  });

  it('distinguishes ecLevel and requestedVersion in the key', () => {
    const base = generateQRMatrix('CACHE-KEY-TEST', 'M');
    const otherEC = generateQRMatrix('CACHE-KEY-TEST', 'H');
    const forcedVersion = generateQRMatrix('CACHE-KEY-TEST', 'M', 5);
    expect(otherEC).not.toBe(base);
    expect(forcedVersion).not.toBe(base);
    expect(forcedVersion.version).toBe(5);
  });

  it('evicts least recently used entries beyond capacity', () => {
    const first = generateQRMatrix('CACHE-EVICT-0', 'M');
    // Push more than 16 distinct entries to force eviction of the first
    for (let i = 1; i <= 20; i++) {
      generateQRMatrix(`CACHE-EVICT-${i}`, 'M');
    }
    const recomputed = generateQRMatrix('CACHE-EVICT-0', 'M');
    expect(recomputed).not.toBe(first);
    // Content is still identical
    expect(recomputed.matrix).toEqual(first.matrix);
  });
});
