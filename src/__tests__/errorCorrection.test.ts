import { describe, it, expect } from 'vitest';
import {
  computeECC,
  getDataCodewordsCapacity,
  interleaveBlocks,
} from '../core/errorCorrection';

describe('computeECC', () => {
  it('generates correct ECC for known v1-M input', () => {
    // "HELLO WORLD" in QR v1-M: data codewords before ECC
    // From ISO 18004 Annex I example (v1-M, alphanumeric)
    // Data codewords: 32 55 128 236 17 236 17 236 17 236 17 236 17 236 17 236
    const data = [
      32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17,
    ];
    const ecc = computeECC(data, 10);
    expect(ecc).toHaveLength(10);
    // ECC codewords from ISO example
    expect(ecc[0]).toBe(196);
    expect(ecc[1]).toBe(35);
    expect(ecc[2]).toBe(39);
    expect(ecc[3]).toBe(119);
    expect(ecc[4]).toBe(235);
    expect(ecc[5]).toBe(215);
    expect(ecc[6]).toBe(231);
    expect(ecc[7]).toBe(226);
    expect(ecc[8]).toBe(93);
    expect(ecc[9]).toBe(23);
  });

  it('returns correct number of ECC codewords', () => {
    for (const n of [7, 10, 13, 17, 22, 28]) {
      const ecc = computeECC([1, 2, 3, 4, 5], n);
      expect(ecc).toHaveLength(n);
    }
  });
});

describe('getDataCodewordsCapacity', () => {
  it('returns correct capacity for version 1', () => {
    expect(getDataCodewordsCapacity(1, 0)).toBe(19); // L
    expect(getDataCodewordsCapacity(1, 1)).toBe(16); // M
    expect(getDataCodewordsCapacity(1, 2)).toBe(13); // Q
    expect(getDataCodewordsCapacity(1, 3)).toBe(9); // H
  });

  it('returns correct capacity for version 2', () => {
    expect(getDataCodewordsCapacity(2, 0)).toBe(34);
    expect(getDataCodewordsCapacity(2, 1)).toBe(28);
  });

  it('returns correct capacity for version 5', () => {
    expect(getDataCodewordsCapacity(5, 0)).toBe(108);
    expect(getDataCodewordsCapacity(5, 1)).toBe(86);
    expect(getDataCodewordsCapacity(5, 2)).toBe(62);
    expect(getDataCodewordsCapacity(5, 3)).toBe(46);
  });
});

describe('interleaveBlocks', () => {
  it('produces correct total length for v1-M', () => {
    const capacity = getDataCodewordsCapacity(1, 1); // 16 data CW
    const data = new Array(capacity).fill(0);
    const result = interleaveBlocks(data, 1, 1);
    // 16 data + 10 ECC = 26 total codewords
    expect(result).toHaveLength(26);
  });

  it('produces correct total length for v5-H', () => {
    const capacity = getDataCodewordsCapacity(5, 3); // 46 data CW
    const data = new Array(capacity).fill(0);
    const result = interleaveBlocks(data, 5, 3);
    // 4 blocks, 22 ECC each, 46 data = 46 + 4*22 = 134
    expect(result).toHaveLength(134);
  });
});
