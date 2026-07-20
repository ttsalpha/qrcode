import { bench, describe } from 'vitest';
import { computeQRMatrix, generateQRMatrix } from '../core/matrix';
import { SHORT_ALNUM, MEDIUM_URL, LONG_ALNUM, LONG_NUMERIC } from './payloads';

// computeQRMatrix bypasses the LRU cache — these measure the full
// encode + placement + mask-selection pipeline on every iteration.
describe('computeQRMatrix (cold)', () => {
  bench('short alphanumeric (v1)', () => {
    computeQRMatrix(SHORT_ALNUM, 'M');
  });

  bench('medium URL (byte, v7)', () => {
    computeQRMatrix(MEDIUM_URL, 'M');
  });

  bench('long alphanumeric (1000 chars)', () => {
    computeQRMatrix(LONG_ALNUM, 'M');
  });

  bench('long numeric (2000 digits)', () => {
    computeQRMatrix(LONG_NUMERIC, 'M');
  });

  bench('forced v40 (medium URL)', () => {
    computeQRMatrix(MEDIUM_URL, 'M', 40);
  });
});

// Repeated identical inputs — measures the LRU cache-hit path that repeated
// renders of the same value take in production.
describe('generateQRMatrix (cache hit)', () => {
  bench('medium URL (byte, v7)', () => {
    generateQRMatrix(MEDIUM_URL, 'M');
  });
});
