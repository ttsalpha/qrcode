import type { DotStyle } from '../types';

// Round to 2 decimals — keeps path strings compact with sub-0.01px error
export const r2 = (n: number): number => Math.round(n * 100) / 100;

// The QR module grid as a flat, row-major Uint8Array (1 = dark, 0 = light) of
// length size*size, as produced by generateQRMatrix. Treated as read-only by
// the renderer — cached matrices are shared across callers.
export type QRMatrixView = Uint8Array;

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
  size: number,
  moduleSize: number,
  marginPx: number,
): string {
  const h = r2(moduleSize);
  const parts: string[] = [];

  for (let row = 0; row < size; row++) {
    const rowOff = row * size;
    let runStart = -1;
    for (let col = 0; col <= size; col++) {
      const isDark =
        col < size &&
        matrix[rowOff + col] === 1 &&
        !isFinderModule(row, col, size);
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
  size: number,
  moduleSize: number,
  marginPx: number,
  dotStyle: DotStyle,
): string {
  const s = r2(moduleSize);
  const parts: string[] = [];

  if (dotStyle === 'circle') {
    // Circle geometry is identical for every module — hoist the invariants.
    // `half` stays unrounded to match the original r2(x + s/2) rounding order.
    const half = s / 2;
    const rad = r2(half);
    const d2 = r2(rad * 2);
    const dn2 = r2(-rad * 2);
    const arc = `a${rad},${rad} 0 1,0 `;
    for (let row = 0; row < size; row++) {
      const rowOff = row * size;
      for (let col = 0; col < size; col++) {
        if (matrix[rowOff + col] !== 1 || isFinderModule(row, col, size))
          continue;
        const cx = r2(r2(marginPx + col * moduleSize) + half);
        const cy = r2(r2(marginPx + row * moduleSize) + half);
        parts.push(`M${r2(cx - rad)},${cy}${arc}${d2},0${arc}${dn2},0z`);
      }
    }
    return parts.join(' ');
  }

  // rounded: per-corner radius based on neighbors; R is loop-invariant
  const R = r2(s * 0.45);
  for (let row = 0; row < size; row++) {
    const rowOff = row * size;
    for (let col = 0; col < size; col++) {
      if (matrix[rowOff + col] !== 1 || isFinderModule(row, col, size))
        continue;

      const x = r2(marginPx + col * moduleSize);
      const y = r2(marginPx + row * moduleSize);

      const top = row > 0 && matrix[rowOff - size + col] === 1;
      const right = col < size - 1 && matrix[rowOff + col + 1] === 1;
      const bottom = row < size - 1 && matrix[rowOff + size + col] === 1;
      const left = col > 0 && matrix[rowOff + col - 1] === 1;
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

  return parts.join(' ');
}

// Builds one merged SVG path `d` string for all dark non-finder data modules.
// Shared by the React component and the headless SVG string builder.
export function buildDataModulesPath(
  matrix: QRMatrixView,
  size: number,
  moduleSize: number,
  marginPx: number,
  dotStyle: DotStyle,
): string {
  return dotStyle === 'square'
    ? renderSquareRLE(matrix, size, moduleSize, marginPx)
    : renderModulesPer(matrix, size, moduleSize, marginPx, dotStyle);
}
