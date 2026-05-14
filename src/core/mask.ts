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

// Penalty rule N4: proportion of dark modules
function penaltyN4(matrix: boolean[][]): number {
  const size = matrix.length;
  let darkCount = 0;
  const total = size * size;
  for (const row of matrix) {
    for (const val of row) {
      if (val) darkCount++;
    }
  }
  const percent = (darkCount / total) * 100;
  const prev = Math.floor(Math.abs(percent - 50) / 5) * 10;
  const next = Math.ceil(Math.abs(percent - 50) / 5) * 10;
  return Math.min(prev, next);
}

export function calculatePenalty(matrix: boolean[][]): number {
  return (
    penaltyN1(matrix) +
    penaltyN2(matrix) +
    penaltyN3(matrix) +
    penaltyN4(matrix)
  );
}

export function selectBestMask(
  matrix: boolean[][],
  functionModules: boolean[][],
): MaskPattern {
  let bestMask: MaskPattern = 0;
  let bestPenalty = Infinity;

  for (let p = 0; p < 8; p++) {
    const masked = applyMask(matrix, functionModules, p as MaskPattern);
    const penalty = calculatePenalty(masked);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = p as MaskPattern;
    }
  }

  return bestMask;
}
