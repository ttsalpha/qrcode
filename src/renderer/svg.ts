import type { DotStyle } from '../types';
import { dotPath, moduleToPixel, type DotNeighbors } from './utils';

// Identify which modules belong to finder patterns
// Returns a Set of packed integer keys (row * size + col) for all modules in the 3 finder regions
export function getFinderPatternModules(size: number): Set<number> {
  const modules = new Set<number>();
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
          modules.add(mr * size + mc);
        }
      }
    }
  }
  return modules;
}

// Render all non-finder-pattern dark modules, returns one SVG path string per module
export function renderDataModules(
  matrix: boolean[][],
  moduleSize: number,
  marginPx: number,
  dotStyle: DotStyle,
): string[] {
  const size = matrix.length;
  const finderModules = getFinderPatternModules(size);
  const paths: string[] = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (finderModules.has(r * size + c)) continue;
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

      paths.push(dotPath(x, y, moduleSize, dotStyle, neighbors));
    }
  }

  return paths;
}

export interface FinderPatternInfo {
  x: number;
  y: number;
}

export function getFinderPatterns(
  size: number,
  moduleSize: number,
  marginPx: number,
): FinderPatternInfo[] {
  const corners: Array<[number, number]> = [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ];

  return corners.map(([row, col]) => ({
    x: moduleToPixel(col, moduleSize, marginPx),
    y: moduleToPixel(row, moduleSize, marginPx),
  }));
}
