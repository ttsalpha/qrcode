import { describe, it, expect } from 'vitest';
import jsQR from 'jsqr';
import { computeQRMatrix } from '../core/matrix';
import { resolveLogoEcl, layoutLogo } from '../renderer/logoSafety';
import type { ErrorCorrectionLevel } from '../types';

// The safe-area budget only means something if a symbol with the logo punched
// out of it still reads. Nothing asserted that before: the budget test measured
// the cleared rect against the padded canvas, the same denominator the layout
// used, so the two agreed with each other while the logo grew with `margin`
// until the code stopped scanning.

const SCALE = 4;
const QUIET = 4;
const VALUES = [
  'HELLO WORLD',
  'https://shop.example.com/order?id=42&ref=qr',
  'A'.repeat(200),
  '8675309'.repeat(40),
  'Xin chào, mã QR 123 ø∆',
];

// moduleSize 1 keeps the layout in module units, so the cleared rect can be
// punched straight into the matrix.
function clearedModules(
  qrSize: number,
  margin: number,
  logoSize: number,
  ecLevel: ErrorCorrectionLevel | undefined,
  aspectRatio = 1,
) {
  const resolved = resolveLogoEcl(true, logoSize, ecLevel);
  const layout = layoutLogo({
    absoluteArea: resolved.absoluteArea,
    aspectRatio,
    ecLevel: resolved.ecLevel,
    qrSize,
    moduleSize: 1,
    marginPx: margin,
  });
  return {
    ecLevel: resolved.ecLevel,
    col: Math.round(layout.clearX - margin),
    row: Math.round(layout.clearY - margin),
    width: Math.round(layout.clearWidth),
    height: Math.round(layout.clearHeight),
  };
}

function rasterizeCleared(
  matrix: Uint8Array,
  size: number,
  clear: { col: number; row: number; width: number; height: number },
) {
  const side = (size + QUIET * 2) * SCALE;
  const rgba = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (matrix[row * size + col] !== 1) continue;
      const inLogo =
        row >= clear.row &&
        row < clear.row + clear.height &&
        col >= clear.col &&
        col < clear.col + clear.width;
      if (inLogo) continue;
      for (let y = 0; y < SCALE; y++) {
        for (let x = 0; x < SCALE; x++) {
          const py = (row + QUIET) * SCALE + y;
          const px = (col + QUIET) * SCALE + x;
          const i = (py * side + px) * 4;
          rgba[i] = 0;
          rgba[i + 1] = 0;
          rgba[i + 2] = 0;
        }
      }
    }
  }
  return { rgba, side };
}

describe('a symbol with the logo area cleared still decodes', () => {
  // `margin` is the one input that used to inflate the logo: it enlarges the
  // canvas without adding any error correction to spend on it.
  for (const margin of [0, 4, 8, 16, 20]) {
    for (const logoSize of [0.2, 0.4, 0.6, 0.8, 1.0]) {
      it(`margin ${margin}, logo.size ${logoSize}`, () => {
        for (const value of VALUES) {
          const probe = resolveLogoEcl(true, logoSize, undefined);
          const { matrix, size } = computeQRMatrix(value, probe.ecLevel);
          const clear = clearedModules(size, margin, logoSize, undefined);
          const { rgba, side } = rasterizeCleared(matrix, size, clear);
          expect(jsQR(rgba, side, side)?.data).toBe(value);
        }
      });
    }
  }

  it('keeps the cleared area within the level budget, measured on the symbol', () => {
    for (const margin of [0, 4, 20]) {
      for (const logoSize of [0.2, 0.6, 1.0]) {
        for (const qrSize of [21, 45, 101, 177]) {
          const clear = clearedModules(qrSize, margin, logoSize, undefined);
          const share = (clear.width * clear.height) / (qrSize * qrSize);
          // Level H is the largest budget any auto-picked level can reach.
          expect(share).toBeLessThanOrEqual(0.09 + 1e-9);
        }
      }
    }
  });
});

// The budget is an area, so a wide enough logo used to satisfy it with a
// one-module strip spanning the symbol, wiping out the timing patterns.
// toSVGString only ever laid out squares before logo.aspectRatio existed, so
// nothing here reached that shape.
describe('a wide logo still leaves the function patterns intact', () => {
  const RATIOS = [1, 2, 3, 5, 8, 12, 16, 24, 50];
  for (const aspectRatio of RATIOS) {
    for (const logoSize of [0.4, 0.7, 1.0]) {
      it(`aspectRatio ${aspectRatio}, logo.size ${logoSize}`, () => {
        for (const value of VALUES) {
          const probe = resolveLogoEcl(true, logoSize, undefined);
          const { matrix, size } = computeQRMatrix(value, probe.ecLevel);
          const clear = clearedModules(
            size,
            4,
            logoSize,
            undefined,
            aspectRatio,
          );
          // Row and column 6 carry the timing patterns, and the outer 8
          // modules on each side carry the finders and their separators.
          expect(clear.col).toBeGreaterThanOrEqual(8);
          expect(clear.row).toBeGreaterThanOrEqual(8);
          expect(clear.col + clear.width).toBeLessThanOrEqual(size - 8);
          expect(clear.row + clear.height).toBeLessThanOrEqual(size - 8);

          const { rgba, side } = rasterizeCleared(matrix, size, clear);
          expect(jsQR(rgba, side, side)?.data).toBe(value);
        }
      });
    }
  }
});
