import type { CornerDotStyle, CornerSquareStyle } from '../types';

export function squarePath(x: number, y: number, s: number): string {
  return `M${x},${y}h${s}v${s}h${-s}z`;
}

// Builds a rounded rectangle path using quadratic bezier curves for each corner.
// The radius is clamped so it never exceeds half the shorter side (prevents overlap).
function roundedRect(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): string {
  const cr = Math.min(r, w / 2, h / 2);
  return (
    `M${x + cr},${y}` +
    `h${w - 2 * cr}` +
    `q${cr},0 ${cr},${cr}` +
    `v${h - 2 * cr}` +
    `q0,${cr} ${-cr},${cr}` +
    `h${-(w - 2 * cr)}` +
    `q${-cr},0 ${-cr},${-cr}` +
    `v${-(h - 2 * cr)}` +
    `q0,${-cr} ${cr},${-cr}z`
  );
}

// Returns an SVG path for the 3×3 inner dot of a finder pattern corner.
export function cornerDotPath(
  x: number,
  y: number,
  size: number,
  style: CornerDotStyle,
): string {
  if (style === 'circle') {
    const cx = x + size / 2;
    const cy = y + size / 2;
    const r = size / 2;
    return (
      `M${cx - r},${cy}` +
      `a${r},${r} 0 1,0 ${r * 2},0` +
      `a${r},${r} 0 1,0 ${-r * 2},0z`
    );
  }
  if (style === 'rounded') {
    return roundedRect(x, y, size, size, size * 0.3);
  }
  return squarePath(x, y, size);
}

// Returns an SVG path for the outer ring (frame) of a finder pattern corner.
//
// The frame is rendered as two overlapping subpaths — an outer rect and an inner cutout —
// combined into a single <path> element. When the element uses fillRule="evenodd", the
// overlapping region becomes transparent, producing the hollow ring effect.
//
// size is always 7 * moduleSize (the full finder width in pixels).
// The inner void is 5 × 5 modules; both dimensions are derived from size to stay
// proportional regardless of the actual pixel density.
export function cornerSquarePath(
  x: number,
  y: number,
  size: number,
  style: CornerSquareStyle,
): string {
  // size = 7 * moduleSize, so size/7 recovers one module in pixels
  const moduleUnit = size / 7;
  // inner void spans 5 modules; offset is 1 module from the outer edge
  const inner = size - 2 * moduleUnit;
  const iOffset = moduleUnit;

  if (style === 'square') {
    const outer = squarePath(x, y, size);
    const cut = squarePath(x + iOffset, y + iOffset, inner);
    return `${outer} ${cut}`;
  }

  if (style === 'rounded') {
    const outer = roundedRect(x, y, size, size, size * 0.15);
    const cut = squarePath(x + iOffset, y + iOffset, inner);
    return `${outer} ${cut}`;
  }

  if (style === 'circle') {
    const cx = x + size / 2;
    const cy = y + size / 2;
    const ro = size / 2;
    const ri = inner / 2;
    const circlePath = (r: number) =>
      `M${cx - r},${cy}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 ${-r * 2},0z`;
    return `${circlePath(ro)} ${circlePath(ri)}`;
  }

  // extra-rounded: both outer and inner cutout get rounded corners
  const outer = roundedRect(x, y, size, size, size * 0.35);
  const cut = roundedRect(x + iOffset, y + iOffset, inner, inner, inner * 0.2);
  return `${outer} ${cut}`;
}

// Converts a module grid index to its pixel position, accounting for the quiet zone margin.
export function moduleToPixel(
  moduleIndex: number,
  moduleSize: number,
  margin: number,
): number {
  return margin + moduleIndex * moduleSize;
}
