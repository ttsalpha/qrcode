import type { DotStyle } from '../types';

// Round to 2 decimals: keeps path strings compact with sub-0.01px error
export const r2 = (n: number): number => Math.round(n * 100) / 100;

// The same rounding without the divide, giving a whole number of hundredths.
// Every coordinate in a path is one of these, and formatting from the integer
// rather than from the double is worth 2.4x to 3.5x on the whole path build.
const r2i = (n: number): number => Math.round(n * 100);

// Decimal form of a signed count of hundredths. Byte-identical to
// String(r2(n)), down to the dropped trailing zero and -0 printing as "0".
function fmt(hundredths: number): string {
  const negative = hundredths < 0;
  const abs = negative ? -hundredths : hundredths;
  const whole = Math.floor(abs / 100);
  const frac = abs - whole * 100;
  let out: string;
  if (frac === 0) out = String(whole);
  else if (frac % 10 === 0) out = `${whole}.${frac / 10}`;
  else if (frac < 10) out = `${whole}.0${frac}`;
  else out = `${whole}.${frac}`;
  return negative ? `-${out}` : out;
}

// The QR module grid as a flat, row-major Uint8Array (1 = dark, 0 = light) of
// length size*size, as produced by generateQRMatrix. Treated as read-only by
// the renderer, since cached matrices are shared across callers.
export type QRMatrixView = Uint8Array;

// Finder regions occupy fixed 8×8 corners and are drawn separately, so each
// renderer skips them by deriving per-row column cutoffs instead of testing
// membership per cell. Interior rows (8..size-9) have no finder columns.
function finderLeftMaxForRow(row: number, size: number): number {
  // rows 0..7 (top-left/top-right) and size-8..size-1 (bottom-left) exclude col 0..7
  return row <= 7 || row >= size - 8 ? 7 : -1;
}
function finderRightMinForRow(row: number, size: number): number {
  // only the top rows (0..7) carry the top-right finder on the right edge
  return row <= 7 ? size - 8 : size;
}

// 'square' style: merge consecutive dark modules per row into one path command
function renderSquareRLE(
  matrix: QRMatrixView,
  size: number,
  moduleSize: number,
  marginPx: number,
): string {
  const h = fmt(r2i(moduleSize));
  // Every x a run can start at is a column, and every width is a whole number
  // of modules, so both sets are the same for all rows: one string each,
  // built once, instead of a conversion per run.
  const colX: string[] = new Array(size);
  const widths: string[] = new Array(size + 1);
  const negWidths: string[] = new Array(size + 1);
  for (let n = 0; n <= size; n++) {
    const w = r2i(n * moduleSize);
    widths[n] = fmt(w);
    negWidths[n] = fmt(-w);
    if (n < size) colX[n] = fmt(r2i(marginPx + n * moduleSize));
  }
  const parts: string[] = [];

  for (let row = 0; row < size; row++) {
    const rowOff = row * size;
    const y = fmt(r2i(marginPx + row * moduleSize));
    // Iterate only the data columns; finder columns are drawn separately, so a
    // run can never cross them and no per-cell finder test is needed.
    const colStart = finderLeftMaxForRow(row, size) + 1;
    const colEnd = finderRightMinForRow(row, size); // exclusive
    let runStart = -1;

    for (let col = colStart; col < colEnd; col++) {
      if (matrix[rowOff + col] === 1) {
        if (runStart === -1) runStart = col;
      } else if (runStart !== -1) {
        const n = col - runStart;
        parts.push(
          `M${colX[runStart]},${y}h${widths[n]}v${h}h${negWidths[n]}z`,
        );
        runStart = -1;
      }
    }
    if (runStart !== -1) {
      const n = colEnd - runStart;
      parts.push(`M${colX[runStart]},${y}h${widths[n]}v${h}h${negWidths[n]}z`);
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
    // Circle geometry is identical for every module, so hoist the invariants.
    // `half` stays unrounded to match the original r2(x + s/2) rounding order.
    const half = s / 2;
    const rad = r2(half);
    const arc = `a${fmt(r2i(rad))},${fmt(r2i(rad))} 0 1,0 `;
    const tail = `${arc}${fmt(r2i(rad * 2))},0${arc}${fmt(r2i(-rad * 2))},0z`;
    // The leftmost point depends only on the column, so it is the same string
    // in every row that draws a module there.
    const colLeft: string[] = new Array(size);
    for (let col = 0; col < size; col++) {
      const cx = r2(r2(marginPx + col * moduleSize) + half);
      colLeft[col] = `M${fmt(r2i(cx - rad))},`;
    }
    for (let row = 0; row < size; row++) {
      const rowOff = row * size;
      const cy = `${fmt(r2i(r2(marginPx + row * moduleSize) + half))}${tail}`;
      const colStart = finderLeftMaxForRow(row, size) + 1;
      const colEnd = finderRightMinForRow(row, size);
      for (let col = colStart; col < colEnd; col++) {
        if (matrix[rowOff + col] !== 1) continue;
        parts.push(colLeft[col] + cy);
      }
    }
    return parts.join(' ');
  }

  // rounded: each corner is either square or a quarter turn of radius R, so
  // every straight run is s, s - R or s - 2R, and every curve is one of four
  // fixed commands. Both sets are built once here instead of per module.
  const R = r2(s * 0.45);
  const run = [fmt(r2i(s)), fmt(r2i(s - R)), fmt(r2i(s - 2 * R))];
  const negRun = [fmt(r2i(-s)), fmt(r2i(-(s - R))), fmt(r2i(-(s - 2 * R)))];
  const rStr = fmt(r2i(R));
  const negRStr = fmt(r2i(-R));
  const curveTR = `q${rStr},0 ${rStr},${rStr}`;
  const curveBR = `q0,${rStr} ${negRStr},${rStr}`;
  const curveBL = `q${negRStr},0 ${negRStr},${negRStr}`;
  const curveTL = `q0,${negRStr} ${rStr},${negRStr}`;

  // Same per-column reuse as the other two styles, one entry per starting
  // corner: square (x) or rounded (x + R).
  const colFlat: string[] = new Array(size);
  const colRound: string[] = new Array(size);
  for (let col = 0; col < size; col++) {
    const x = r2(marginPx + col * moduleSize);
    colFlat[col] = fmt(r2i(x));
    colRound[col] = fmt(r2i(x + R));
  }

  for (let row = 0; row < size; row++) {
    const rowOff = row * size;
    const y = fmt(r2i(r2(marginPx + row * moduleSize)));
    const colStart = finderLeftMaxForRow(row, size) + 1;
    const colEnd = finderRightMinForRow(row, size);
    for (let col = colStart; col < colEnd; col++) {
      if (matrix[rowOff + col] !== 1) continue;

      const top = row > 0 && matrix[rowOff - size + col] === 1;
      const right = col < size - 1 && matrix[rowOff + col + 1] === 1;
      const bottom = row < size - 1 && matrix[rowOff + size + col] === 1;
      const left = col > 0 && matrix[rowOff + col - 1] === 1;
      // A corner is only rounded where no neighbour continues the shape.
      const tl = !(top || left);
      const tr = !(top || right);
      const br = !(bottom || right);
      const bl = !(bottom || left);

      // A zero-radius corner used to emit `q0,0 0,0`, which draws nothing but
      // was 29% of the path data.
      parts.push(
        `M${tl ? colRound[col] : colFlat[col]},${y}` +
          `h${run[(tl ? 1 : 0) + (tr ? 1 : 0)]}` +
          (tr ? curveTR : '') +
          `v${run[(tr ? 1 : 0) + (br ? 1 : 0)]}` +
          (br ? curveBR : '') +
          `h${negRun[(br ? 1 : 0) + (bl ? 1 : 0)]}` +
          (bl ? curveBL : '') +
          `v${negRun[(bl ? 1 : 0) + (tl ? 1 : 0)]}` +
          (tl ? curveTL : '') +
          'z',
      );
    }
  }

  return parts.join(' ');
}

// Keyed on the matrix buffer, which generateQRMatrix hands back by reference,
// so entries die with it and nothing needs evicting. The path is 73% to 99% of
// an uncached buildSVGString, which toSVGString and toDataURL used to redo on
// every call.
//
// Two per matrix: a v40 rounded path is ~1.8 MB of UTF-16, and a component
// whose size tracks its container would otherwise pin one per resize step.
const PATH_CACHE_LIMIT = 2;
const pathCache = new WeakMap<QRMatrixView, Map<string, string>>();

// Builds one merged SVG path `d` string for all dark non-finder data modules.
// Shared by the React component and the headless SVG string builder.
export function buildDataModulesPath(
  matrix: QRMatrixView,
  size: number,
  moduleSize: number,
  marginPx: number,
  dotStyle: DotStyle,
): string {
  let byShape = pathCache.get(matrix);
  if (!byShape) {
    byShape = new Map();
    pathCache.set(matrix, byShape);
  }
  const key = `${moduleSize}|${marginPx}|${dotStyle}`;
  const cached = byShape.get(key);
  if (cached !== undefined) return cached;

  const built =
    dotStyle === 'square'
      ? renderSquareRLE(matrix, size, moduleSize, marginPx)
      : renderModulesPer(matrix, size, moduleSize, marginPx, dotStyle);
  if (byShape.size >= PATH_CACHE_LIMIT) byShape.clear();
  byShape.set(key, built);
  return built;
}
