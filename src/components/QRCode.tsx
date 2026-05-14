import * as React from 'react';
import type { QRCodeProps, CornerDotStyle, CornerSquareStyle } from '../types';
import { generateQRMatrix } from '../core/matrix';
import { renderDataModules, getFinderPatterns } from '../renderer/svg';
import { QRCorner } from './QRCorner';

export function QRCode({
  value,
  width = 256,
  height = 256,
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

  const { matrix, size } = generateQRMatrix(value, ecLevel, requestedVersion);

  // Module size in pixels (accounting for margin)
  const totalModules = size + margin * 2;
  const moduleSize = Math.min(width, height) / totalModules;
  const marginPx = margin * moduleSize;

  // Actual SVG dimensions
  const svgWidth = moduleSize * (size + margin * 2);
  const svgHeight = moduleSize * (size + margin * 2);

  const squareStyle: CornerSquareStyle = corner?.square?.style ?? 'square';
  const squareColor = corner?.square?.color ?? dotColor;
  const defaultCornerDotStyle: CornerDotStyle =
    squareStyle === 'extra-rounded' ? 'rounded' : 'square';
  const cornerDotStyleVal: CornerDotStyle =
    corner?.dot?.style ?? defaultCornerDotStyle;
  const cornerDotColor = corner?.dot?.color ?? dotColor;

  const { paths } = renderDataModules(matrix, moduleSize, marginPx, dotStyle);
  const finderPatterns = getFinderPatterns(size, moduleSize, marginPx);

  // Logo dimensions
  const logoWidth = logo?.width ?? svgWidth * 0.2;
  const logoHeight = logo?.height ?? svgHeight * 0.2;
  const logoPadding = logo?.padding ?? 0;
  const logoX = (svgWidth - logoWidth) / 2 - logoPadding;
  const logoY = (svgHeight - logoHeight) / 2 - logoPadding;
  const logoPaddedWidth = logoWidth + logoPadding * 2;
  const logoPaddedHeight = logoHeight + logoPadding * 2;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
    >
      {/* Background */}
      {backgroundColor !== 'transparent' && (
        <rect width={svgWidth} height={svgHeight} fill={backgroundColor} />
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
      ) : logo?.src ? (
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
}
