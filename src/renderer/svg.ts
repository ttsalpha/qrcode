import type { DotStyle } from '../types';
import { dotPath, moduleToPixel, type DotNeighbors } from './utils';

export interface ModulePath {
  path: string;
  row: number;
  col: number;
}

// Identify which modules belong to finder patterns
// Returns a Set of "row,col" keys for all modules in the 3 finder pattern regions
export function getFinderPatternModules(size: number): Set<string> {
  const modules = new Set<string>();
  // Positions: top-left (0,0), top-right (0, size-7), bottom-left (size-7, 0)
  // Each finder is 7x7 plus 1-module separator = 8x8 total reserved area
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
          modules.add(`${mr},${mc}`);
        }
      }
    }
  }
  return modules;
}

export interface RenderDataModulesResult {
  paths: ModulePath[];
}

// Render all non-finder-pattern dark modules
export function renderDataModules(
  matrix: boolean[][],
  moduleSize: number,
  marginPx: number,
  dotStyle: DotStyle,
): RenderDataModulesResult {
  const size = matrix.length;
  const finderModules = getFinderPatternModules(size);
  const paths: ModulePath[] = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (finderModules.has(`${r},${c}`)) continue;
      if (!matrix[r][c]) continue;

      const x = moduleToPixel(c, moduleSize, marginPx);
      const y = moduleToPixel(r, moduleSize, marginPx);

      let neighbors: DotNeighbors | undefined;
      if (dotStyle === 'rounded') {
        neighbors = {
          top: r > 0 && matrix[r - 1][c],
          right: c < size - 1 && matrix[r][c + 1],
          bottom: r < size - 1 && matrix[r + 1][c],
          left: c > 0 && matrix[r][c - 1],
        };
      }

      paths.push({
        path: dotPath(x, y, moduleSize, dotStyle, neighbors),
        row: r,
        col: c,
      });
    }
  }

  return { paths };
}

export interface FinderPatternInfo {
  startRow: number;
  startCol: number;
  x: number;
  y: number;
  outerSize: number;
  innerSize: number;
}

export function getFinderPatterns(
  size: number,
  moduleSize: number,
  marginPx: number,
): FinderPatternInfo[] {
  const outerSize = 7 * moduleSize;
  const innerSize = 3 * moduleSize;

  const corners: Array<{ startRow: number; startCol: number }> = [
    { startRow: 0, startCol: 0 },
    { startRow: 0, startCol: size - 7 },
    { startRow: size - 7, startCol: 0 },
  ];

  return corners.map(({ startRow, startCol }) => ({
    startRow,
    startCol,
    x: moduleToPixel(startCol, moduleSize, marginPx),
    y: moduleToPixel(startRow, moduleSize, marginPx),
    outerSize,
    innerSize,
  }));
}
