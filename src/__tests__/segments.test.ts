import { describe, it, expect } from 'vitest';
import {
  buildSegments,
  segmentsDataBytes,
  singleSegment,
  type Segment,
} from '../core/segments';
import type { EncodingMode } from '../types';

const utf8 = (s: string) => new TextEncoder().encode(s);

function singleModeOf(data: string): EncodingMode {
  if (/^[0-9]+$/.test(data)) return 'numeric';
  if (/^[0-9A-Z $%*+\-./:]+$/.test(data)) return 'alphanumeric';
  return 'byte';
}

// Cost of forcing one mode over the whole value: the baseline the search must
// never lose to.
function singleModeBytes(data: string, version: number): number {
  const mode = singleModeOf(data);
  const charCount = mode === 'byte' ? utf8(data).length : data.length;
  return segmentsDataBytes(
    [singleSegment(data, mode, charCount, utf8(data).length)],
    version,
  );
}

const CORPUS = [
  'HELLO WORLD',
  '0123456789',
  'hello world',
  'HTTPS://SHOP.EXAMPLE.COM/ORDER/1234567890123456789012345',
  'https://order.example.com/store/4821/table/17?session=abc&lang=en',
  'WIFI:S:MyNetwork5G;T:WPA;P:s3cr3tPassw0rd2024;;',
  '00020101021238570010A00000072701270006970436011312345678901230208QRIBFTTA53037045802VN62150811Thanh toan6304A1B2',
  'ABC' + '9'.repeat(120),
  '1'.repeat(300),
  'A'.repeat(300),
  'Xin chào 123 thế giới',
  'mixed ABC 999999999999999999 tail',
  '€'.repeat(5),
  'emoji 😀 and digits 12345678901234567890',
  'A1',
  '1',
  'a',
];

describe('buildSegments', () => {
  it('covers the input exactly, with contiguous ranges', () => {
    for (const value of CORPUS) {
      for (const version of [1, 10, 27]) {
        const segments = buildSegments(value, version);
        expect(segments.length).toBeGreaterThan(0);
        expect(segments[0].start).toBe(0);
        expect(segments[segments.length - 1].end).toBe(value.length);
        for (let i = 1; i < segments.length; i++) {
          expect(segments[i].start).toBe(segments[i - 1].end);
          expect(segments[i].byteStart).toBe(segments[i - 1].byteEnd);
        }
        // adjacent segments must differ in mode, or they would be one segment
        for (let i = 1; i < segments.length; i++) {
          expect(segments[i].mode).not.toBe(segments[i - 1].mode);
        }
      }
    }
  });

  it('reports charCount as UTF-8 bytes in byte mode, code points otherwise', () => {
    for (const value of CORPUS) {
      const segments = buildSegments(value, 10);
      for (const seg of segments) {
        const slice = value.slice(seg.start, seg.end);
        const expected =
          seg.mode === 'byte' ? utf8(slice).length : [...slice].length;
        expect(seg.charCount).toBe(expected);
        expect(seg.byteEnd - seg.byteStart).toBe(utf8(slice).length);
      }
    }
  });

  it('never costs more than encoding everything in one mode', () => {
    for (const value of CORPUS) {
      for (const version of [1, 10, 27]) {
        expect(
          segmentsDataBytes(buildSegments(value, version), version),
        ).toBeLessThanOrEqual(singleModeBytes(value, version));
      }
    }
  });

  it('beats single-mode on a digit run inside alphanumeric text', () => {
    const value = 'ABC' + '9'.repeat(120);
    const version = 10;
    expect(
      segmentsDataBytes(buildSegments(value, version), version),
    ).toBeLessThan(singleModeBytes(value, version));
    expect(buildSegments(value, version).map((s) => s.mode)).toEqual([
      'alphanumeric',
      'numeric',
    ]);
  });

  it('keeps a uniform string in a single segment', () => {
    const single = (v: string) => buildSegments(v, 10).map((s) => s.mode);
    expect(single('1'.repeat(50))).toEqual(['numeric']);
    expect(single('A'.repeat(50))).toEqual(['alphanumeric']);
    expect(single('a'.repeat(50))).toEqual(['byte']);
  });

  it('does not split a surrogate pair', () => {
    const value = 'abc😀def😀' + '1'.repeat(60);
    for (const version of [1, 10, 27]) {
      const segments = buildSegments(value, version);
      for (const seg of segments) {
        // A boundary inside a surrogate pair would leave a lone surrogate.
        const slice = value.slice(seg.start, seg.end);
        expect(slice).not.toMatch(/^[\uDC00-\uDFFF]/);
        expect(slice).not.toMatch(/[\uD800-\uDBFF]$/);
      }
      expect(segments.map((s) => value.slice(s.start, s.end)).join('')).toBe(
        value,
      );
    }
  });

  it('charCount fits the indicator width at the version it was built for', () => {
    for (const value of CORPUS) {
      for (const version of [1, 10, 27]) {
        for (const seg of buildSegments(value, version) as Segment[]) {
          const bits =
            seg.mode === 'numeric'
              ? version <= 9
                ? 10
                : version <= 26
                  ? 12
                  : 14
              : seg.mode === 'alphanumeric'
                ? version <= 9
                  ? 9
                  : version <= 26
                    ? 11
                    : 13
                : version <= 9
                  ? 8
                  : 16;
          expect(seg.charCount).toBeLessThan(2 ** bits);
        }
      }
    }
  });
});
