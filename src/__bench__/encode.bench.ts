import { bench, describe } from 'vitest';
import { encodeQR } from '../core/encode';
import { SHORT_ALNUM, MEDIUM_URL, LONG_ALNUM, LONG_NUMERIC } from './payloads';

describe('encodeQR', () => {
  bench('short alphanumeric (v1)', () => {
    encodeQR(SHORT_ALNUM, 'M');
  });

  bench('medium URL (byte, v7)', () => {
    encodeQR(MEDIUM_URL, 'M');
  });

  bench('long alphanumeric (1000 chars)', () => {
    encodeQR(LONG_ALNUM, 'M');
  });

  bench('long numeric (2000 digits)', () => {
    encodeQR(LONG_NUMERIC, 'M');
  });

  bench('forced v40 (medium URL)', () => {
    encodeQR(MEDIUM_URL, 'M', 40);
  });
});
