import type { DotStyle } from '../types';

// Round to 2 decimals — keeps path strings compact with sub-0.01px error
export const r2 = (n: number): number => Math.round(n * 100) / 100;

// A read-only view of the module grid, as produced by generateQRMatrix.
export type QRMatrixView = ReadonlyArray<readonly boolean[]>;

// The three finder regions (7×7 finder + 1-module separator) occupy fixed
// 8×8 corner rectangles — a bounds check beats a per-cell Set lookup.
function isFinderModule(row: number, col: number, size: number): boolean {
  return (
    (row <= 7 && (col <= 7 || col >= size - 8)) || (row >= size - 8 && col <= 7)
  );
}

// 'square' style: merge consecutive dark modules per row into one path command
function renderSquareRLE(
  matrix: QRMatrixView,
  moduleSize: number,
  marginPx: number,
): string {
  const size = matrix.length;
  const h = r2(moduleSize);
  const parts: string[] = [];

  for (let row = 0; row < size; row++) {
    let runStart = -1;
    for (let col = 0; col <= size; col++) {
      const isDark =
        col < size && matrix[row][col] && !isFinderModule(row, col, size);
      if (isDark && runStart === -1) {
        runStart = col;
      } else if (!isDark && runStart !== -1) {
        const x = r2(marginPx + runStart * moduleSize);
        const y = r2(marginPx + row * moduleSize);
        const w = r2((col - runStart) * moduleSize);
        parts.push(`M${x},${y}h${w}v${h}h${-w}z`);
        runStart = -1;
      }
    }
  }

  return parts.join(' ');
}

// 'circle' and 'rounded' styles: one path command per module
function renderModulesPer(
  matrix: QRMatrixView,
  moduleSize: number,
  marginPx: number,
  dotStyle: DotStyle,
): string {
  const size = matrix.length;
  const s = r2(moduleSize);
  const parts: string[] = [];

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!matrix[row][col] || isFinderModule(row, col, size)) continue;

      const x = r2(marginPx + col * moduleSize);
      const y = r2(marginPx + row * moduleSize);

      if (dotStyle === 'circle') {
        const cx = r2(x + s / 2);
        const cy = r2(y + s / 2);
        const rad = r2(s / 2);
        parts.push(
          `M${r2(cx - rad)},${cy}a${rad},${rad} 0 1,0 ${r2(rad * 2)},0a${rad},${rad} 0 1,0 ${r2(-rad * 2)},0z`,
        );
      } else {
        // rounded: per-corner radius based on neighbors
        const R = r2(s * 0.45);
        const top = row > 0 && matrix[row - 1][col];
        const right = col < size - 1 && matrix[row][col + 1];
        const bottom = row < size - 1 && matrix[row + 1][col];
        const left = col > 0 && matrix[row][col - 1];
        const rTL = top || left ? 0 : R;
        const rTR = top || right ? 0 : R;
        const rBR = bottom || right ? 0 : R;
        const rBL = bottom || left ? 0 : R;
        parts.push(
          `M${r2(x + rTL)},${y}` +
            `h${r2(s - rTL - rTR)}` +
            `q${rTR},0 ${rTR},${rTR}` +
            `v${r2(s - rTR - rBR)}` +
            `q0,${rBR} ${-rBR},${rBR}` +
            `h${r2(-(s - rBR - rBL))}` +
            `q${-rBL},0 ${-rBL},${-rBL}` +
            `v${r2(-(s - rBL - rTL))}` +
            `q0,${-rTL} ${rTL},${-rTL}z`,
        );
      }
    }
  }

  return parts.join(' ');
}

// Builds one merged SVG path `d` string for all dark non-finder data modules.
// Shared by the React component and the headless SVG string builder.
export function buildDataModulesPath(
  matrix: QRMatrixView,
  moduleSize: number,
  marginPx: number,
  dotStyle: DotStyle,
): string {
  return dotStyle === 'square'
    ? renderSquareRLE(matrix, moduleSize, marginPx)
    : renderModulesPer(matrix, moduleSize, marginPx, dotStyle);
}
