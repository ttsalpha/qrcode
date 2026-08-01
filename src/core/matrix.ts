import type { ErrorCorrectionLevel } from '../types';
import { encodeQR } from './encode';
import { selectAndApplyBestMaskFlat } from './mask';

// Alignment pattern center positions per version (ISO 18004 Annex E)
const ALIGNMENT_PATTERN_TABLE: number[][] = [
  [], // V1
  [6, 18], // V2
  [6, 22], // V3
  [6, 26], // V4
  [6, 30], // V5
  [6, 34], // V6
  [6, 22, 38], // V7
  [6, 24, 42], // V8
  [6, 26, 46], // V9
  [6, 28, 50], // V10
  [6, 30, 54], // V11
  [6, 32, 58], // V12
  [6, 34, 62], // V13
  [6, 26, 46, 66], // V14
  [6, 26, 48, 70], // V15
  [6, 26, 50, 74], // V16
  [6, 30, 54, 78], // V17
  [6, 30, 56, 82], // V18
  [6, 30, 58, 86], // V19
  [6, 34, 62, 90], // V20
  [6, 28, 50, 72, 94], // V21
  [6, 26, 50, 74, 98], // V22
  [6, 30, 54, 78, 102], // V23
  [6, 28, 54, 80, 106], // V24
  [6, 32, 58, 84, 110], // V25
  [6, 30, 58, 86, 114], // V26
  [6, 34, 62, 90, 118], // V27
  [6, 26, 50, 74, 98, 122], // V28
  [6, 30, 54, 78, 102, 126], // V29
  [6, 26, 52, 78, 104, 130], // V30
  [6, 30, 56, 82, 108, 132], // V31
  [6, 34, 60, 86, 112, 136], // V32
  [6, 30, 58, 86, 114, 142], // V33
  [6, 34, 62, 90, 118, 146], // V34
  [6, 30, 54, 78, 102, 126, 150], // V35
  [6, 24, 50, 76, 102, 128, 154], // V36
  [6, 28, 54, 80, 106, 132, 158], // V37
  [6, 32, 58, 84, 110, 136, 162], // V38
  [6, 26, 54, 82, 110, 138, 166], // V39
  [6, 30, 58, 86, 114, 142, 170], // V40
];

// Pre-computed 15-bit format information strings (ISO 18004 §7.8.2).
// Each value encodes: 2-bit EC level | 3-bit mask pattern | 10-bit BCH error correction,
// then XORed with the mask 0x5412 (101010000010010) to ensure no all-zero result.
//
// Index: ecLevel * 8 + maskPattern (0-based)
// EC level ordering in format bits: L=01, M=00, Q=11, H=10 (not alphabetical — per spec)
const FORMAT_INFO_TABLE: number[] = [
  // L (EC level bits 01)
  0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976,
  // M (EC level bits 00)
  0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0,
  // Q (EC level bits 11)
  0x355f, 0x3068, 0x3f31, 0x3a06, 0x24b4, 0x2183, 0x2eda, 0x2bed,
  // H (EC level bits 10)
  0x1689, 0x13be, 0x1ce7, 0x19d0, 0x0762, 0x0255, 0x0d0c, 0x083b,
];

// Pre-computed 18-bit version information strings for versions 7–40 (ISO 18004 §7.9).
// Each value is the 6-bit version number encoded with a (18,6) Golay error correction code.
// Absent for versions 1–6, which have no version information blocks.
const VERSION_INFO_TABLE: number[] = [
  0x07c94, // V7
  0x085bc, // V8
  0x09a99, // V9
  0x0a4d3, // V10
  0x0bbf6, // V11
  0x0c762, // V12
  0x0d847, // V13
  0x0e60d, // V14
  0x0f928, // V15
  0x10b78, // V16
  0x1145d, // V17
  0x12a17, // V18
  0x13532, // V19
  0x149a6, // V20
  0x15683, // V21
  0x168c9, // V22
  0x177ec, // V23
  0x18ec4, // V24
  0x191e1, // V25
  0x1afab, // V26
  0x1b08e, // V27
  0x1cc1a, // V28
  0x1d33f, // V29
  0x1ed75, // V30
  0x1f250, // V31
  0x209d5, // V32
  0x216f0, // V33
  0x228ba, // V34
  0x2379f, // V35
  0x24b0b, // V36
  0x2542e, // V37
  0x26a64, // V38
  0x27541, // V39
  0x28c69, // V40
];

// The matrix is built on a flat Uint8Array buffer (index = row * size + col,
// values 0/1) and returned as-is — that flat grid is what the renderer reads.

// Places a 7×7 finder pattern with its 1-module white separator.
// The loop range r,c = -1..7 covers both the finder (0..6) and the separator (-1 and 7)
// in a single pass. Out-of-bounds cells (top-right and bottom-left separators that fall
// outside the matrix) are simply skipped.
function placeFinderPattern(
  matrix: Uint8Array,
  functionModules: Uint8Array,
  size: number,
  row: number,
  col: number,
): void {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const mr = row + r;
      const mc = col + c;
      if (mr < 0 || mc < 0 || mr >= size || mc >= size) continue;
      const i = mr * size + mc;
      functionModules[i] = 1;
      if (r === -1 || r === 7 || c === -1 || c === 7) {
        // separator (white)
        matrix[i] = 0;
      } else if (r === 0 || r === 6 || c === 0 || c === 6) {
        // outer ring (dark)
        matrix[i] = 1;
      } else if (r >= 2 && r <= 4 && c >= 2 && c <= 4) {
        // inner 3×3 (dark)
        matrix[i] = 1;
      } else {
        // white ring between outer and inner
        matrix[i] = 0;
      }
    }
  }
}

function placeAlignmentPattern(
  matrix: Uint8Array,
  functionModules: Uint8Array,
  size: number,
  row: number,
  col: number,
): void {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const i = (row + r) * size + (col + c);
      functionModules[i] = 1;
      if (r === -2 || r === 2 || c === -2 || c === 2) {
        // outer ring (dark)
        matrix[i] = 1;
      } else if (r === 0 && c === 0) {
        // center (dark)
        matrix[i] = 1;
      } else {
        // interior (white)
        matrix[i] = 0;
      }
    }
  }
}

function placeTimingPatterns(
  matrix: Uint8Array,
  functionModules: Uint8Array,
  size: number,
): void {
  for (let i = 8; i < size - 8; i++) {
    const val = i % 2 === 0 ? 1 : 0;
    const horizontal = 6 * size + i;
    const vertical = i * size + 6;
    matrix[horizontal] = val;
    matrix[vertical] = val;
    functionModules[horizontal] = 1;
    functionModules[vertical] = 1;
  }
}

// First-copy format info positions (top-left area), bits 14..0
const FORMAT_INFO_POSITIONS: Array<[number, number]> = [
  [8, 0],
  [8, 1],
  [8, 2],
  [8, 3],
  [8, 4],
  [8, 5],
  [8, 7],
  [8, 8],
  [7, 8],
  [5, 8],
  [4, 8],
  [3, 8],
  [2, 8],
  [1, 8],
  [0, 8],
];

// Marks all format information positions as function modules so the data placement
// step skips them. The actual format bits are written later (after mask selection)
// because the mask pattern index is part of the format information itself.
//
// Format info occupies 15 modules in two copies:
//   Copy 1: 15 cells around the top-left finder (FORMAT_INFO_POSITIONS)
//   Copy 2: 8 cells top-right + 7 cells bottom-left
function reserveFormatInfo(functionModules: Uint8Array, size: number): void {
  for (const [r, c] of FORMAT_INFO_POSITIONS) {
    functionModules[r * size + c] = 1;
  }
  // Top-right copy (row 8, rightmost 8 columns)
  for (let i = 0; i < 8; i++) {
    functionModules[8 * size + size - 1 - i] = 1;
  }
  // Bottom-left copy (col 8, bottom 7 rows)
  for (let i = 0; i < 7; i++) {
    functionModules[(size - 7 + i) * size + 8] = 1;
  }
}

// Version information is only present in QR versions 7 and above (ISO 18004 §7.9).
// The 18-bit Golay-encoded value is written into two 6×3 blocks:
//   - top-right: rows 0–5, cols (size-11)..(size-9)
//   - bottom-left: the transpose of the top-right block
// Both blocks are filled in one loop by indexing bit i as (row=i/3, col=i%3).
function placeVersionInfo(
  matrix: Uint8Array,
  functionModules: Uint8Array,
  size: number,
  version: number,
): void {
  if (version < 7) return;
  const versionBits = VERSION_INFO_TABLE[version - 7];

  for (let i = 0; i < 18; i++) {
    const bit = (versionBits >> i) & 1;
    const r = Math.floor(i / 3);
    const c = i % 3;
    const topRight = r * size + (size - 11 + c);
    const bottomLeft = (size - 11 + c) * size + r;
    matrix[topRight] = bit;
    functionModules[topRight] = 1;
    // Transposed copy for the bottom-left block
    matrix[bottomLeft] = bit;
    functionModules[bottomLeft] = 1;
  }
}

// Places all data+ECC bits into the matrix using the QR zigzag scan (ISO 18004 §7.7.3).
//
// Bits are placed in 2-column-wide strips, scanning right to left across the symbol.
// Within each strip, bits fill top-to-bottom or bottom-to-top alternately.
// Column 6 is the vertical timing pattern and is always skipped — the strip simply
// narrows to 1 column when it would overlap col 6.
// Function module cells (finders, timing, format, alignment) are skipped silently;
// any remaining capacity after all codewords is filled with zeros (remainder bits).
function placeDataBits(
  matrix: Uint8Array,
  functionModules: Uint8Array,
  size: number,
  codewords: Uint8Array,
): void {
  let bitIndex = 0;
  const totalBits = codewords.length * 8;

  let col = size - 1;
  let goingUp = true;

  while (col >= 0) {
    // Col 6 is the vertical timing pattern; skip it to keep the strip pairing intact
    if (col === 6) {
      col--;
      continue;
    }

    const rowStart = goingUp ? size - 1 : 0;
    const rowEnd = goingUp ? -1 : size;
    const rowStep = goingUp ? -1 : 1;

    for (let row = rowStart; row !== rowEnd; row += rowStep) {
      const rowOff = row * size;
      for (let dc = 0; dc <= 1; dc++) {
        const c = col - dc;
        if (c < 0) continue;
        if (functionModules[rowOff + c]) continue;
        if (bitIndex < totalBits) {
          matrix[rowOff + c] =
            (codewords[bitIndex >> 3] >> (7 - (bitIndex & 7))) & 1;
          bitIndex++;
        } else {
          matrix[rowOff + c] = 0;
        }
      }
    }

    col -= 2;
    goingUp = !goingUp;
  }
}

export interface QRMatrixResult {
  // Flat, row-major grid (1 = dark) of length size*size. Read-only: cached
  // results are shared across callers — mutating a matrix would poison every
  // subsequent render of the same value.
  matrix: Uint8Array;
  version: number;
  size: number;
}

// Bounded LRU keyed on all generation inputs. Results are treated as
// immutable by every consumer, so returning a shared reference is safe.
// Repeated renders of the same value (lists, remounts, StrictMode,
// toSVGString → toDataURL) skip the full encode + mask-selection pipeline.
const MATRIX_CACHE_LIMIT = 16;
const matrixCache = new Map<string, QRMatrixResult>();

export function generateQRMatrix(
  data: string,
  ecLevel: ErrorCorrectionLevel = 'M',
  requestedVersion?: number,
): QRMatrixResult {
  const cacheKey = `${ecLevel}|${requestedVersion ?? 'a'}|${data}`;
  const cached = matrixCache.get(cacheKey);
  if (cached) {
    // Refresh recency: Map iteration order is insertion order
    matrixCache.delete(cacheKey);
    matrixCache.set(cacheKey, cached);
    return cached;
  }

  const result = computeQRMatrix(data, ecLevel, requestedVersion);
  matrixCache.set(cacheKey, result);
  if (matrixCache.size > MATRIX_CACHE_LIMIT) {
    matrixCache.delete(matrixCache.keys().next().value as string);
  }
  return result;
}

// Uncached generation pipeline. Exported for benchmarks; production code and
// consumers should go through the cached generateQRMatrix.
export function computeQRMatrix(
  data: string,
  ecLevel: ErrorCorrectionLevel,
  requestedVersion?: number,
): QRMatrixResult {
  const encoded = encodeQR(data, ecLevel, requestedVersion);
  const { codewords, version, ecLevelIndex } = encoded;

  const size = version * 4 + 17;
  const matrix = new Uint8Array(size * size);
  const functionModules = new Uint8Array(size * size);

  // Place finder patterns (top-left, top-right, bottom-left)
  placeFinderPattern(matrix, functionModules, size, 0, 0);
  placeFinderPattern(matrix, functionModules, size, 0, size - 7);
  placeFinderPattern(matrix, functionModules, size, size - 7, 0);

  // Place timing patterns
  placeTimingPatterns(matrix, functionModules, size);

  // Dark module
  const darkIdx = (4 * version + 9) * size + 8;
  matrix[darkIdx] = 1;
  functionModules[darkIdx] = 1;

  // Place alignment patterns
  const alignCenters = ALIGNMENT_PATTERN_TABLE[version - 1];
  for (const r of alignCenters) {
    for (const c of alignCenters) {
      // Skip positions that overlap any of the three finder pattern areas
      if (
        (r <= 8 && c <= 8) ||
        (r <= 8 && c >= size - 8) ||
        (r >= size - 8 && c <= 8)
      ) {
        continue;
      }
      placeAlignmentPattern(matrix, functionModules, size, r, c);
    }
  }

  // Version information (v7+)
  placeVersionInfo(matrix, functionModules, size, version);

  reserveFormatInfo(functionModules, size);

  // Place data bits
  placeDataBits(matrix, functionModules, size, codewords);

  // Select best mask and apply it in-place on the flat buffer
  const bestMask = selectAndApplyBestMaskFlat(matrix, functionModules, size);

  // Write format information in-place on the already-masked matrix.
  // FORMAT_INFO_TABLE rows are ordered L, M, Q, H — the same order as
  // EncodeResult.ecLevelIndex.
  const formatBits = FORMAT_INFO_TABLE[ecLevelIndex * 8 + bestMask];
  writeFormatInfo(matrix, formatBits, size);

  // `matrix` is already the final masked + formatted grid — return it directly.
  // Read-only for consumers: the cache shares this exact buffer.
  return { matrix, version, size };
}

// Writes the 15-bit format information into both copies in the matrix.
// Called after masking because the chosen mask pattern index is encoded in
// the format information (ISO 18004 §7.8.2).
//
// Copy 1 (15 cells, top-left area): bits 14..0 per FORMAT_INFO_POSITIONS.
// Copy 2 (15 cells, split): bits 0..7 top-right, bits 7..14 bottom-left.
// Note: bit 7 appears in both halves of copy 2 — this is per spec.
//
// The dark module at (size-8, 8) is always forced dark regardless of format bits.
function writeFormatInfo(
  matrix: Uint8Array,
  formatBits: number,
  size: number,
): void {
  for (let i = 0; i < 15; i++) {
    const [r, c] = FORMAT_INFO_POSITIONS[i];
    matrix[r * size + c] = (formatBits >> (14 - i)) & 1;
  }
  for (let i = 0; i < 8; i++) {
    matrix[8 * size + size - 1 - i] = (formatBits >> i) & 1;
  }
  for (let i = 0; i < 7; i++) {
    matrix[(size - 7 + i) * size + 8] = (formatBits >> (i + 7)) & 1;
  }
  // dark module — always forced dark regardless of mask or format bits (ISO 18004 §7.8.2)
  matrix[(size - 8) * size + 8] = 1;
}
