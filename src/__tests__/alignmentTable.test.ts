import { describe, it, expect } from 'vitest';
import { alignmentCenters } from '../core/matrix';

// Frozen snapshot of ISO/IEC 18004 Annex E. matrix.ts derives these centers from
// a formula (start at 6, end at 4·version+10, interior points evenly spaced on an
// even step) with version 32 as the documented exception, instead of storing the
// table. This proves the derivation reproduces Annex E exactly for all 40
// versions, the same way ecTable.test.ts pins Table 9.
//
// Without it the only coverage was v1 and v2, which is how the v31/v32 regression
// reached a release.
// prettier-ignore
const ANNEX_E: readonly (readonly number[])[] = [
  [],                            // v1 (no alignment patterns)
  [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
  [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54],
  [6, 32, 58], [6, 34, 62],
  [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78],
  [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90],
  [6, 28, 50, 72, 94], [6, 26, 50, 74, 98], [6, 30, 54, 78, 102],
  [6, 28, 54, 80, 106], [6, 32, 58, 84, 110], [6, 30, 58, 86, 114],
  [6, 34, 62, 90, 118],
  [6, 26, 50, 74, 98, 122], [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130],
  [6, 30, 56, 82, 108, 134], [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142],
  [6, 34, 62, 90, 118, 146],
  [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154],
  [6, 28, 54, 80, 106, 132, 158], [6, 32, 58, 84, 110, 136, 162],
  [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170],
];

describe('alignmentCenters matches ISO 18004 Annex E', () => {
  for (let version = 1; version <= 40; version++) {
    it(`v${version}`, () => {
      expect(alignmentCenters(version)).toEqual([...ANNEX_E[version - 1]]);
    });
  }
});

// Structural properties Annex E states in prose. They hold independently of the
// frozen table above, so a typo in either one shows up here.
describe('Annex E structural invariants', () => {
  it('starts at 6 and ends one module inside the bottom-right finder', () => {
    for (let version = 2; version <= 40; version++) {
      const centers = alignmentCenters(version);
      const size = version * 4 + 17;
      expect(centers[0]).toBe(6);
      expect(centers[centers.length - 1]).toBe(size - 7);
    }
  });

  it('spaces the interior centers evenly, on an even step', () => {
    for (let version = 2; version <= 40; version++) {
      const centers = alignmentCenters(version);
      // The first gap may be wider; every later gap must be identical and even.
      const steps = new Set<number>();
      for (let i = 2; i < centers.length; i++) {
        steps.add(centers[i] - centers[i - 1]);
      }
      expect(steps.size).toBeLessThanOrEqual(1);
      for (const step of steps) expect(step % 2).toBe(0);
    }
  });

  it('has floor(version / 7) + 2 centers, and none for v1', () => {
    expect(alignmentCenters(1)).toEqual([]);
    for (let version = 2; version <= 40; version++) {
      expect(alignmentCenters(version)).toHaveLength(
        Math.floor(version / 7) + 2,
      );
    }
  });
});
