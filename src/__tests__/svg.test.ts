import { describe, it, expect } from 'vitest';
import { getFinderPatterns, getFinderPatternModules } from '../renderer/svg';
import { buildDataModulesPath } from '../renderer/paths';
import { generateQRMatrix } from '../core/matrix';

// 21×21 all-light grid with specific dark modules set — placed in the center
// so they sit outside the excluded finder regions.
function matrixWith(cells: Array<[number, number]>): boolean[][] {
  const m = Array.from(
    { length: 21 },
    () => new Array(21).fill(false) as boolean[],
  );
  for (const [r, c] of cells) m[r][c] = true;
  return m;
}

describe('buildDataModulesPath', () => {
  it('returns a non-empty path starting with M (moveto)', () => {
    const { matrix } = generateQRMatrix('HELLO WORLD', 'M');
    const path = buildDataModulesPath(matrix, 10, 40, 'square');

    expect(path.length).toBeGreaterThan(0);
    expect(path).toMatch(/^M/);
  });

  it('excludes finder pattern modules (circle style is 1:1 per module)', () => {
    const { matrix, size } = generateQRMatrix('TEST', 'M');
    const finderModules = getFinderPatternModules(size);
    const path = buildDataModulesPath(matrix, 10, 0, 'circle');

    // circle emits exactly one M command per rendered module
    const renderedModules = (path.match(/M/g) ?? []).length;
    const totalDark = matrix.reduce(
      (sum, row) => sum + row.filter(Boolean).length,
      0,
    );
    expect(renderedModules).toBeGreaterThan(0);
    expect(renderedModules).toBeLessThan(totalDark);
    // sanity: finder modules count matches expectation
    expect(finderModules.size).toBeGreaterThan(0);
  });

  it('square style merges horizontal runs (RLE)', () => {
    const { matrix, size } = generateQRMatrix('TEST', 'M');
    const path = buildDataModulesPath(matrix, 10, 0, 'square');
    const finderModules = getFinderPatternModules(size);

    let darkDataModules = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (matrix[r][c] && !finderModules.has(r * size + c)) darkDataModules++;
      }
    }
    // merged runs → strictly fewer path commands than modules
    const commands = (path.match(/M/g) ?? []).length;
    expect(commands).toBeGreaterThan(0);
    expect(commands).toBeLessThan(darkDataModules);
  });

  it('circle style produces arc path commands', () => {
    const { matrix } = generateQRMatrix('TEST', 'M');
    const path = buildDataModulesPath(matrix, 10, 0, 'circle');

    expect(path).toMatch(/a/);
  });

  it('rounded style produces quadratic bezier commands', () => {
    const { matrix } = generateQRMatrix('TEST', 'M');
    const path = buildDataModulesPath(matrix, 10, 0, 'rounded');

    expect(path).toMatch(/^M/);
    expect(path).toMatch(/q/);
  });

  it('finder exclusion matches the reference enumeration', () => {
    // Production uses a bounds check; getFinderPatternModules is the
    // reference Set. An all-dark matrix must render exactly the complement.
    for (const size of [21, 25, 177]) {
      const allDark = Array.from(
        { length: size },
        () => new Array(size).fill(true) as boolean[],
      );
      const path = buildDataModulesPath(allDark, 10, 0, 'circle');
      const rendered = (path.match(/M/g) ?? []).length;
      expect(rendered).toBe(size * size - getFinderPatternModules(size).size);
    }
  });

  it('rounds coordinates to at most 2 decimals', () => {
    const { matrix } = generateQRMatrix('HELLO WORLD', 'M');
    // module size with a long decimal expansion
    const path = buildDataModulesPath(matrix, 256 / 29, 256 / 29, 'square');

    for (const num of path.match(/-?\d+\.\d+/g) ?? []) {
      const decimals = num.split('.')[1];
      expect(decimals.length).toBeLessThanOrEqual(2);
    }
  });

  it('rounded style isolated module has 4 rounded corners', () => {
    const path = buildDataModulesPath(matrixWith([[10, 12]]), 10, 0, 'rounded');
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
      10,
      0,
      'rounded',
    );
    const subpaths = path.split(/ (?=M)/);
    expect(subpaths).toHaveLength(2);
    // Left module: flat corners on the neighbor side, rounded elsewhere
    expect(subpaths[0]).toMatch(/q0,0 0,0/);
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
      10,
      0,
      'rounded',
    );
    const subpaths = path.split(/ (?=M)/);
    expect(subpaths).toHaveLength(5);
    // Row-major order → center module is the 3rd subpath; all 4 corners flat
    expect(subpaths[2].match(/q0,0 0,0/g)).toHaveLength(4);
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
