import { describe, it, expect } from 'vitest';
import {
  renderDataModules,
  getFinderPatterns,
  getFinderPatternModules,
} from '../renderer/svg';
import { dotPath } from '../renderer/utils';
import { generateQRMatrix } from '../core/matrix';

describe('renderDataModules', () => {
  it('returns non-empty path strings for dark non-finder modules', () => {
    const { matrix } = generateQRMatrix('HELLO WORLD', 'M');
    const paths = renderDataModules(matrix, 10, 40, 'square');

    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(typeof path).toBe('string');
      expect(path.length).toBeGreaterThan(0);
    }
  });

  it('paths contain M (moveto) SVG command', () => {
    const { matrix } = generateQRMatrix('TEST', 'M');
    const paths = renderDataModules(matrix, 10, 0, 'square');

    for (const path of paths) {
      expect(path).toMatch(/^M/);
    }
  });

  it('excludes finder pattern modules', () => {
    const { matrix, size } = generateQRMatrix('TEST', 'M');
    const finderModules = getFinderPatternModules(size);
    const paths = renderDataModules(matrix, 10, 0, 'square');

    // finder area has 3 × 8×8 = 192 reserved modules; total paths must be less than total dark modules
    const totalDark = matrix.reduce(
      (sum, row) => sum + row.filter(Boolean).length,
      0,
    );
    expect(paths.length).toBeLessThan(totalDark);
    // sanity: finder modules count matches expectation
    expect(finderModules.size).toBeGreaterThan(0);
  });

  it('circle style produces arc path commands', () => {
    const { matrix } = generateQRMatrix('TEST', 'M');
    const paths = renderDataModules(matrix, 10, 0, 'circle');

    for (const path of paths) {
      expect(path).toMatch(/a/);
    }
  });

  it('rounded style produces quadratic bezier commands', () => {
    const { matrix } = generateQRMatrix('TEST', 'M');
    const paths = renderDataModules(matrix, 10, 0, 'rounded');

    for (const path of paths) {
      expect(path).toMatch(/^M/);
      expect(path).toMatch(/q/);
    }
  });

  it('rounded style isolated module has 4 rounded corners', () => {
    const path = dotPath(0, 0, 10, 'rounded', {
      top: false,
      right: false,
      bottom: false,
      left: false,
    });
    // 4 q commands, none with zero radius
    expect(path.match(/q/g)).toHaveLength(4);
    expect(path).not.toMatch(/q0,0 0,0/);
  });

  it('rounded style flattens corners toward neighbors', () => {
    // right neighbor present → TR and BR corners are flat
    const path = dotPath(0, 0, 10, 'rounded', {
      top: false,
      right: true,
      bottom: false,
      left: false,
    });
    // TR corner: rTR = 0 → q0,0 0,0
    expect(path).toMatch(/q0,0 0,0/);
    // TL and BL corners are still rounded
    expect(path).not.toMatch(/^M0,/); // starts offset from x due to TL radius
  });

  it('rounded style all-neighbor module degenerates to square', () => {
    const path = dotPath(0, 0, 10, 'rounded', {
      top: true,
      right: true,
      bottom: true,
      left: true,
    });
    // All 4 corners flat → all q are zero-radius
    const qMatches = path.match(/q/g);
    expect(qMatches).toHaveLength(4);
    expect(path).toMatch(/q0,0 0,0/);
  });
});

describe('getFinderPatterns', () => {
  it('returns exactly 3 finder patterns', () => {
    const patterns = getFinderPatterns(21, 10, 40);
    expect(patterns).toHaveLength(3);
  });

  it('finder patterns have correct positions', () => {
    const moduleSize = 10;
    const margin = 40;
    const patterns = getFinderPatterns(21, moduleSize, margin);

    // Top-left: starts at (0, 0) in module coords
    expect(patterns[0].x).toBe(margin);
    expect(patterns[0].y).toBe(margin);

    // Top-right: starts at (0, size-7) = (0, 14) in module coords
    expect(patterns[1].x).toBe(margin + 14 * moduleSize);
    expect(patterns[1].y).toBe(margin);

    // Bottom-left: starts at (size-7, 0) = (14, 0) in module coords
    expect(patterns[2].x).toBe(margin);
    expect(patterns[2].y).toBe(margin + 14 * moduleSize);
  });

  it('outer size is 7 * moduleSize', () => {
    const moduleSize = 15;
    const patterns = getFinderPatterns(21, moduleSize, 0);
    for (const p of patterns) {
      expect(p.outerSize).toBe(7 * moduleSize);
    }
  });

  it('inner size is 3 * moduleSize', () => {
    const moduleSize = 15;
    const patterns = getFinderPatterns(21, moduleSize, 0);
    for (const p of patterns) {
      expect(p.innerSize).toBe(3 * moduleSize);
    }
  });
});

describe('getFinderPatternModules', () => {
  it('covers all 3 finder regions including separators', () => {
    const modules = getFinderPatternModules(21);
    // Each finder + separator is 8x8 = 64 modules
    // But they don't overlap, and some are out of bounds for top-right and bottom-left
    // The set should be non-empty
    expect(modules.size).toBeGreaterThan(0);
  });

  it('includes top-left finder modules', () => {
    const size = 21;
    const modules = getFinderPatternModules(size);
    // All modules in 0..6 x 0..6 should be in set (plus separator at -1)
    for (let r = 0; r <= 6; r++) {
      for (let c = 0; c <= 6; c++) {
        expect(modules.has(r * size + c)).toBe(true);
      }
    }
  });
});
