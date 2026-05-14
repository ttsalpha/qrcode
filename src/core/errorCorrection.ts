// Reed-Solomon error correction for QR codes
// GF(256) with primitive polynomial 0x11d (x^8 + x^4 + x^3 + x^2 + 1)

const EXP_TABLE: number[] = new Array(512);
const LOG_TABLE: number[] = new Array(256);

// Build GF(256) log/antilog tables
(function buildGFTables(): void {
  let x = 1;
  for (let i = 0; i < 256; i++) {
    EXP_TABLE[i] = x;
    LOG_TABLE[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  for (let i = 256; i < 512; i++) {
    EXP_TABLE[i] = EXP_TABLE[i - 255];
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[(LOG_TABLE[a] + LOG_TABLE[b]) % 255];
}

function gfPow(base: number, exp: number): number {
  return EXP_TABLE[(LOG_TABLE[base] * exp) % 255];
}

// Generate RS generator polynomial for `nECC` error correction codewords
function generatePolynomial(nECC: number): number[] {
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
  return poly;
}

const polynomialCache = new Map<number, number[]>();

function getCachedPolynomial(nECC: number): number[] {
  let poly = polynomialCache.get(nECC);
  if (!poly) {
    poly = generatePolynomial(nECC);
    polynomialCache.set(nECC, poly);
  }
  return poly;
}

// Compute `nECC` Reed-Solomon error correction codewords for `data`
export function computeECC(data: number[], nECC: number): number[] {
  const generator = getCachedPolynomial(nECC);
  // Initialize remainder as data codewords followed by nECC zeros
  const remainder = new Array(data.length + nECC).fill(0) as number[];
  for (let i = 0; i < data.length; i++) {
    remainder[i] = data[i];
  }

  for (let i = 0; i < data.length; i++) {
    const coeff = remainder[i];
    if (coeff !== 0) {
      for (let j = 0; j < generator.length; j++) {
        remainder[i + j] ^= gfMul(generator[j], coeff);
      }
    }
  }

  return remainder.slice(data.length, data.length + nECC);
}

// EC block structure per ISO 18004 Table 9
// Format: [ecCodewordsPerBlock, [numBlocks, dataCodewordsPerBlock], [numBlocks, dataCodewordsPerBlock]?]
// Each entry is [ecPerBlock, group1NumBlocks, group1DataCW, group2NumBlocks?, group2DataCW?]
export interface ECBlockSpec {
  ecPerBlock: number;
  groups: Array<{ numBlocks: number; dataCW: number }>;
}

// Full EC table: [version][ecLevel] where ecLevel 0=L,1=M,2=Q,3=H
// Data from ISO 18004:2015 Table 9
export const EC_BLOCKS_TABLE: ECBlockSpec[][] = [
  // Version 1
  [
    { ecPerBlock: 7, groups: [{ numBlocks: 1, dataCW: 19 }] },
    { ecPerBlock: 10, groups: [{ numBlocks: 1, dataCW: 16 }] },
    { ecPerBlock: 13, groups: [{ numBlocks: 1, dataCW: 13 }] },
    { ecPerBlock: 17, groups: [{ numBlocks: 1, dataCW: 9 }] },
  ],
  // Version 2
  [
    { ecPerBlock: 10, groups: [{ numBlocks: 1, dataCW: 34 }] },
    { ecPerBlock: 16, groups: [{ numBlocks: 1, dataCW: 28 }] },
    { ecPerBlock: 22, groups: [{ numBlocks: 1, dataCW: 22 }] },
    { ecPerBlock: 28, groups: [{ numBlocks: 1, dataCW: 16 }] },
  ],
  // Version 3
  [
    { ecPerBlock: 15, groups: [{ numBlocks: 1, dataCW: 55 }] },
    { ecPerBlock: 26, groups: [{ numBlocks: 1, dataCW: 44 }] },
    { ecPerBlock: 18, groups: [{ numBlocks: 2, dataCW: 17 }] },
    { ecPerBlock: 22, groups: [{ numBlocks: 2, dataCW: 13 }] },
  ],
  // Version 4
  [
    { ecPerBlock: 20, groups: [{ numBlocks: 1, dataCW: 80 }] },
    { ecPerBlock: 18, groups: [{ numBlocks: 2, dataCW: 32 }] },
    { ecPerBlock: 26, groups: [{ numBlocks: 2, dataCW: 24 }] },
    { ecPerBlock: 16, groups: [{ numBlocks: 4, dataCW: 9 }] },
  ],
  // Version 5
  [
    { ecPerBlock: 26, groups: [{ numBlocks: 1, dataCW: 108 }] },
    { ecPerBlock: 24, groups: [{ numBlocks: 2, dataCW: 43 }] },
    {
      ecPerBlock: 18,
      groups: [
        { numBlocks: 2, dataCW: 15 },
        { numBlocks: 2, dataCW: 16 },
      ],
    },
    {
      ecPerBlock: 22,
      groups: [
        { numBlocks: 2, dataCW: 11 },
        { numBlocks: 2, dataCW: 12 },
      ],
    },
  ],
  // Version 6
  [
    { ecPerBlock: 18, groups: [{ numBlocks: 2, dataCW: 68 }] },
    { ecPerBlock: 16, groups: [{ numBlocks: 4, dataCW: 27 }] },
    { ecPerBlock: 24, groups: [{ numBlocks: 4, dataCW: 19 }] },
    { ecPerBlock: 28, groups: [{ numBlocks: 4, dataCW: 15 }] },
  ],
  // Version 7
  [
    { ecPerBlock: 20, groups: [{ numBlocks: 2, dataCW: 78 }] },
    { ecPerBlock: 18, groups: [{ numBlocks: 4, dataCW: 31 }] },
    {
      ecPerBlock: 18,
      groups: [
        { numBlocks: 2, dataCW: 14 },
        { numBlocks: 4, dataCW: 15 },
      ],
    },
    {
      ecPerBlock: 26,
      groups: [
        { numBlocks: 4, dataCW: 13 },
        { numBlocks: 1, dataCW: 14 },
      ],
    },
  ],
  // Version 8
  [
    { ecPerBlock: 24, groups: [{ numBlocks: 2, dataCW: 97 }] },
    {
      ecPerBlock: 22,
      groups: [
        { numBlocks: 2, dataCW: 38 },
        { numBlocks: 2, dataCW: 39 },
      ],
    },
    {
      ecPerBlock: 22,
      groups: [
        { numBlocks: 4, dataCW: 18 },
        { numBlocks: 2, dataCW: 19 },
      ],
    },
    {
      ecPerBlock: 26,
      groups: [
        { numBlocks: 4, dataCW: 14 },
        { numBlocks: 2, dataCW: 15 },
      ],
    },
  ],
  // Version 9
  [
    { ecPerBlock: 30, groups: [{ numBlocks: 2, dataCW: 116 }] },
    {
      ecPerBlock: 22,
      groups: [
        { numBlocks: 3, dataCW: 36 },
        { numBlocks: 2, dataCW: 37 },
      ],
    },
    {
      ecPerBlock: 20,
      groups: [
        { numBlocks: 4, dataCW: 16 },
        { numBlocks: 4, dataCW: 17 },
      ],
    },
    {
      ecPerBlock: 24,
      groups: [
        { numBlocks: 4, dataCW: 12 },
        { numBlocks: 4, dataCW: 13 },
      ],
    },
  ],
  // Version 10
  [
    {
      ecPerBlock: 18,
      groups: [
        { numBlocks: 2, dataCW: 68 },
        { numBlocks: 2, dataCW: 69 },
      ],
    },
    {
      ecPerBlock: 26,
      groups: [
        { numBlocks: 4, dataCW: 43 },
        { numBlocks: 1, dataCW: 44 },
      ],
    },
    {
      ecPerBlock: 24,
      groups: [
        { numBlocks: 6, dataCW: 19 },
        { numBlocks: 2, dataCW: 20 },
      ],
    },
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 6, dataCW: 15 },
        { numBlocks: 2, dataCW: 16 },
      ],
    },
  ],
  // Version 11
  [
    { ecPerBlock: 20, groups: [{ numBlocks: 4, dataCW: 81 }] },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 1, dataCW: 50 },
        { numBlocks: 4, dataCW: 51 },
      ],
    },
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 4, dataCW: 22 },
        { numBlocks: 4, dataCW: 23 },
      ],
    },
    {
      ecPerBlock: 24,
      groups: [
        { numBlocks: 3, dataCW: 12 },
        { numBlocks: 8, dataCW: 13 },
      ],
    },
  ],
  // Version 12
  [
    {
      ecPerBlock: 24,
      groups: [
        { numBlocks: 2, dataCW: 92 },
        { numBlocks: 2, dataCW: 93 },
      ],
    },
    {
      ecPerBlock: 22,
      groups: [
        { numBlocks: 6, dataCW: 36 },
        { numBlocks: 2, dataCW: 37 },
      ],
    },
    {
      ecPerBlock: 26,
      groups: [
        { numBlocks: 4, dataCW: 20 },
        { numBlocks: 6, dataCW: 21 },
      ],
    },
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 7, dataCW: 14 },
        { numBlocks: 4, dataCW: 15 },
      ],
    },
  ],
  // Version 13
  [
    { ecPerBlock: 26, groups: [{ numBlocks: 4, dataCW: 107 }] },
    {
      ecPerBlock: 22,
      groups: [
        { numBlocks: 8, dataCW: 37 },
        { numBlocks: 1, dataCW: 38 },
      ],
    },
    {
      ecPerBlock: 24,
      groups: [
        { numBlocks: 8, dataCW: 20 },
        { numBlocks: 4, dataCW: 21 },
      ],
    },
    {
      ecPerBlock: 22,
      groups: [
        { numBlocks: 12, dataCW: 11 },
        { numBlocks: 4, dataCW: 12 },
      ],
    },
  ],
  // Version 14
  [
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 3, dataCW: 115 },
        { numBlocks: 1, dataCW: 116 },
      ],
    },
    {
      ecPerBlock: 24,
      groups: [
        { numBlocks: 4, dataCW: 40 },
        { numBlocks: 5, dataCW: 41 },
      ],
    },
    {
      ecPerBlock: 20,
      groups: [
        { numBlocks: 11, dataCW: 16 },
        { numBlocks: 5, dataCW: 17 },
      ],
    },
    {
      ecPerBlock: 24,
      groups: [
        { numBlocks: 11, dataCW: 12 },
        { numBlocks: 5, dataCW: 13 },
      ],
    },
  ],
  // Version 15
  [
    {
      ecPerBlock: 22,
      groups: [
        { numBlocks: 5, dataCW: 87 },
        { numBlocks: 1, dataCW: 88 },
      ],
    },
    {
      ecPerBlock: 24,
      groups: [
        { numBlocks: 5, dataCW: 41 },
        { numBlocks: 5, dataCW: 42 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 5, dataCW: 24 },
        { numBlocks: 7, dataCW: 25 },
      ],
    },
    {
      ecPerBlock: 24,
      groups: [
        { numBlocks: 11, dataCW: 12 },
        { numBlocks: 7, dataCW: 13 },
      ],
    },
  ],
  // Version 16
  [
    {
      ecPerBlock: 24,
      groups: [
        { numBlocks: 5, dataCW: 98 },
        { numBlocks: 1, dataCW: 99 },
      ],
    },
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 7, dataCW: 45 },
        { numBlocks: 3, dataCW: 46 },
      ],
    },
    {
      ecPerBlock: 24,
      groups: [
        { numBlocks: 15, dataCW: 19 },
        { numBlocks: 2, dataCW: 20 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 3, dataCW: 15 },
        { numBlocks: 13, dataCW: 16 },
      ],
    },
  ],
  // Version 17
  [
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 1, dataCW: 107 },
        { numBlocks: 5, dataCW: 108 },
      ],
    },
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 10, dataCW: 46 },
        { numBlocks: 1, dataCW: 47 },
      ],
    },
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 1, dataCW: 22 },
        { numBlocks: 15, dataCW: 23 },
      ],
    },
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 2, dataCW: 14 },
        { numBlocks: 17, dataCW: 15 },
      ],
    },
  ],
  // Version 18
  [
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 5, dataCW: 120 },
        { numBlocks: 1, dataCW: 121 },
      ],
    },
    {
      ecPerBlock: 26,
      groups: [
        { numBlocks: 9, dataCW: 43 },
        { numBlocks: 4, dataCW: 44 },
      ],
    },
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 17, dataCW: 22 },
        { numBlocks: 1, dataCW: 23 },
      ],
    },
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 2, dataCW: 14 },
        { numBlocks: 19, dataCW: 15 },
      ],
    },
  ],
  // Version 19
  [
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 3, dataCW: 113 },
        { numBlocks: 4, dataCW: 114 },
      ],
    },
    {
      ecPerBlock: 26,
      groups: [
        { numBlocks: 3, dataCW: 44 },
        { numBlocks: 11, dataCW: 45 },
      ],
    },
    {
      ecPerBlock: 26,
      groups: [
        { numBlocks: 17, dataCW: 21 },
        { numBlocks: 4, dataCW: 22 },
      ],
    },
    {
      ecPerBlock: 26,
      groups: [
        { numBlocks: 9, dataCW: 13 },
        { numBlocks: 16, dataCW: 14 },
      ],
    },
  ],
  // Version 20
  [
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 3, dataCW: 107 },
        { numBlocks: 5, dataCW: 108 },
      ],
    },
    {
      ecPerBlock: 26,
      groups: [
        { numBlocks: 3, dataCW: 41 },
        { numBlocks: 13, dataCW: 42 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 15, dataCW: 24 },
        { numBlocks: 5, dataCW: 25 },
      ],
    },
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 15, dataCW: 15 },
        { numBlocks: 10, dataCW: 16 },
      ],
    },
  ],
  // Version 21
  [
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 4, dataCW: 116 },
        { numBlocks: 4, dataCW: 117 },
      ],
    },
    { ecPerBlock: 26, groups: [{ numBlocks: 17, dataCW: 42 }] },
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 17, dataCW: 22 },
        { numBlocks: 6, dataCW: 23 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 19, dataCW: 16 },
        { numBlocks: 6, dataCW: 17 },
      ],
    },
  ],
  // Version 22
  [
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 2, dataCW: 111 },
        { numBlocks: 7, dataCW: 112 },
      ],
    },
    { ecPerBlock: 28, groups: [{ numBlocks: 17, dataCW: 46 }] },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 7, dataCW: 24 },
        { numBlocks: 16, dataCW: 25 },
      ],
    },
    { ecPerBlock: 24, groups: [{ numBlocks: 34, dataCW: 13 }] },
  ],
  // Version 23
  [
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 4, dataCW: 121 },
        { numBlocks: 5, dataCW: 122 },
      ],
    },
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 4, dataCW: 47 },
        { numBlocks: 14, dataCW: 48 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 11, dataCW: 24 },
        { numBlocks: 14, dataCW: 25 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 16, dataCW: 15 },
        { numBlocks: 14, dataCW: 16 },
      ],
    },
  ],
  // Version 24
  [
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 6, dataCW: 117 },
        { numBlocks: 4, dataCW: 118 },
      ],
    },
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 6, dataCW: 45 },
        { numBlocks: 14, dataCW: 46 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 11, dataCW: 24 },
        { numBlocks: 16, dataCW: 25 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 30, dataCW: 16 },
        { numBlocks: 2, dataCW: 17 },
      ],
    },
  ],
  // Version 25
  [
    {
      ecPerBlock: 26,
      groups: [
        { numBlocks: 8, dataCW: 106 },
        { numBlocks: 4, dataCW: 107 },
      ],
    },
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 8, dataCW: 47 },
        { numBlocks: 13, dataCW: 48 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 7, dataCW: 24 },
        { numBlocks: 22, dataCW: 25 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 22, dataCW: 15 },
        { numBlocks: 13, dataCW: 16 },
      ],
    },
  ],
  // Version 26
  [
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 10, dataCW: 114 },
        { numBlocks: 2, dataCW: 115 },
      ],
    },
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 19, dataCW: 46 },
        { numBlocks: 4, dataCW: 47 },
      ],
    },
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 28, dataCW: 22 },
        { numBlocks: 6, dataCW: 23 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 33, dataCW: 16 },
        { numBlocks: 4, dataCW: 17 },
      ],
    },
  ],
  // Version 27
  [
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 8, dataCW: 122 },
        { numBlocks: 4, dataCW: 123 },
      ],
    },
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 22, dataCW: 45 },
        { numBlocks: 3, dataCW: 46 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 8, dataCW: 23 },
        { numBlocks: 26, dataCW: 24 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 12, dataCW: 15 },
        { numBlocks: 28, dataCW: 16 },
      ],
    },
  ],
  // Version 28
  [
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 3, dataCW: 117 },
        { numBlocks: 10, dataCW: 118 },
      ],
    },
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 3, dataCW: 45 },
        { numBlocks: 23, dataCW: 46 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 4, dataCW: 24 },
        { numBlocks: 31, dataCW: 25 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 11, dataCW: 15 },
        { numBlocks: 31, dataCW: 16 },
      ],
    },
  ],
  // Version 29
  [
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 7, dataCW: 116 },
        { numBlocks: 7, dataCW: 117 },
      ],
    },
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 21, dataCW: 45 },
        { numBlocks: 7, dataCW: 46 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 1, dataCW: 23 },
        { numBlocks: 37, dataCW: 24 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 19, dataCW: 15 },
        { numBlocks: 26, dataCW: 16 },
      ],
    },
  ],
  // Version 30
  [
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 5, dataCW: 115 },
        { numBlocks: 10, dataCW: 116 },
      ],
    },
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 19, dataCW: 45 },
        { numBlocks: 10, dataCW: 46 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 15, dataCW: 24 },
        { numBlocks: 25, dataCW: 25 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 23, dataCW: 15 },
        { numBlocks: 25, dataCW: 16 },
      ],
    },
  ],
  // Version 31
  [
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 13, dataCW: 115 },
        { numBlocks: 3, dataCW: 116 },
      ],
    },
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 2, dataCW: 45 },
        { numBlocks: 29, dataCW: 46 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 42, dataCW: 24 },
        { numBlocks: 1, dataCW: 25 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 23, dataCW: 15 },
        { numBlocks: 28, dataCW: 16 },
      ],
    },
  ],
  // Version 32
  [
    { ecPerBlock: 30, groups: [{ numBlocks: 17, dataCW: 115 }] },
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 10, dataCW: 45 },
        { numBlocks: 23, dataCW: 46 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 10, dataCW: 24 },
        { numBlocks: 35, dataCW: 25 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 19, dataCW: 15 },
        { numBlocks: 35, dataCW: 16 },
      ],
    },
  ],
  // Version 33
  [
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 17, dataCW: 115 },
        { numBlocks: 1, dataCW: 116 },
      ],
    },
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 14, dataCW: 45 },
        { numBlocks: 21, dataCW: 46 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 29, dataCW: 24 },
        { numBlocks: 19, dataCW: 25 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 11, dataCW: 15 },
        { numBlocks: 46, dataCW: 16 },
      ],
    },
  ],
  // Version 34
  [
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 13, dataCW: 115 },
        { numBlocks: 6, dataCW: 116 },
      ],
    },
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 14, dataCW: 45 },
        { numBlocks: 23, dataCW: 46 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 44, dataCW: 24 },
        { numBlocks: 7, dataCW: 25 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 59, dataCW: 16 },
        { numBlocks: 1, dataCW: 17 },
      ],
    },
  ],
  // Version 35
  [
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 12, dataCW: 121 },
        { numBlocks: 7, dataCW: 122 },
      ],
    },
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 12, dataCW: 45 },
        { numBlocks: 26, dataCW: 46 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 39, dataCW: 24 },
        { numBlocks: 14, dataCW: 25 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 22, dataCW: 15 },
        { numBlocks: 41, dataCW: 16 },
      ],
    },
  ],
  // Version 36
  [
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 6, dataCW: 121 },
        { numBlocks: 14, dataCW: 122 },
      ],
    },
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 6, dataCW: 45 },
        { numBlocks: 34, dataCW: 46 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 46, dataCW: 24 },
        { numBlocks: 10, dataCW: 25 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 2, dataCW: 15 },
        { numBlocks: 64, dataCW: 16 },
      ],
    },
  ],
  // Version 37
  [
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 17, dataCW: 122 },
        { numBlocks: 4, dataCW: 123 },
      ],
    },
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 29, dataCW: 45 },
        { numBlocks: 14, dataCW: 46 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 49, dataCW: 24 },
        { numBlocks: 10, dataCW: 25 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 24, dataCW: 15 },
        { numBlocks: 46, dataCW: 16 },
      ],
    },
  ],
  // Version 38
  [
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 4, dataCW: 122 },
        { numBlocks: 18, dataCW: 123 },
      ],
    },
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 13, dataCW: 45 },
        { numBlocks: 32, dataCW: 46 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 48, dataCW: 24 },
        { numBlocks: 14, dataCW: 25 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 42, dataCW: 15 },
        { numBlocks: 32, dataCW: 16 },
      ],
    },
  ],
  // Version 39
  [
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 20, dataCW: 117 },
        { numBlocks: 4, dataCW: 118 },
      ],
    },
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 40, dataCW: 45 },
        { numBlocks: 7, dataCW: 46 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 43, dataCW: 24 },
        { numBlocks: 22, dataCW: 25 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 10, dataCW: 15 },
        { numBlocks: 67, dataCW: 16 },
      ],
    },
  ],
  // Version 40
  [
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 19, dataCW: 118 },
        { numBlocks: 6, dataCW: 119 },
      ],
    },
    {
      ecPerBlock: 28,
      groups: [
        { numBlocks: 18, dataCW: 45 },
        { numBlocks: 31, dataCW: 46 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 34, dataCW: 24 },
        { numBlocks: 34, dataCW: 25 },
      ],
    },
    {
      ecPerBlock: 30,
      groups: [
        { numBlocks: 20, dataCW: 15 },
        { numBlocks: 61, dataCW: 16 },
      ],
    },
  ],
];

// Get total data codewords capacity for a given version and EC level
export function getDataCodewordsCapacity(
  version: number,
  ecLevel: number,
): number {
  const spec = EC_BLOCKS_TABLE[version - 1][ecLevel];
  return spec.groups.reduce((sum, g) => sum + g.numBlocks * g.dataCW, 0);
}

// Interleave data codewords from multiple blocks and append ECC
export function interleaveBlocks(
  dataCodewords: number[],
  version: number,
  ecLevel: number,
): number[] {
  const spec = EC_BLOCKS_TABLE[version - 1][ecLevel];
  const blocks: number[][] = [];
  const eccBlocks: number[][] = [];

  let offset = 0;
  for (const group of spec.groups) {
    for (let b = 0; b < group.numBlocks; b++) {
      const block = dataCodewords.slice(offset, offset + group.dataCW);
      blocks.push(block);
      eccBlocks.push(computeECC(block, spec.ecPerBlock));
      offset += group.dataCW;
    }
  }

  // Interleave data codewords
  const result: number[] = [];
  const maxDataLen = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxDataLen; i++) {
    for (const block of blocks) {
      if (i < block.length) {
        result.push(block[i]);
      }
    }
  }

  // Interleave ECC codewords
  const maxECCLen = spec.ecPerBlock;
  for (let i = 0; i < maxECCLen; i++) {
    for (const ecc of eccBlocks) {
      if (i < ecc.length) {
        result.push(ecc[i]);
      }
    }
  }

  return result;
}
