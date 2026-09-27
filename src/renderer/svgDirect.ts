import type { CSSProperties } from 'react';
import type { QRCodeProps, CornerDotStyle, CornerSquareStyle } from '../types';
import { generateQRMatrix } from '../core/matrix';
import { cornerSquarePath, cornerDotPath } from './utils';
import { buildDataModulesPath, r2 } from './paths';
import { isSafeSrc, resolveLogoEcl } from './logoSafety';

// Two independent xor-multiply accumulators, combined so the id is wide enough
// that distinct props do not collide on one page. A counter would make
// toSVGString non-deterministic and defeat content hashing and HTTP caching.
function hashId(key: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x85ebca6b);
  }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36);
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Properties React keeps unitless. Everything else gets `px` appended to a bare
// non-zero number, so toSVGString and <QRCode> emit the same declaration.
const UNITLESS_PROPS = new Set([
  'opacity',
  'zIndex',
  'flex',
  'flexGrow',
  'flexShrink',
  'fontWeight',
  'lineHeight',
  'order',
  'zoom',
]);

function cssToString(style: CSSProperties): string {
  return Object.entries(style)
    .filter(([, v]) => v != null)
    .map(([k, v]) => {
      const needsPx =
        typeof v === 'number' &&
        v !== 0 &&
        !UNITLESS_PROPS.has(k) &&
        !k.startsWith('--');
      const value = needsPx ? `${v}px` : String(v);
      return `${k.replace(/([A-Z])/g, (c) => `-${c.toLowerCase()}`)}:${value}`;
    })
    .join(';');
}

// Both colors must already be escaped by the caller; they go straight into
// attribute position.
function renderCorner(
  x: number,
  y: number,
  moduleSize: number,
  squareStyle: CornerSquareStyle,
  squareColorAttr: string,
  dotStyle: CornerDotStyle,
  dotColorAttr: string,
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
    `<path d="${sqPath}" fill="${squareColorAttr}" fill-rule="evenodd"/>` +
    `<path d="${dotP}" fill="${dotColorAttr}"/>` +
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

  // Colors land in attribute position. React escapes them for <QRCode>; this
  // builder writes the string itself, so it has to.
  const dotColorAttr = esc(dotColor);
  const backgroundColorAttr = esc(backgroundColor);
  const squareColorAttr = esc(squareColor);
  const cornerDotColorAttr = esc(cornerDotColor);

  const uid = `qr${hashId(
    [
      value,
      size,
      margin,
      dotStyle,
      dotColor,
      backgroundColor,
      squareStyle,
      squareColor,
      cornerDotStyleVal,
      cornerDotColor,
      ecLevel,
      requestedVersion ?? '',
      logoSrc ?? '',
      logo?.size ?? '',
      logo?.margin ?? '',
      logo?.hideDots ?? '',
      className ?? '',
      ariaLabel ?? '',
    ].join('\u0000'),
  )}`;
  const titleId = `${uid}t`;
  const maskId = `${uid}m`;

  // Data modules
  const dataPath = buildDataModulesPath(
    matrix,
    qrSize,
    moduleSize,
    marginPx,
    dotStyle,
  );

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
    svg += `<rect width="${svgSize}" height="${svgSize}" fill="${backgroundColorAttr}"/>`;
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
    svg += `<path d="${dataPath}" fill="${dotColorAttr}"/>`;
  }

  for (const [row, col] of cornerPositions) {
    const cx = r2(marginPx + col * moduleSize);
    const cy = r2(marginPx + row * moduleSize);
    svg += renderCorner(
      cx,
      cy,
      moduleSize,
      squareStyle,
      squareColorAttr,
      cornerDotStyleVal,
      cornerDotColorAttr,
    );
  }

  svg += `</g>`;

  if (hasLogo && logoWidth > 0 && logoHeight > 0) {
    svg += `<image href="${esc(logoSrc!)}" x="${logoX}" y="${logoY}" width="${logoWidth}" height="${logoHeight}"/>`;
  }

  svg += `</svg>`;

  return svg;
}
