'use client';

import * as React from 'react';
import type { QRCodeProps, CornerDotStyle, CornerSquareStyle } from '../types';
import { generateQRMatrix } from '../core/matrix';
import { renderDataModules, getFinderPatterns } from '../renderer/svg';
import { QRCorner } from './QRCorner';

// Block javascript: and non-image data: URLs; allow everything else
// (https, http, relative paths, blob:, data:image/…).
function isSafeSrc(src: string): boolean {
  const s = src.trim().toLowerCase();
  if (s.startsWith('javascript:')) return false;
  if (s.startsWith('data:') && !s.startsWith('data:image/')) return false;
  return true;
}

export const QRCode = React.memo(function QRCode({
  value,
  size = 256,
  margin = 4,
  dotStyle = 'square',
  dotColor = '#000000',
  backgroundColor = '#ffffff',
  corner,
  logo,
  qr,
  className,
  style,
}: QRCodeProps): React.JSX.Element {
  const ecLevel = qr?.errorCorrectionLevel ?? 'M';
  const requestedVersion = qr?.version;

  const { matrix, size: qrSize } = React.useMemo(
    () => generateQRMatrix(value, ecLevel, requestedVersion),
    [value, ecLevel, requestedVersion],
  );

  // Module size in pixels (accounting for margin)
  const totalModules = qrSize + margin * 2;
  const moduleSize = size / totalModules;
  const marginPx = margin * moduleSize;

  // Actual SVG dimensions
  const svgSize = moduleSize * (qrSize + margin * 2);

  const squareStyle: CornerSquareStyle = corner?.square?.style ?? 'square';
  const squareColor = corner?.square?.color ?? dotColor;
  const defaultCornerDotStyle: CornerDotStyle =
    squareStyle === 'extra-rounded' ? 'rounded' : 'square';
  const cornerDotStyleVal: CornerDotStyle =
    corner?.dot?.style ?? defaultCornerDotStyle;
  const cornerDotColor = corner?.dot?.color ?? dotColor;

  const { paths } = React.useMemo(
    () => renderDataModules(matrix, moduleSize, marginPx, dotStyle),
    [matrix, moduleSize, marginPx, dotStyle],
  );
  const finderPatterns = React.useMemo(
    () => getFinderPatterns(qrSize, moduleSize, marginPx),
    [qrSize, moduleSize, marginPx],
  );

  const logoWidth = logo?.width ?? svgSize * 0.2;
  const logoHeight = logo?.height ?? svgSize * 0.2;
  const logoPadding = logo?.padding ?? 0;
  const logoX = (svgSize - logoWidth) / 2 - logoPadding;
  const logoY = (svgSize - logoHeight) / 2 - logoPadding;
  const logoPaddedWidth = logoWidth + logoPadding * 2;
  const logoPaddedHeight = logoHeight + logoPadding * 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${svgSize} ${svgSize}`}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
    >
      {/* Background */}
      {backgroundColor !== 'transparent' && (
        <rect width={svgSize} height={svgSize} fill={backgroundColor} />
      )}

      {/* Data modules */}
      {paths.map(({ path, row, col }) => (
        <path key={`dot-${row}-${col}`} d={path} fill={dotColor} />
      ))}

      {/* Finder patterns (corners) */}
      {finderPatterns.map((fp, idx) => (
        <QRCorner
          key={`corner-${idx}`}
          x={fp.x}
          y={fp.y}
          moduleSize={moduleSize}
          squareStyle={squareStyle}
          squareColor={squareColor}
          dotStyle={cornerDotStyleVal}
          dotColor={cornerDotColor}
        />
      ))}

      {/* Logo */}
      {logo && logo.element ? (
        <foreignObject
          x={logoX}
          y={logoY}
          width={logoPaddedWidth}
          height={logoPaddedHeight}
        >
          {logo.element}
        </foreignObject>
      ) : logo?.src && isSafeSrc(logo.src) ? (
        <image
          href={logo.src}
          x={logoX}
          y={logoY}
          width={logoPaddedWidth}
          height={logoPaddedHeight}
          preserveAspectRatio="xMidYMid meet"
        />
      ) : null}
    </svg>
  );
});
