import type { ErrorCorrectionLevel } from '../types';
import { encodeQR } from './encode';
import { selectAndApplyBestMask } from './mask';

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

// EC level index for format info table: L=0, M=1, Q=2, H=3
const EC_LEVEL_FORMAT_INDEX: Record<ErrorCorrectionLevel, number> = {
  L: 0,
  M: 1,
  Q: 2,
  H: 3,
};

function createMatrix(size: number): boolean[][] {
  return Array.from(
    { length: size },
    () => new Array(size).fill(false) as boolean[],
  );
}

// Places a 7×7 finder pattern with its 1-module white separator.
// The loop range r,c = -1..7 covers both the finder (0..6) and the separator (-1 and 7)
// in a single pass. Out-of-bounds cells (top-right and bottom-left separators that fall
// outside the matrix) are simply skipped.
function placeFinderPattern(
  matrix: boolean[][],
  functionModules: boolean[][],
  row: number,
  col: number,
): void {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const mr = row + r;
      const mc = col + c;
      if (mr < 0 || mc < 0 || mr >= matrix.length || mc >= matrix.length)
        continue;
      functionModules[mr][mc] = true;
      if (r === -1 || r === 7 || c === -1 || c === 7) {
        // separator (white)
        matrix[mr][mc] = false;
      } else if (r === 0 || r === 6 || c === 0 || c === 6) {
        // outer ring (dark)
        matrix[mr][mc] = true;
      } else if (r >= 2 && r <= 4 && c >= 2 && c <= 4) {
        // inner 3×3 (dark)
        matrix[mr][mc] = true;
      } else {
        // white ring between outer and inner
        matrix[mr][mc] = false;
      }
    }
  }
}

function placeAlignmentPattern(
  matrix: boolean[][],
  functionModules: boolean[][],
  row: number,
  col: number,
): void {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const mr = row + r;
      const mc = col + c;
      functionModules[mr][mc] = true;
      if (r === -2 || r === 2 || c === -2 || c === 2) {
        // outer ring (dark)
        matrix[mr][mc] = true;
      } else if (r === 0 && c === 0) {
        // center (dark)
        matrix[mr][mc] = true;
      } else {
        // interior (white)
        matrix[mr][mc] = false;
      }
    }
  }
}

function placeTimingPatterns(
  matrix: boolean[][],
  functionModules: boolean[][],
): void {
  const size = matrix.length;
  for (let i = 8; i < size - 8; i++) {
    const val = i % 2 === 0;
    matrix[6][i] = val;
    matrix[i][6] = val;
    functionModules[6][i] = true;
    functionModules[i][6] = true;
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
function reserveFormatInfo(functionModules: boolean[][], size: number): void {
  for (const [r, c] of FORMAT_INFO_POSITIONS) {
    functionModules[r][c] = true;
  }
  // Top-right copy (row 8, rightmost 8 columns)
  for (let i = 0; i < 8; i++) {
    functionModules[8][size - 1 - i] = true;
  }
  // Bottom-left copy (col 8, bottom 7 rows)
  for (let i = 0; i < 7; i++) {
    functionModules[size - 7 + i][8] = true;
  }
}

// Version information is only present in QR versions 7 and above (ISO 18004 §7.9).
// The 18-bit Golay-encoded value is written into two 6×3 blocks:
//   - top-right: rows 0–5, cols (size-11)..(size-9)
//   - bottom-left: the transpose of the top-right block
// Both blocks are filled in one loop by indexing bit i as (row=i/3, col=i%3).
function placeVersionInfo(
  matrix: boolean[][],
  functionModules: boolean[][],
  version: number,
): void {
  if (version < 7) return;
  const size = matrix.length;
  const versionBits = VERSION_INFO_TABLE[version - 7];

  for (let i = 0; i < 18; i++) {
    const bit = (versionBits >> i) & 1;
    const r = Math.floor(i / 3);
    const c = i % 3;
    matrix[r][size - 11 + c] = bit === 1;
    functionModules[r][size - 11 + c] = true;
    // Transposed copy for the bottom-left block
    matrix[size - 11 + c][r] = bit === 1;
    functionModules[size - 11 + c][r] = true;
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
  matrix: boolean[][],
  functionModules: boolean[][],
  codewords: number[],
): void {
  const size = matrix.length;
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
      for (let dc = 0; dc <= 1; dc++) {
        const c = col - dc;
        if (c < 0) continue;
        if (functionModules[row][c]) continue;
        if (bitIndex < totalBits) {
          const byteIdx = Math.floor(bitIndex / 8);
          const bitPos = 7 - (bitIndex % 8);
          matrix[row][c] = ((codewords[byteIdx] >> bitPos) & 1) === 1;
          bitIndex++;
        } else {
          matrix[row][c] = false;
        }
      }
    }

    col -= 2;
    goingUp = !goingUp;
  }
}

export interface QRMatrixResult {
  matrix: boolean[][];
  version: number;
  size: number;
}

export function generateQRMatrix(
  data: string,
  ecLevel: ErrorCorrectionLevel = 'M',
  requestedVersion?: number,
): QRMatrixResult {
  const encoded = encodeQR(data, ecLevel, requestedVersion);
  const { codewords, version } = encoded;

  const size = version * 4 + 17;
  const matrix = createMatrix(size);
  const functionModules = createMatrix(size);

  // Place finder patterns (top-left, top-right, bottom-left)
  placeFinderPattern(matrix, functionModules, 0, 0);
  placeFinderPattern(matrix, functionModules, 0, size - 7);
  placeFinderPattern(matrix, functionModules, size - 7, 0);

  // Place timing patterns
  placeTimingPatterns(matrix, functionModules);

  // Dark module
  const darkRow = 4 * version + 9;
  matrix[darkRow][8] = true;
  functionModules[darkRow][8] = true;

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
      placeAlignmentPattern(matrix, functionModules, r, c);
    }
  }

  // Version information (v7+)
  placeVersionInfo(matrix, functionModules, version);

  reserveFormatInfo(functionModules, size);

  // Place data bits
  placeDataBits(matrix, functionModules, codewords);

  // Select best mask and apply it in-place — eliminates two extra array allocations
  const bestMask = selectAndApplyBestMask(matrix, functionModules);

  // Write format information in-place on the already-masked matrix
  const ecFormatIdx = EC_LEVEL_FORMAT_INDEX[ecLevel];
  const formatBits = FORMAT_INFO_TABLE[ecFormatIdx * 8 + bestMask];
  writeFormatInfo(matrix, formatBits, size);

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
  matrix: boolean[][],
  formatBits: number,
  size: number,
): void {
  for (let i = 0; i < 15; i++) {
    const bit = (formatBits >> (14 - i)) & 1;
    const [r, c] = FORMAT_INFO_POSITIONS[i];
    matrix[r][c] = bit === 1;
  }
  for (let i = 0; i < 8; i++) {
    const bit = (formatBits >> i) & 1;
    matrix[8][size - 1 - i] = bit === 1;
  }
  for (let i = 0; i < 7; i++) {
    const bit = (formatBits >> (i + 7)) & 1;
    matrix[size - 7 + i][8] = bit === 1;
  }
  // dark module — always forced dark regardless of mask or format bits (ISO 18004 §7.8.2)
  matrix[size - 8][8] = true;
}
