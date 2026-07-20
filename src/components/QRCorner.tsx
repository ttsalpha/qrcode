import * as React from 'react';
import type { CornerDotStyle, CornerSquareStyle } from '../types';
import { cornerSquarePath, cornerDotPath } from '../renderer/utils';

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
export const QRCorner = /* @__PURE__ */ React.memo(function QRCorner({
  x,
  y,
  moduleSize,
  squareStyle,
  squareColor,
  dotStyle,
  dotColor,
}: QRCornerProps): React.JSX.Element {
  // finder pattern anatomy: 7×7 outer ring, 3×3 center dot, 2-module gap between them
  const outerSize = 7 * moduleSize;
  const innerSize = 3 * moduleSize;
  const innerOffset = 2 * moduleSize;

  const squarePath = cornerSquarePath(x, y, outerSize, squareStyle);
  const dotPathStr = cornerDotPath(
    x + innerOffset,
    y + innerOffset,
    innerSize,
    dotStyle,
  );

  return (
    <g>
      <path d={squarePath} fill={squareColor} fillRule="evenodd" />
      <path d={dotPathStr} fill={dotColor} />
    </g>
  );
});
