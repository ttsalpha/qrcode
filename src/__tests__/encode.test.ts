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

  it('throws on empty string', () => {
    expect(() => encodeQR('', 'M')).toThrow(RangeError);
  });

  it('throws when requestedVersion is out of range', () => {
    expect(() => encodeQR('A', 'M', 0)).toThrow(RangeError);
    expect(() => encodeQR('A', 'M', 41)).toThrow(RangeError);
  });

  it('throws when data is too large for requestedVersion', () => {
    // v1-M holds at most 16 data codewords; a very long string won't fit
    expect(() => encodeQR('A'.repeat(200), 'M', 1)).toThrow(RangeError);
  });

  it('throws when data exceeds v40 capacity', () => {
    expect(() => encodeQR('A'.repeat(10000), 'H')).toThrow(RangeError);
  });

  // Expected versions captured from the brute-force selection loop before it
  // was replaced with arithmetic bit counting — pins identical behavior at
  // capacity edges and version-group boundaries (char count width changes).
  it('auto-selects versions at capacity boundaries (alphanumeric)', () => {
    expect(encodeQR('A'.repeat(20), 'M').version).toBe(1);
    expect(encodeQR('A'.repeat(21), 'M').version).toBe(2);
    expect(encodeQR('A'.repeat(46), 'L').version).toBe(2);
    expect(encodeQR('A'.repeat(47), 'L').version).toBe(3);
    expect(encodeQR('A'.repeat(20), 'H').version).toBe(2);
    expect(encodeQR('A'.repeat(21), 'H').version).toBe(3);
  });

  it('auto-selects versions at capacity boundaries (numeric)', () => {
    expect(encodeQR('1'.repeat(33), 'M').version).toBe(1);
    expect(encodeQR('1'.repeat(34), 'M').version).toBe(2);
    expect(encodeQR('1'.repeat(33), 'H').version).toBe(2);
    expect(encodeQR('1'.repeat(34), 'H').version).toBe(3);
  });

  it('auto-selects versions at capacity boundaries (byte)', () => {
    expect(encodeQR('a'.repeat(14), 'M').version).toBe(1);
    expect(encodeQR('a'.repeat(15), 'M').version).toBe(2);
    expect(encodeQR('a'.repeat(26), 'H').version).toBe(4);
    expect(encodeQR('a'.repeat(27), 'H').version).toBe(4);
  });

  it('auto-selects versions across the v9/v10 group boundary', () => {
    // Character count indicator widens at v10 — boundary must stay exact
    expect(encodeQR('A'.repeat(177), 'M').version).toBe(7);
    expect(encodeQR('A'.repeat(178), 'M').version).toBe(8);
    expect(encodeQR('A'.repeat(174), 'H').version).toBe(10);
    expect(encodeQR('A'.repeat(175), 'H').version).toBe(11);
  });

  it('auto-selects versions for large payloads', () => {
    expect(encodeQR('A'.repeat(300), 'M').version).toBe(10);
    expect(encodeQR('A'.repeat(1000), 'M').version).toBe(21);
    expect(encodeQR('1'.repeat(2000), 'M').version).toBe(23);
    expect(encodeQR('a'.repeat(500), 'M').version).toBe(17);
  });

  it('uses UTF-8 byte length (not string length) for byte mode capacity', () => {
    // The euro sign is 3 UTF-8 bytes; 5 chars → 15 bytes > v1-M's 14-byte limit
    const result = encodeQR('€'.repeat(5), 'M');
    expect(result.mode).toBe('byte');
    expect(result.version).toBe(2);
  });

  it('rejects non-integer requested versions with RangeError', () => {
    expect(() => encodeQR('HI', 'M', NaN)).toThrow(RangeError);
    expect(() => encodeQR('HI', 'M', 5.5)).toThrow(RangeError);
  });
});

describe('generateQRMatrix', () => {
  it('produces correct size matrix for v1', () => {
    const { matrix, size } = generateQRMatrix('HELLO WORLD', 'M');
    expect(size).toBe(21);
    // Flat, row-major grid of size*size cells
    expect(matrix).toHaveLength(21 * 21);
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
    const { matrix, size } = generateQRMatrix('HELLO WORLD', 'M');
    // Top-left finder: modules (0,0), (0,6), (6,0), (6,6) are dark
    expect(matrix[0 * size + 0]).toBe(1);
    expect(matrix[0 * size + 6]).toBe(1);
    expect(matrix[6 * size + 0]).toBe(1);
    expect(matrix[6 * size + 6]).toBe(1);
  });

  it('returns a flat 0/1 grid', () => {
    const { matrix, size } = generateQRMatrix('TEST', 'M');
    expect(matrix).toBeInstanceOf(Uint8Array);
    expect(matrix).toHaveLength(size * size);
    for (let i = 0; i < matrix.length; i++) {
      expect(matrix[i] === 0 || matrix[i] === 1).toBe(true);
    }
  });
});
