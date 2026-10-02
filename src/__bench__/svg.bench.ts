import { bench, describe } from 'vitest';
import { toSVGString as buildSVGString } from '../core/svgString';
import { buildDataModulesPath } from '../core/paths';
import { computeQRMatrix } from '../core/matrix';
import { toSVGString } from '../utils';
import { MEDIUM_URL } from './payloads';

// Rotating through 32 distinct payloads defeats the 16-entry matrix LRU, so
// every iteration measures matrix generation + SVG string building.
let squareIdx = 0;
let roundedIdx = 0;
let circleIdx = 0;
let toSvgIdx = 0;

describe('buildSVGString cold (medium URL)', () => {
  bench('square', () => {
    buildSVGString({
      value: `${MEDIUM_URL}&i=${squareIdx++ & 31}`,
      dotStyle: 'square',
    });
  });

  bench('rounded', () => {
    buildSVGString({
      value: `${MEDIUM_URL}&i=${roundedIdx++ & 31}`,
      dotStyle: 'rounded',
    });
  });

  bench('circle', () => {
    buildSVGString({
      value: `${MEDIUM_URL}&i=${circleIdx++ & 31}`,
      dotStyle: 'circle',
    });
  });
});

describe('buildSVGString cache hit (medium URL)', () => {
  bench('square, repeated value', () => {
    buildSVGString({ value: MEDIUM_URL, dotStyle: 'square' });
  });
});

describe('toSVGString', () => {
  bench('medium URL, cold matrix', () => {
    toSVGString({ value: `${MEDIUM_URL}&i=${toSvgIdx++ & 31}` });
  });
});

// The path is over 90% of buildSVGString, and nothing measured it on its own or
// at a high version, where it is the only part that grows with the symbol.
describe('buildDataModulesPath', () => {
  for (const [label, value, forced] of [
    ['v7', MEDIUM_URL, undefined],
    ['v40', '1'.repeat(7000), 40],
  ] as const) {
    const { matrix, size } = computeQRMatrix(value, 'L', forced);
    const moduleSize = 256 / (size + 8);
    const marginPx = 4 * moduleSize;
    for (const dotStyle of ['square', 'circle', 'rounded'] as const) {
      bench(`${label} ${dotStyle}`, () => {
        // subarray() is a fresh view over the same bytes, so each iteration
        // misses the per-matrix path cache without copying or re-encoding.
        buildDataModulesPath(
          matrix.subarray(),
          size,
          moduleSize,
          marginPx,
          dotStyle,
        );
      });
    }
  }
});
