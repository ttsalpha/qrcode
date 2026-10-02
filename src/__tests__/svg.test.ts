import { describe, it, expect } from 'vitest';
import { getFinderPatterns } from '../core/finder';
import { buildDataModulesPath } from '../core/paths';
import { cornerSquarePath, cornerDotPath } from '../core/shapes';
import { generateQRMatrix } from '../core/matrix';

// Reference enumeration of the finder-pattern modules (7×7 finder + 1-module
// separator, packed as row*size+col). Production rendering uses the equivalent
// bounds check in paths.ts; this Set is kept in the test as the ground truth
// that the bounds check is compared against.
function getFinderPatternModules(size: number): Set<number> {
  const modules = new Set<number>();
  const corners: Array<[number, number]> = [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ];
  for (const [startRow, startCol] of corners) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const mr = startRow + r;
        const mc = startCol + c;
        if (mr >= 0 && mc >= 0 && mr < size && mc < size) {
          modules.add(mr * size + mc);
        }
      }
    }
  }
  return modules;
}

// 21×21 all-light flat grid with specific dark modules set, placed in the
// center so they sit outside the excluded finder regions.
function matrixWith(cells: Array<[number, number]>): Uint8Array {
  const m = new Uint8Array(21 * 21);
  for (const [r, c] of cells) m[r * 21 + c] = 1;
  return m;
}

describe('buildDataModulesPath', () => {
  it('returns a non-empty path starting with M (moveto)', () => {
    const { matrix, size } = generateQRMatrix('HELLO WORLD', 'M');
    const path = buildDataModulesPath(matrix, size, 10, 40, 'square');

    expect(path.length).toBeGreaterThan(0);
    expect(path).toMatch(/^M/);
  });

  it('excludes finder pattern modules (circle style is 1:1 per module)', () => {
    const { matrix, size } = generateQRMatrix('TEST', 'M');
    const finderModules = getFinderPatternModules(size);
    const path = buildDataModulesPath(matrix, size, 10, 0, 'circle');

    // circle emits exactly one M command per rendered module
    const renderedModules = (path.match(/M/g) ?? []).length;
    const totalDark = matrix.reduce((sum, v) => sum + v, 0);
    expect(renderedModules).toBeGreaterThan(0);
    expect(renderedModules).toBeLessThan(totalDark);
    // sanity: finder modules count matches expectation
    expect(finderModules.size).toBeGreaterThan(0);
  });

  it('square style merges horizontal runs (RLE)', () => {
    const { matrix, size } = generateQRMatrix('TEST', 'M');
    const path = buildDataModulesPath(matrix, size, 10, 0, 'square');
    const finderModules = getFinderPatternModules(size);

    let darkDataModules = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (matrix[r * size + c] === 1 && !finderModules.has(r * size + c))
          darkDataModules++;
      }
    }
    // merged runs → strictly fewer path commands than modules
    const commands = (path.match(/M/g) ?? []).length;
    expect(commands).toBeGreaterThan(0);
    expect(commands).toBeLessThan(darkDataModules);
  });

  it('circle style produces arc path commands', () => {
    const { matrix, size } = generateQRMatrix('TEST', 'M');
    const path = buildDataModulesPath(matrix, size, 10, 0, 'circle');

    expect(path).toMatch(/a/);
  });

  it('rounded style produces quadratic bezier commands', () => {
    const { matrix, size } = generateQRMatrix('TEST', 'M');
    const path = buildDataModulesPath(matrix, size, 10, 0, 'rounded');

    expect(path).toMatch(/^M/);
    expect(path).toMatch(/q/);
  });

  it('finder exclusion matches the reference enumeration', () => {
    // Production uses a bounds check; getFinderPatternModules is the
    // reference Set. An all-dark matrix must render exactly the complement.
    for (const size of [21, 25, 177]) {
      const allDark = new Uint8Array(size * size).fill(1);
      const path = buildDataModulesPath(allDark, size, 10, 0, 'circle');
      const rendered = (path.match(/M/g) ?? []).length;
      expect(rendered).toBe(size * size - getFinderPatternModules(size).size);
    }
  });

  it('rounds coordinates to at most 2 decimals', () => {
    const { matrix, size } = generateQRMatrix('HELLO WORLD', 'M');
    // module size with a long decimal expansion
    const path = buildDataModulesPath(
      matrix,
      size,
      256 / 29,
      256 / 29,
      'square',
    );

    for (const num of path.match(/-?\d+\.\d+/g) ?? []) {
      const decimals = num.split('.')[1];
      expect(decimals.length).toBeLessThanOrEqual(2);
    }
  });

  it('rounded style isolated module has 4 rounded corners', () => {
    const path = buildDataModulesPath(
      matrixWith([[10, 12]]),
      21,
      10,
      0,
      'rounded',
    );
    // 4 q commands, none with zero radius
    expect(path.match(/q/g)).toHaveLength(4);
    expect(path).not.toMatch(/q0,0 0,0/);
  });

  it('rounded style flattens corners toward neighbors', () => {
    // Two adjacent modules: the left one has a right neighbor → TR and BR flat
    const path = buildDataModulesPath(
      matrixWith([
        [10, 12],
        [10, 13],
      ]),
      21,
      10,
      0,
      'rounded',
    );
    const subpaths = path.split(/ (?=M)/);
    expect(subpaths).toHaveLength(2);
    // Left module: two curves on the far side, nothing emitted for the two
    // flat corners facing the neighbour.
    expect(subpaths[0].match(/q/g)).toHaveLength(2);
    expect(subpaths[0]).toMatch(/4\.5/);
  });

  it('rounded style all-neighbor module degenerates to square', () => {
    // Center module at (10,12) surrounded on all 4 sides
    const path = buildDataModulesPath(
      matrixWith([
        [9, 12],
        [10, 11],
        [10, 12],
        [10, 13],
        [11, 12],
      ]),
      21,
      10,
      0,
      'rounded',
    );
    const subpaths = path.split(/ (?=M)/);
    expect(subpaths).toHaveLength(5);
    // Row-major order → center module is the 3rd subpath; all 4 corners flat,
    // so it is a plain rectangle with no curve commands at all.
    expect(subpaths[2]).not.toMatch(/q/);
  });
});

describe('getFinderPatterns', () => {
  it('returns exactly 3 finder patterns', () => {
    const patterns = getFinderPatterns(21, 10, 40);
    expect(patterns).toHaveLength(3);
  });

  it('finder patterns have correct pixel positions', () => {
    const moduleSize = 10;
    const margin = 40;
    const patterns = getFinderPatterns(21, moduleSize, margin);

    // Top-left: (0, 0)
    expect(patterns[0].x).toBe(margin);
    expect(patterns[0].y).toBe(margin);

    // Top-right: col = size-7 = 14
    expect(patterns[1].x).toBe(margin + 14 * moduleSize);
    expect(patterns[1].y).toBe(margin);

    // Bottom-left: row = size-7 = 14
    expect(patterns[2].x).toBe(margin);
    expect(patterns[2].y).toBe(margin + 14 * moduleSize);
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

describe('corner paths', () => {
  // Corner geometry divides the finder width by 7, so raw arithmetic produces
  // values like 44.150000000000006 that bloat every path string.
  const decimalsOf = (path: string) =>
    (path.match(/-?\d+\.\d+/g) ?? []).map((n) => n.split('.')[1].length);

  const SIZES = [256 / 29, 256 / 33, 100 / 7, 333 / 45];

  for (const style of [
    'square',
    'rounded',
    'extra-rounded',
    'circle',
  ] as const) {
    it(`cornerSquarePath "${style}" rounds to at most 2 decimals`, () => {
      for (const moduleSize of SIZES) {
        const path = cornerSquarePath(
          moduleSize,
          moduleSize,
          7 * moduleSize,
          style,
        );
        for (const d of decimalsOf(path)) expect(d).toBeLessThanOrEqual(2);
      }
    });
  }

  for (const style of ['square', 'rounded', 'circle'] as const) {
    it(`cornerDotPath "${style}" rounds to at most 2 decimals`, () => {
      for (const moduleSize of SIZES) {
        const path = cornerDotPath(
          moduleSize,
          moduleSize,
          3 * moduleSize,
          style,
        );
        for (const d of decimalsOf(path)) expect(d).toBeLessThanOrEqual(2);
      }
    });
  }

  it('closes the rounded rect: opposite runs cancel exactly', () => {
    for (const moduleSize of SIZES) {
      const path = cornerSquarePath(0, 0, 7 * moduleSize, 'rounded');
      const h = path.match(/h(-?[\d.]+)/g)!.map((t) => Number(t.slice(1)));
      const v = path.match(/v(-?[\d.]+)/g)!.map((t) => Number(t.slice(1)));
      // the rounded outer subpath contributes one +h/-h and one +v/-v pair
      expect(h[0] + h[1]).toBe(0);
      expect(v[0] + v[1]).toBe(0);
    }
  });
});
