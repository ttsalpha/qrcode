// QR Code mask patterns and penalty scoring per ISO 18004

export type MaskPattern = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

// All 8 mask condition functions (row, col) -> boolean (true = invert module)
const MASK_CONDITIONS: Array<(row: number, col: number) => boolean> = [
  (row, col) => (row + col) % 2 === 0,
  (row, _col) => row % 2 === 0,
  (_row, col) => col % 3 === 0,
  (row, col) => (row + col) % 3 === 0,
  (row, col) => (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0,
  (row, col) => ((row * col) % 2) + ((row * col) % 3) === 0,
  (row, col) => (((row * col) % 2) + ((row * col) % 3)) % 2 === 0,
  (row, col) => (((row + col) % 2) + ((row * col) % 3)) % 2 === 0,
];

export function applyMask(
  matrix: boolean[][],
  functionModules: boolean[][],
  pattern: MaskPattern,
): boolean[][] {
  const condition = MASK_CONDITIONS[pattern];
  return matrix.map((row, r) =>
    row.map((val, c) => {
      if (functionModules[r][c]) return val;
      return condition(r, c) ? !val : val;
    }),
  );
}

// Penalty rule N1: runs of 5+ same-color modules
function penaltyN1(matrix: boolean[][]): number {
  const size = matrix.length;
  let penalty = 0;

  for (let r = 0; r < size; r++) {
    // Horizontal
    let runLen = 1;
    for (let c = 1; c < size; c++) {
      if (matrix[r][c] === matrix[r][c - 1]) {
        runLen++;
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);

    // Vertical
    runLen = 1;
    for (let c = 1; c < size; c++) {
      if (matrix[c][r] === matrix[c - 1][r]) {
        runLen++;
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
  }

  return penalty;
}

// Penalty rule N2: 2x2 blocks of same color
function penaltyN2(matrix: boolean[][]): number {
  const size = matrix.length;
  let penalty = 0;
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const val = matrix[r][c];
      if (
        matrix[r][c + 1] === val &&
        matrix[r + 1][c] === val &&
        matrix[r + 1][c + 1] === val
      ) {
        penalty += 3;
      }
    }
  }
  return penalty;
}

// Penalty rule N3: finder-like patterns
// Pattern: dark light dark dark dark light dark followed by 4 light (or reversed)
const N3_PATTERN1 = [
  true,
  false,
  true,
  true,
  true,
  false,
  true,
  false,
  false,
  false,
  false,
];
const N3_PATTERN2 = [
  false,
  false,
  false,
  false,
  true,
  false,
  true,
  true,
  true,
  false,
  true,
];

function matchPatternInRow(
  row: boolean[],
  start: number,
  pattern: boolean[],
): boolean {
  for (let i = 0; i < pattern.length; i++) {
    if (row[start + i] !== pattern[i]) return false;
  }
  return true;
}

function matchPatternInCol(
  matrix: boolean[][],
  startRow: number,
  col: number,
  pattern: boolean[],
): boolean {
  for (let i = 0; i < pattern.length; i++) {
    if (matrix[startRow + i][col] !== pattern[i]) return false;
  }
  return true;
}

function penaltyN3(matrix: boolean[][]): number {
  const size = matrix.length;
  let penalty = 0;

  for (let r = 0; r < size; r++) {
    const rowArr = matrix[r];
    for (let c = 0; c <= size - 11; c++) {
      if (
        matchPatternInRow(rowArr, c, N3_PATTERN1) ||
        matchPatternInRow(rowArr, c, N3_PATTERN2)
      ) {
        penalty += 40;
      }
    }
  }

  // Vertical — index directly into matrix to avoid column array allocations
  for (let c = 0; c < size; c++) {
    for (let r = 0; r <= size - 11; r++) {
      if (
        matchPatternInCol(matrix, r, c, N3_PATTERN1) ||
        matchPatternInCol(matrix, r, c, N3_PATTERN2)
      ) {
        penalty += 40;
      }
    }
  }

  return penalty;
}

// Penalty rule N4: deviation of the dark-module proportion from 50%, in 5% steps.
// Shared by the reference scorer and the fused fast path.
function n4Penalty(darkCount: number, total: number): number {
  const percent = (darkCount / total) * 100;
  const prev = Math.floor(Math.abs(percent - 50) / 5) * 10;
  const next = Math.ceil(Math.abs(percent - 50) / 5) * 10;
  return Math.min(prev, next);
}

function penaltyN4(matrix: boolean[][]): number {
  const size = matrix.length;
  let darkCount = 0;
  for (const row of matrix) {
    for (const val of row) {
      if (val) darkCount++;
    }
  }
  return n4Penalty(darkCount, size * size);
}

export function calculatePenalty(matrix: boolean[][]): number {
  return (
    penaltyN1(matrix) +
    penaltyN2(matrix) +
    penaltyN3(matrix) +
    penaltyN4(matrix)
  );
}

function applyMaskInPlace(
  matrix: boolean[][],
  functionModules: boolean[][],
  pattern: MaskPattern,
): void {
  const condition = MASK_CONDITIONS[pattern];
  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r];
    const fnRow = functionModules[r];
    for (let c = 0; c < row.length; c++) {
      if (!fnRow[c] && condition(r, c)) row[c] = !row[c];
    }
  }
}

// Reference implementation: scores each mask with the readable penalty
// functions above. Kept for tests; production uses the fused fast path below.
export function selectBestMask(
  matrix: boolean[][],
  functionModules: boolean[][],
): MaskPattern {
  let bestMask: MaskPattern = 0;
  let bestPenalty = Infinity;

  for (let p = 0; p < 8; p++) {
    applyMaskInPlace(matrix, functionModules, p as MaskPattern);
    const penalty = calculatePenalty(matrix);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = p as MaskPattern;
    }
    applyMaskInPlace(matrix, functionModules, p as MaskPattern); // XOR undo
  }

  return bestMask;
}

// ---------------------------------------------------------------------------
// Fast mask selection
//
// The reference path above runs apply + 6 penalty passes + undo per mask
// (~72 full-matrix scans). The fast path applies the mask into a reused
// scratch buffer while scoring N1/N2/N3/N4 in the same row-major pass, then
// scores the vertical rules in one column-major pass — ~2 passes per mask,
// no undo.
// ---------------------------------------------------------------------------

// Every mask condition depends only on (r mod 12, c mod 6): row terms use
// r%2, r%3, and floor(r/2)%2 (period 4) → LCM 12; column terms use c%2, c%3,
// and floor(c/3)%2 (period 6) → LCM 6. One precomputed 12×6 tile per pattern
// replaces the per-cell condition call with a table lookup.
function buildMaskTable(): Uint8Array {
  const table = new Uint8Array(8 * 72);
  for (let p = 0; p < 8; p++) {
    const condition = MASK_CONDITIONS[p];
    for (let r = 0; r < 12; r++) {
      for (let c = 0; c < 6; c++) {
        table[p * 72 + r * 6 + c] = condition(r, c) ? 1 : 0;
      }
    }
  }
  return table;
}

const MASK_TABLE = /* @__PURE__ */ buildMaskTable();

// N3 finder-like sequences as 11-bit windows (MSB = oldest module in scan order)
const N3_WINDOW1 = 0b10111010000;
const N3_WINDOW2 = 0b00001011101;
const N3_WINDOW_MASK = 0x7ff;

// Applies mask tile `tileBase` into `scratch` and returns the full ISO 18004
// penalty. Row-major pass: mask application, N1 horizontal, N3 horizontal
// (rolling window), N2 (2×2, anchored on the previous row), N4 dark count.
// Column-major pass over `scratch`: N1 + N3 vertical.
function applyAndScore(
  scratch: Uint8Array,
  base: Uint8Array,
  fn: Uint8Array,
  size: number,
  tileBase: number,
): number {
  let penalty = 0;
  let darkCount = 0;

  for (let r = 0; r < size; r++) {
    const tileRow = tileBase + (r % 12) * 6;
    const rowOff = r * size;
    const prevRowOff = rowOff - size;
    let cMod6 = 0;
    let runVal = -1;
    let runLen = 0;
    let win = 0;

    for (let c = 0; c < size; c++) {
      const i = rowOff + c;
      const v = fn[i] ? base[i] : base[i] ^ MASK_TABLE[tileRow + cMod6];
      scratch[i] = v;
      darkCount += v;

      // N1 horizontal: runs of 5+ same-color modules score 3 + (len - 5)
      if (v === runVal) {
        runLen++;
      } else {
        if (runLen >= 5) penalty += runLen - 2;
        runVal = v;
        runLen = 1;
      }

      // N3 horizontal
      win = ((win << 1) | v) & N3_WINDOW_MASK;
      if (c >= 10 && (win === N3_WINDOW1 || win === N3_WINDOW2)) {
        penalty += 40;
      }

      // N2: 2×2 same-color block whose bottom-right corner is (r, c)
      if (r > 0 && c > 0 && v === scratch[i - 1]) {
        const above = scratch[prevRowOff + c];
        if (v === above && v === scratch[prevRowOff + c - 1]) {
          penalty += 3;
        }
      }

      cMod6++;
      if (cMod6 === 6) cMod6 = 0;
    }
    if (runLen >= 5) penalty += runLen - 2;
  }

  // N1 + N3 vertical over the masked scratch
  for (let c = 0; c < size; c++) {
    let runVal = -1;
    let runLen = 0;
    let win = 0;
    for (let r = 0; r < size; r++) {
      const v = scratch[r * size + c];
      if (v === runVal) {
        runLen++;
      } else {
        if (runLen >= 5) penalty += runLen - 2;
        runVal = v;
        runLen = 1;
      }
      win = ((win << 1) | v) & N3_WINDOW_MASK;
      if (r >= 10 && (win === N3_WINDOW1 || win === N3_WINDOW2)) {
        penalty += 40;
      }
    }
    if (runLen >= 5) penalty += runLen - 2;
  }

  penalty += n4Penalty(darkCount, size * size);

  return penalty;
}

// Scores all 8 masks over flat buffers and returns the winner. Iteration
// order and strict-less-than tie-breaking match the reference
// `selectBestMask` exactly.
function scoreBestMask(
  base: Uint8Array,
  fn: Uint8Array,
  size: number,
): MaskPattern {
  const scratch = new Uint8Array(size * size);
  let bestMask: MaskPattern = 0;
  let bestPenalty = Infinity;
  for (let p = 0; p < 8; p++) {
    const penalty = applyAndScore(scratch, base, fn, size, p * 72);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = p as MaskPattern;
    }
  }
  return bestMask;
}

// Flat-buffer variant used by the matrix builder: selects the best mask and
// XORs it into `base` in place.
export function selectAndApplyBestMaskFlat(
  base: Uint8Array,
  fn: Uint8Array,
  size: number,
): MaskPattern {
  const bestMask = scoreBestMask(base, fn, size);

  const tileBase = bestMask * 72;
  for (let r = 0; r < size; r++) {
    const tileRow = tileBase + (r % 12) * 6;
    const off = r * size;
    let cMod6 = 0;
    for (let c = 0; c < size; c++) {
      if (!fn[off + c]) {
        base[off + c] ^= MASK_TABLE[tileRow + cMod6];
      }
      cMod6++;
      if (cMod6 === 6) cMod6 = 0;
    }
  }

  return bestMask;
}

// boolean[][] bridge kept for the differential test suite — production goes
// through selectAndApplyBestMaskFlat. Scores via the fast path, applies via
// the reference applyMaskInPlace.
export function selectAndApplyBestMask(
  matrix: boolean[][],
  functionModules: boolean[][],
): MaskPattern {
  const size = matrix.length;
  const total = size * size;
  const base = new Uint8Array(total);
  const fn = new Uint8Array(total);
  for (let r = 0; r < size; r++) {
    const row = matrix[r];
    const fnRow = functionModules[r];
    const off = r * size;
    for (let c = 0; c < size; c++) {
      if (row[c]) base[off + c] = 1;
      if (fnRow[c]) fn[off + c] = 1;
    }
  }

  const bestMask = scoreBestMask(base, fn, size);
  applyMaskInPlace(matrix, functionModules, bestMask);
  return bestMask;
}
