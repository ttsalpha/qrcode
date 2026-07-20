import type { CSSProperties } from 'react';
import type { QRCodeProps, CornerDotStyle, CornerSquareStyle } from '../types';
import { generateQRMatrix } from '../core/matrix';
import { cornerSquarePath, cornerDotPath } from './utils';
import { buildDataModulesPath, r2 } from './paths';
import { isSafeSrc, resolveLogoEcl } from './logoSafety';

let _idCounter = 0;

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function cssToString(style: CSSProperties): string {
  return Object.entries(style)
    .filter(([, v]) => v != null)
    .map(
      ([k, v]) =>
        `${k.replace(/([A-Z])/g, (c) => `-${c.toLowerCase()}`)}:${v as string}`,
    )
    .join(';');
}

function renderCorner(
  x: number,
  y: number,
  moduleSize: number,
  squareStyle: CornerSquareStyle,
  squareColor: string,
  dotStyle: CornerDotStyle,
  dotColor: string,
): string {
  const outerSize = r2(7 * moduleSize);
  const innerSize = r2(3 * moduleSize);
  const innerOffset = r2(2 * moduleSize);

  const sqPath = cornerSquarePath(x, y, outerSize, squareStyle);
  const dotP = cornerDotPath(
    r2(x + innerOffset),
    r2(y + innerOffset),
    innerSize,
    dotStyle,
  );

  return (
    `<g>` +
    `<path d="${sqPath}" fill="${squareColor}" fill-rule="evenodd"/>` +
    `<path d="${dotP}" fill="${dotColor}"/>` +
    `</g>`
  );
}

export function buildSVGString(props: QRCodeProps): string {
  const {
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
    ariaLabel,
  } = props;

  const requestedVersion = qr?.version;
  const userECL = qr?.errorCorrectionLevel;
  const logoSrc = logo?.src && isSafeSrc(logo.src) ? logo.src : undefined;
  const hasLogo = !!logoSrc;

  const { ecLevel, absoluteArea } = resolveLogoEcl(
    hasLogo,
    logo?.size,
    userECL,
  );

  const { matrix, size: qrSize } = generateQRMatrix(
    value,
    ecLevel,
    requestedVersion,
  );

  const totalModules = qrSize + margin * 2;
  const moduleSize = r2(size / totalModules);
  const marginPx = r2(margin * moduleSize);
  const svgSize = r2(moduleSize * totalModules);

  const squareStyle: CornerSquareStyle = corner?.square?.style ?? 'square';
  const squareColor = corner?.square?.color ?? dotColor;
  const defaultCornerDotStyle: CornerDotStyle =
    squareStyle === 'extra-rounded'
      ? 'rounded'
      : squareStyle === 'circle'
        ? 'circle'
        : 'square';
  const cornerDotStyleVal: CornerDotStyle =
    corner?.dot?.style ?? defaultCornerDotStyle;
  const cornerDotColor = corner?.dot?.color ?? dotColor;

  const uid = `qr${_idCounter++}`;
  const titleId = `${uid}t`;
  const maskId = `${uid}m`;

  // Data modules
  const dataPath = buildDataModulesPath(matrix, moduleSize, marginPx, dotStyle);

  // Logo dimensions (aspect ratio = 1 for headless; no image loading available)
  const logoMargin = logo?.margin ?? 0;
  const clampedArea = absoluteArea * svgSize * svgSize;
  const logoBoxWidth = r2(Math.sqrt(clampedArea));
  const logoBoxHeight = logoBoxWidth;
  const logoBoxX = r2((svgSize - logoBoxWidth) / 2);
  const logoBoxY = r2((svgSize - logoBoxHeight) / 2);
  const logoX = r2(logoBoxX + logoMargin);
  const logoY = r2(logoBoxY + logoMargin);
  const logoWidth = r2(Math.max(0, logoBoxWidth - logoMargin * 2));
  const logoHeight = r2(Math.max(0, logoBoxHeight - logoMargin * 2));

  const applyLogoMask =
    hasLogo && logoWidth > 0 && logoHeight > 0 && (logo?.hideDots ?? true);

  // Finder pattern corner positions (row, col in module space)
  const cornerPositions: Array<[number, number]> = [
    [0, 0],
    [0, qrSize - 7],
    [qrSize - 7, 0],
  ];

  // Build SVG string
  let svg =
    `<svg role="img" aria-labelledby="${titleId}"` +
    ` width="${size}" height="${size}"` +
    ` viewBox="0 0 ${svgSize} ${svgSize}"` +
    ` xmlns="http://www.w3.org/2000/svg"`;
  if (className) svg += ` class="${esc(className)}"`;
  if (style) svg += ` style="${esc(cssToString(style))}"`;
  svg += `>`;

  svg += `<title id="${titleId}">${esc(ariaLabel ?? `QR code: ${value}`)}</title>`;

  if (backgroundColor !== 'transparent') {
    svg += `<rect width="${svgSize}" height="${svgSize}" fill="${backgroundColor}"/>`;
  }

  if (applyLogoMask) {
    svg +=
      `<defs><mask id="${maskId}">` +
      `<rect width="${svgSize}" height="${svgSize}" fill="white"/>` +
      `<rect x="${logoBoxX}" y="${logoBoxY}" width="${logoBoxWidth}" height="${logoBoxHeight}" fill="black"/>` +
      `</mask></defs>`;
  }

  svg += `<g${applyLogoMask ? ` mask="url(#${maskId})"` : ''}>`;

  if (dataPath) {
    svg += `<path d="${dataPath}" fill="${dotColor}"/>`;
  }

  for (const [row, col] of cornerPositions) {
    const cx = r2(marginPx + col * moduleSize);
    const cy = r2(marginPx + row * moduleSize);
    svg += renderCorner(
      cx,
      cy,
      moduleSize,
      squareStyle,
      squareColor,
      cornerDotStyleVal,
      cornerDotColor,
    );
  }

  svg += `</g>`;

  if (hasLogo && logoWidth > 0 && logoHeight > 0) {
    svg += `<image href="${esc(logoSrc!)}" x="${logoX}" y="${logoY}" width="${logoWidth}" height="${logoHeight}"/>`;
  }

  svg += `</svg>`;

  return svg;
}
