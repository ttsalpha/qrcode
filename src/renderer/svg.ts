import { moduleToPixel } from './utils';

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
