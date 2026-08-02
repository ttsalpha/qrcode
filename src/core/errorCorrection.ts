// Reed-Solomon error correction for QR codes
// GF(256) with primitive polynomial 0x11d (x^8 + x^4 + x^3 + x^2 + 1)

// Build GF(256) antilog table, doubled so gfMul can skip the mod-255 wrap
function buildExpTable(): Uint8Array {
  const exp = new Uint8Array(512);
  let x = 1;
  for (let i = 0; i < 256; i++) {
    exp[i] = x;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  for (let i = 256; i < 512; i++) {
    exp[i] = exp[i - 255];
  }
  return exp;
}

function buildLogTable(exp: Uint8Array): Uint8Array {
  const log = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    log[exp[i]] = i;
  }
  return log;
}

const EXP_TABLE = /* @__PURE__ */ buildExpTable();
const LOG_TABLE = /* @__PURE__ */ buildLogTable(EXP_TABLE);

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  // Log values reach 255 (α^255 = 1 overwrites LOG_TABLE[1] during the table
  // build), so the sum can reach 510 — EXP_TABLE must stay ≥ 511 entries.
  return EXP_TABLE[LOG_TABLE[a] + LOG_TABLE[b]];
}

function gfPow(base: number, exp: number): number {
  return EXP_TABLE[(LOG_TABLE[base] * exp) % 255];
}

// Generate RS generator polynomial for `nECC` error correction codewords
function generatePolynomial(nECC: number): Uint8Array {
  let poly = [1];
  for (let i = 0; i < nECC; i++) {
    const term = [1, gfPow(2, i)];
    const newPoly = new Array(poly.length + term.length - 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      for (let k = 0; k < term.length; k++) {
        newPoly[j + k] ^= gfMul(poly[j], term[k]);
      }
    }
    poly = newPoly;
  }
  return Uint8Array.from(poly);
}

const polynomialCache = new Map<number, Uint8Array>();

function getCachedPolynomial(nECC: number): Uint8Array {
  let poly = polynomialCache.get(nECC);
  if (!poly) {
    poly = generatePolynomial(nECC);
    polynomialCache.set(nECC, poly);
  }
  return poly;
}

// Compute `nECC` Reed-Solomon error correction codewords for `data`.
// Every RS generator coefficient is non-zero (a product of (x − α^i) terms in
// GF(256)), so the inner loop needs no zero-coefficient guard.
export function computeECC(data: ArrayLike<number>, nECC: number): Uint8Array {
  const generator = getCachedPolynomial(nECC);
  const genLen = generator.length;
  const dataLen = data.length;
  // Initialize remainder as data codewords followed by nECC zeros
  const remainder = new Uint8Array(dataLen + nECC);
  remainder.set(data);

  for (let i = 0; i < dataLen; i++) {
    const coeff = remainder[i];
    if (coeff !== 0) {
      const logCoeff = LOG_TABLE[coeff];
      for (let j = 0; j < genLen; j++) {
        remainder[i + j] ^= EXP_TABLE[LOG_TABLE[generator[j]] + logCoeff];
      }
    }
  }

  return remainder.slice(dataLen);
}

// EC block layout per ISO/IEC 18004:2015 Table 9, stored compactly.
// Index = (version - 1) * 4 + ecLevel, where ecLevel 0=L, 1=M, 2=Q, 3=H.
//   EC_PER_BLOCK[i]  — error-correction codewords per block
//   NUM_BLOCKS[i]    — number of Reed-Solomon blocks
//   TOTAL_DATA_CW[i] — total data codewords (the capacity)
// QR uses at most two block sizes per symbol, derivable at runtime: with
// n = NUM_BLOCKS and D = TOTAL_DATA_CW, the first (n - (D mod n)) blocks hold
// floor(D / n) data codewords and the remaining blocks hold one more. This
// reproduces every row of the original 160-entry table exactly (verified
// against Table 9, including interleave order).

// prettier-ignore
const EC_PER_BLOCK: readonly number[] = [7, 10, 13, 17, 10, 16, 22, 28, 15, 26, 18, 22, 20, 18, 26, 16, 26, 24, 18, 22, 18, 16, 24, 28, 20, 18, 18, 26, 24, 22, 22, 26, 30, 22, 20, 24, 18, 26, 24, 28, 20, 30, 28, 24, 24, 22, 26, 28, 26, 22, 24, 22, 30, 24, 20, 24, 22, 24, 30, 24, 24, 28, 24, 30, 28, 28, 28, 28, 30, 26, 28, 28, 28, 26, 26, 26, 28, 26, 30, 28, 28, 26, 28, 30, 28, 28, 30, 24, 30, 28, 30, 30, 30, 28, 30, 30, 26, 28, 30, 30, 28, 28, 28, 30, 30, 28, 30, 30, 30, 28, 30, 30, 30, 28, 30, 30, 30, 28, 30, 30, 30, 28, 30, 30, 30, 28, 30, 30, 30, 28, 30, 30, 30, 28, 30, 30, 30, 28, 30, 30, 30, 28, 30, 30, 30, 28, 30, 30, 30, 28, 30, 30, 30, 28, 30, 30, 30, 28, 30, 30];
// prettier-ignore
const NUM_BLOCKS: readonly number[] = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 1, 2, 2, 4, 1, 2, 4, 4, 2, 4, 4, 4, 2, 4, 6, 5, 2, 4, 6, 6, 2, 5, 8, 8, 4, 5, 8, 8, 4, 5, 8, 11, 4, 8, 10, 11, 4, 9, 12, 16, 4, 9, 16, 16, 6, 10, 12, 18, 6, 10, 17, 16, 6, 11, 16, 19, 6, 13, 18, 21, 7, 14, 21, 25, 8, 16, 20, 25, 8, 17, 23, 25, 9, 17, 23, 34, 9, 18, 25, 30, 10, 20, 27, 32, 12, 21, 29, 35, 12, 23, 34, 37, 12, 25, 34, 40, 13, 26, 35, 42, 14, 28, 38, 45, 15, 29, 40, 48, 16, 31, 43, 51, 17, 33, 45, 54, 18, 35, 48, 57, 19, 37, 51, 60, 19, 38, 53, 63, 20, 40, 56, 66, 21, 43, 59, 70, 22, 45, 62, 74, 24, 47, 65, 77, 25, 49, 68, 81];
// prettier-ignore
const TOTAL_DATA_CW: readonly number[] = [19, 16, 13, 9, 34, 28, 22, 16, 55, 44, 34, 26, 80, 64, 48, 36, 108, 86, 62, 46, 136, 108, 76, 60, 156, 124, 88, 66, 194, 154, 110, 86, 232, 182, 132, 100, 274, 216, 154, 122, 324, 254, 180, 140, 370, 290, 206, 158, 428, 334, 244, 180, 461, 365, 261, 197, 523, 415, 295, 223, 589, 453, 325, 253, 647, 507, 367, 283, 721, 563, 397, 313, 795, 627, 445, 341, 861, 669, 485, 385, 932, 714, 512, 406, 1006, 782, 568, 442, 1094, 860, 614, 464, 1174, 914, 664, 514, 1276, 1000, 718, 538, 1370, 1062, 754, 596, 1468, 1128, 808, 628, 1531, 1193, 871, 661, 1631, 1267, 911, 701, 1735, 1315, 985, 745, 1843, 1424, 1033, 793, 1955, 1508, 1115, 845, 2071, 1596, 1171, 901, 2191, 1688, 1231, 961, 2306, 1736, 1286, 986, 2434, 1834, 1354, 1054, 2566, 1949, 1426, 1096, 2702, 2057, 1502, 1142, 2812, 2122, 1582, 1222, 2956, 2236, 1666, 1276];

// Get total data codewords capacity for a given version and EC level
export function getDataCodewordsCapacity(
  version: number,
  ecLevel: number,
): number {
  return TOTAL_DATA_CW[(version - 1) * 4 + ecLevel];
}

// Interleave data codewords from multiple blocks and append ECC
export function interleaveBlocks(
  dataCodewords: ArrayLike<number>,
  version: number,
  ecLevel: number,
): Uint8Array {
  const idx = (version - 1) * 4 + ecLevel;
  const ecPerBlock = EC_PER_BLOCK[idx];
  const numBlocks = NUM_BLOCKS[idx];
  const totalData = TOTAL_DATA_CW[idx];
  // QR splits the data into at most two block sizes. The first `numShort`
  // blocks hold `shortLen` codewords, the rest hold one more — identical order
  // to the original ISO Table 9 groups (short group first).
  const shortLen = Math.floor(totalData / numBlocks);
  const numShort = numBlocks - (totalData % numBlocks);

  const data =
    dataCodewords instanceof Uint8Array
      ? dataCodewords
      : Uint8Array.from(dataCodewords);

  // Block boundaries as offsets into `data` — no per-block copies
  const blockOffsets = new Array<number>(numBlocks);
  const blockLengths = new Array<number>(numBlocks);
  const eccBlocks = new Array<Uint8Array>(numBlocks);

  let offset = 0;
  let maxDataLen = 0;
  for (let b = 0; b < numBlocks; b++) {
    const len = b < numShort ? shortLen : shortLen + 1;
    blockOffsets[b] = offset;
    blockLengths[b] = len;
    if (len > maxDataLen) maxDataLen = len;
    eccBlocks[b] = computeECC(data.subarray(offset, offset + len), ecPerBlock);
    offset += len;
  }

  const result = new Uint8Array(data.length + numBlocks * ecPerBlock);
  let pos = 0;

  // Interleave data codewords
  for (let i = 0; i < maxDataLen; i++) {
    for (let b = 0; b < numBlocks; b++) {
      if (i < blockLengths[b]) {
        result[pos++] = data[blockOffsets[b] + i];
      }
    }
  }

  // Interleave ECC codewords
  for (let i = 0; i < ecPerBlock; i++) {
    for (let b = 0; b < numBlocks; b++) {
      result[pos++] = eccBlocks[b][i];
    }
  }

  return result;
}
