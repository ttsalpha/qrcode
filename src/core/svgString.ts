import type { SVGStringOptions, StyleMap } from './types';
import { buildQR, resolveCorner } from './buildQR';
import { xmlSafeText } from './shapes';
import { isSafeSrc } from './logoSafety';

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

function cssToString(style: StyleMap): string {
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

/**
 * Renders the symbol as a standalone SVG string. Pure JS, and deterministic:
 * the output depends only on the props, so it is safe to hash or cache.
 */
export function toSVGString(props: SVGStringOptions): string {
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

  const geometry = buildQR(props);
  const resolved = resolveCorner(corner, dotColor);
  const logoSrc = logo?.src && isSafeSrc(logo.src) ? logo.src : undefined;

  // Whitelisted, not escaped: this lands in attribute position four times and
  // inside url(#...), where an escaped quote would still produce a broken
  // reference. Callers reach for it with row ids and slugs, so it is data.
  const prefix = (idPrefix ?? 'qr').replace(/[^A-Za-z0-9_-]/g, '') || 'qr';
  const key = [
    value,
    size,
    margin,
    dotStyle,
    dotColor,
    backgroundColor,
    resolved.squareStyle,
    resolved.squareColor,
    resolved.dotStyle,
    resolved.dotColor,
    geometry.ecLevel,
    qr?.version ?? '',
    logoSrc ?? '',
    logo?.size ?? '',
    logo?.aspectRatio ?? '',
    logo?.margin ?? '',
    logo?.hideDots ?? '',
    className ?? '',
    ariaLabel ?? '',
    idPrefix ?? '',
  ];
  // Appended only when set, so props that predate these options keep the ids
  // they always had.
  if (logo?.radius !== undefined) key.push(logo.radius);
  if (logo?.custom) key.push('custom');
  const uid = `${prefix}${hashId(key.join('\u0000'))}`;
  const titleId = `${uid}t`;
  const maskId = `${uid}m`;
  const clipId = `${uid}c`;

  const { size: sizeAttr, viewBox, background, modules, finders } = geometry;
  const { clear, logo: logoBox } = geometry;

  // Colors land in attribute position. React escapes them for <QRCode>; this
  // builder writes the string itself, so it has to.
  let svg =
    `<svg role="img" aria-labelledby="${titleId}"` +
    ` width="${sizeAttr}" height="${sizeAttr}"` +
    ` viewBox="0 0 ${viewBox} ${viewBox}"` +
    ` xmlns="http://www.w3.org/2000/svg"`;
  if (className) svg += ` class="${esc(className)}"`;
  if (style) svg += ` style="${esc(cssToString(style))}"`;
  svg += `>`;

  svg += `<title id="${titleId}">${esc(ariaLabel ?? `QR code: ${value}`)}</title>`;

  if (background !== undefined) {
    svg += `<rect width="${viewBox}" height="${viewBox}" fill="${esc(background)}"/>`;
  }

  if (clear) {
    svg +=
      `<defs><mask id="${maskId}">` +
      `<rect width="${viewBox}" height="${viewBox}" fill="white"/>` +
      `<rect x="${clear.x}" y="${clear.y}" width="${clear.width}" height="${clear.height}" fill="black"/>` +
      `</mask></defs>`;
  }

  svg += `<g${clear ? ` mask="url(#${maskId})"` : ''}>`;

  if (modules) {
    svg += `<path d="${modules.d}" fill="${esc(modules.fill)}"/>`;
  }

  for (const { square, dot } of finders) {
    svg +=
      `<g>` +
      `<path d="${square.d}" fill="${esc(square.fill)}" fill-rule="evenodd"/>` +
      `<path d="${dot.d}" fill="${esc(dot.fill)}"/>` +
      `</g>`;
  }

  svg += `</g>`;

  if (logoBox?.src) {
    const { x, y, width, height, radius } = logoBox;
    if (radius > 0) {
      svg +=
        `<defs><clipPath id="${clipId}">` +
        `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" ry="${radius}"/>` +
        `</clipPath></defs>`;
    }
    svg +=
      `<image href="${esc(logoBox.src!)}" x="${x}" y="${y}" width="${width}" height="${height}"` +
      `${radius > 0 ? ` clip-path="url(#${clipId})"` : ''}/>`;
  }

  svg += `</svg>`;

  return svg;
}
