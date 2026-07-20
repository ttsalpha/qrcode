import { bench, describe } from 'vitest';
import { buildSVGString } from '../renderer/svgDirect';
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
