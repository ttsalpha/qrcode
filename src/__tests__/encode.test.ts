import { describe, it, expect } from 'vitest';
import { encodeQR } from '../core/encode';
import { generateQRMatrix } from '../core/matrix';

describe('encodeQR', () => {
  it('encodes v1-M correctly', () => {
    const result = encodeQR('HELLO WORLD', 'M');
    expect(result.version).toBe(1);
    expect(result.ecLevelIndex).toBe(1); // M
    expect(result.mode).toBe('alphanumeric');
  });

  it('uses numeric mode for digit-only strings', () => {
    const result = encodeQR('01234567', 'M');
    expect(result.mode).toBe('numeric');
  });

  it('uses byte mode for strings with non-alphanumeric chars', () => {
    const result = encodeQR('hello world', 'M');
    expect(result.mode).toBe('byte');
  });

  it('auto-selects correct version for different data lengths', () => {
    const short = encodeQR('A', 'M');
    expect(short.version).toBe(1);

    const medium = encodeQR('A'.repeat(50), 'M');
    expect(medium.version).toBeGreaterThan(1);
  });

  it('respects requested version', () => {
    const result = encodeQR('A', 'M', 3);
    expect(result.version).toBe(3);
  });

  it('produces codewords with correct length for v1-L', () => {
    const result = encodeQR('HELLO WORLD', 'L');
    // v1-L: 19 data + 7 ECC = 26 total
    expect(result.codewords).toHaveLength(26);
  });
});

describe('generateQRMatrix', () => {
  it('produces correct size matrix for v1', () => {
    const { matrix, size } = generateQRMatrix('HELLO WORLD', 'M');
    expect(size).toBe(21);
    expect(matrix).toHaveLength(21);
    expect(matrix[0]).toHaveLength(21);
  });

  it('produces correct size for v2', () => {
    // V1-M can hold up to 16 data codewords (alphanumeric ~25 chars)
    // Use enough data to require v2 (v1-M fits ~25 alphanumeric chars)
    // V2-M: 28 data codewords = enough for 40+ alphanumeric chars
    const { size } = generateQRMatrix('A'.repeat(30), 'M');
    expect(size).toBe(25);
  });

  it('produces correct size formula (4*version + 17)', () => {
    for (let v = 1; v <= 5; v++) {
      const { size } = generateQRMatrix('A'.repeat(5), 'M', v);
      expect(size).toBe(4 * v + 17);
    }
  });

  it('finder pattern top-left corner is dark', () => {
    const { matrix } = generateQRMatrix('HELLO WORLD', 'M');
    // Top-left finder: modules [0][0], [0][6], [6][0], [6][6] are dark
    expect(matrix[0][0]).toBe(true);
    expect(matrix[0][6]).toBe(true);
    expect(matrix[6][0]).toBe(true);
    expect(matrix[6][6]).toBe(true);
  });

  it('returns boolean matrix', () => {
    const { matrix, size } = generateQRMatrix('TEST', 'M');
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        expect(typeof matrix[r][c]).toBe('boolean');
      }
    }
  });
});
