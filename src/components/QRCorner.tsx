import * as React from 'react';
import type { CornerDotStyle, CornerSquareStyle } from '../types';
import { cornerPaths } from '../renderer/utils';

interface QRCornerProps {
  x: number;
  y: number;
  moduleSize: number;
  squareStyle: CornerSquareStyle;
  squareColor: string;
  dotStyle: CornerDotStyle;
  dotColor: string;
}

// Renders one finder pattern corner as two layered SVG paths.
//
// QR finder pattern anatomy (each corner is identical):
//   - 7×7 outer dark ring (1 module thick border)
//   - 5×5 white interior (provided by the background)
//   - 3×3 dark center dot
//
// The outer ring uses fillRule="evenodd" so the inner cutout becomes transparent,
// revealing the background color instead of overpainting it.
const QRCornerInner = function QRCorner({
  x,
  y,
  moduleSize,
  squareStyle,
  squareColor,
  dotStyle,
  dotColor,
}: QRCornerProps): React.JSX.Element {
  const { square, dot } = cornerPaths(x, y, moduleSize, squareStyle, dotStyle);

  return (
    <g>
      <path d={square} fill={squareColor} fillRule="evenodd" />
      <path d={dot} fill={dotColor} />
    </g>
  );
};

// Explicit for the same reason as <QRCode>: minification drops the inferred
// name, and esbuild's keepNames costs 881 gzipped bytes to restore it.
export const QRCorner = /* @__PURE__ */ React.memo(QRCornerInner);
QRCorner.displayName = 'QRCorner';
