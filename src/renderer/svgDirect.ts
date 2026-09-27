import type { CSSProperties } from 'react';
import type { QRCodeProps, CornerDotStyle, CornerSquareStyle } from '../types';
import { generateQRMatrix } from '../core/matrix';
import { cornerPaths, resolveGeometry, xmlSafeText } from './utils';
import { buildDataModulesPath, r2 } from './paths';
import {
  isSafeSrc,
  resolveLogoEcl,
  layoutLogo,
  logoAspectRatio,
} from './logoSafety';

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
  return xmlSafeText(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// React 19's unitless set (CSSProperty.js). Everything else gets `px` appended
// to a bare non-zero number, so toSVGString and <QRCode> emit the same
// declaration. React 18 differs on exactly one entry, `scale`, where it
// appends px against the CSS spec; this follows 19.
const UNITLESS_PROPS = new Set([
  'animationIterationCount',
  'aspectRatio',
  'borderImageOutset',
  'borderImageSlice',
  'borderImageWidth',
  'boxFlex',
  'boxFlexGroup',
  'boxOrdinalGroup',
  'columnCount',
  'columns',
  'flex',
  'flexGrow',
  'flexPositive',
  'flexShrink',
  'flexNegative',
  'flexOrder',
  'gridArea',
  'gridRow',
  'gridRowEnd',
  'gridRowSpan',
  'gridRowStart',
  'gridColumn',
  'gridColumnEnd',
  'gridColumnSpan',
  'gridColumnStart',
  'fontWeight',
  'lineClamp',
  'lineHeight',
  'opacity',
  'order',
  'orphans',
  'scale',
  'tabSize',
  'widows',
  'zIndex',
  'zoom',
  'fillOpacity',
  'floodOpacity',
  'stopOpacity',
  'strokeDasharray',
  'strokeDashoffset',
  'strokeMiterlimit',
  'strokeOpacity',
  'strokeWidth',
]);

// React keeps only these vendor-prefixed variants unitless, not one per
// property: React 18 prefixed the whole set, React 19 pared it back to this.
const UNITLESS_PREFIXED = [
  'WebkitAnimationIterationCount',
  'msAnimationIterationCount',
  'MozAnimationIterationCount',
  'WebkitBoxFlex',
  'MozBoxFlex',
  'MozBoxFlexGroup',
  'WebkitBoxOrdinalGroup',
  'WebkitColumnCount',
  'WebkitColumns',
  'WebkitFlex',
  'msFlex',
  'WebkitFlexGrow',
  'msFlexGrow',
  'WebkitFlexPositive',
  'msFlexPositive',
  'WebkitFlexShrink',
  'msFlexShrink',
  'msFlexNegative',
  'msFlexOrder',
  'msGridRow',
  'msGridRowSpan',
  'msGridColumn',
  'msGridColumnSpan',
  'WebkitLineClamp',
  'MozLineClamp',
  'msZoom',
];
for (const prop of UNITLESS_PREFIXED) UNITLESS_PROPS.add(prop);

// React's hyphenateStyleName: an initial capital becomes a vendor prefix
// (`WebkitTransform` → `-webkit-transform`), a leading `ms` gets the dash it
// would otherwise miss, and custom properties are left exactly as written.
function cssPropertyName(key: string): string {
  if (key.startsWith('--')) return key;
  return key
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^ms-/, '-ms-');
}

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
      return `${cssPropertyName(k)}:${value}`;
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
  const { square, dot } = cornerPaths(x, y, moduleSize, squareStyle, dotStyle);
  return (
    `<g>` +
    `<path d="${square}" fill="${squareColorAttr}" fill-rule="evenodd"/>` +
    `<path d="${dot}" fill="${dotColorAttr}"/>` +
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
    idPrefix,
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

  const { moduleSize, marginPx, svgSize } = resolveGeometry(
    size,
    margin,
    qrSize,
  );

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

  // Whitelisted, not escaped: this lands in attribute position four times and
  // inside url(#...), where an escaped quote would still produce a broken
  // reference. Callers reach for it with row ids and slugs, so it is data.
  const prefix = (idPrefix ?? 'qr').replace(/[^A-Za-z0-9_-]/g, '') || 'qr';
  const uid = `${prefix}${hashId(
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
      logo?.aspectRatio ?? '',
      logo?.margin ?? '',
      logo?.hideDots ?? '',
      className ?? '',
      ariaLabel ?? '',
      idPrefix ?? '',
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

  // The headless builder cannot load the image to measure it, so a caller who
  // needs the same layout <QRCode> produces passes logo.aspectRatio.
  const logoMargin = (logo?.margin ?? 0) * moduleSize;
  const layout = layoutLogo({
    absoluteArea,
    aspectRatio: logoAspectRatio(logo?.aspectRatio),
    ecLevel,
    qrSize,
    moduleSize,
    marginPx,
  });
  const clearX = r2(layout.clearX);
  const clearY = r2(layout.clearY);
  const clearWidth = r2(layout.clearWidth);
  const clearHeight = r2(layout.clearHeight);
  const logoX = r2(layout.boxX + logoMargin);
  const logoY = r2(layout.boxY + logoMargin);
  const logoWidth = r2(Math.max(0, layout.boxWidth - logoMargin * 2));
  const logoHeight = r2(Math.max(0, layout.boxHeight - logoMargin * 2));

  const applyLogoMask =
    hasLogo && logoWidth > 0 && logoHeight > 0 && (logo?.hideDots ?? true);

  // Finder pattern corner positions (row, col in module space)
  const cornerPositions: Array<[number, number]> = [
    [0, 0],
    [0, qrSize - 7],
    [qrSize - 7, 0],
  ];

  // Build SVG string
  // r2 rather than raw interpolation: resolveGeometry has already rejected a
  // non-numeric size, and this keeps the attribute provably numeric.
  const sizeAttr = r2(size);
  let svg =
    `<svg role="img" aria-labelledby="${titleId}"` +
    ` width="${sizeAttr}" height="${sizeAttr}"` +
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
      `<rect x="${clearX}" y="${clearY}" width="${clearWidth}" height="${clearHeight}" fill="black"/>` +
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
