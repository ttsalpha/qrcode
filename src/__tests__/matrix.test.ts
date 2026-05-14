import { describe, it, expect } from 'vitest';
import { generateQRMatrix } from '../core/matrix';

describe('generateQRMatrix - finder patterns', () => {
  it('top-left finder has correct pattern', () => {
    const { matrix } = generateQRMatrix('TEST', 'M');
    // Outer ring of top-left 7x7 should be dark
    for (let i = 0; i < 7; i++) {
      expect(matrix[0][i]).toBe(true); // top row
      expect(matrix[6][i]).toBe(true); // bottom row
      expect(matrix[i][0]).toBe(true); // left col
      expect(matrix[i][6]).toBe(true); // right col
    }
    // Inner white ring
    for (let i = 1; i <= 5; i++) {
      expect(matrix[1][i]).toBe(false);
      expect(matrix[5][i]).toBe(false);
      expect(matrix[i][1]).toBe(false);
      expect(matrix[i][5]).toBe(false);
    }
    // Inner 3x3 dark
    for (let r = 2; r <= 4; r++) {
      for (let c = 2; c <= 4; c++) {
        expect(matrix[r][c]).toBe(true);
      }
    }
  });

  it('separator between top-left finder and rest is white', () => {
    const { matrix } = generateQRMatrix('TEST', 'M');
    // Column 7 rows 0-7 should be white
    for (let r = 0; r <= 7; r++) {
      expect(matrix[r][7]).toBe(false);
    }
    // Row 7 cols 0-7 should be white
    for (let c = 0; c <= 7; c++) {
      expect(matrix[7][c]).toBe(false);
    }
  });

  it('timing pattern is alternating starting with dark', () => {
    const { matrix } = generateQRMatrix('TEST', 'M');
    // Horizontal timing: row 6, cols 8..12 (first few)
    expect(matrix[6][8]).toBe(true); // even = dark
    expect(matrix[6][9]).toBe(false); // odd = light
    expect(matrix[6][10]).toBe(true);
    expect(matrix[6][11]).toBe(false);
    expect(matrix[6][12]).toBe(true);
  });

  it('dark module is placed at (4v+9, 8)', () => {
    for (const v of [1, 2, 3, 4, 5]) {
      const { matrix } = generateQRMatrix('A', 'M', v);
      const darkRow = 4 * v + 9;
      expect(matrix[darkRow][8]).toBe(true);
    }
  });
});

describe('generateQRMatrix - alignment patterns', () => {
  it('v1 has no alignment patterns (only finder + timing)', () => {
    // V1 has no alignment patterns, this is just a structural check
    const { matrix, size } = generateQRMatrix('TEST', 'M', 1);
    expect(size).toBe(21);
    // Check that modules at would-be alignment positions are not all true
    // In v1, pos 18 doesn't exist, so just verify size
    expect(matrix).toHaveLength(21);
  });

  it('v2 has alignment pattern at (18, 18)', () => {
    const { matrix } = generateQRMatrix('A'.repeat(10), 'M', 2);
    // Center of alignment pattern at (18, 18)
    expect(matrix[18][18]).toBe(true); // center
    // Outer ring
    expect(matrix[16][16]).toBe(true);
    expect(matrix[16][20]).toBe(true);
    expect(matrix[20][16]).toBe(true);
    expect(matrix[20][20]).toBe(true);
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
