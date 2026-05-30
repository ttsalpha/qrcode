import type { CSSProperties } from 'react';
import type {
  QRCodeProps,
  ErrorCorrectionLevel,
  DotStyle,
  CornerDotStyle,
  CornerSquareStyle,
} from '../types';
import { generateQRMatrix } from '../core/matrix';
import { cornerSquarePath, cornerDotPath } from './utils';
import { getFinderPatternModules } from './svg';

let _idCounter = 0;

const SAFE_AREAS = { L: 0.0225, M: 0.04, Q: 0.0625, H: 0.09 } as const;
const MAX_SAFE_AREA = SAFE_AREAS.H;
const DEFAULT_SIZE_RATIO = 0.4;

function pickECLForArea(area: number): ErrorCorrectionLevel {
  if (area <= SAFE_AREAS.L) return 'L';
  if (area <= SAFE_AREAS.M) return 'M';
  if (area <= SAFE_AREAS.Q) return 'Q';
  return 'H';
}

function isSafeSrc(src: string): boolean {
  const s = src.trim().toLowerCase();
  if (s.startsWith('javascript:')) return false;
  if (s.startsWith('data:') && !s.startsWith('data:image/')) return false;
  return true;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

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

// 'square' style: merge consecutive dark modules per row into one path command
function renderSquareRLE(
  matrix: boolean[][],
  finderModules: Set<number>,
  moduleSize: number,
  marginPx: number,
): string {
  const size = matrix.length;
  const h = r2(moduleSize);
  const parts: string[] = [];

  for (let row = 0; row < size; row++) {
    let runStart = -1;
    for (let col = 0; col <= size; col++) {
      const isDark =
        col < size && matrix[row][col] && !finderModules.has(row * size + col);
      if (isDark && runStart === -1) {
        runStart = col;
      } else if (!isDark && runStart !== -1) {
        const x = r2(marginPx + runStart * moduleSize);
        const y = r2(marginPx + row * moduleSize);
        const w = r2((col - runStart) * moduleSize);
        parts.push(`M${x},${y}h${w}v${h}h${-w}z`);
        runStart = -1;
      }
    }
  }

  return parts.join(' ');
}

// 'circle' and 'rounded' styles: one path command per module
function renderModulesPer(
  matrix: boolean[][],
  finderModules: Set<number>,
  moduleSize: number,
  marginPx: number,
  dotStyle: DotStyle,
): string {
  const size = matrix.length;
  const s = r2(moduleSize);
  const parts: string[] = [];

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!matrix[row][col] || finderModules.has(row * size + col)) continue;

      const x = r2(marginPx + col * moduleSize);
      const y = r2(marginPx + row * moduleSize);

      if (dotStyle === 'circle') {
        const cx = r2(x + s / 2);
        const cy = r2(y + s / 2);
        const rad = r2(s / 2);
        parts.push(
          `M${r2(cx - rad)},${cy}a${rad},${rad} 0 1,0 ${r2(rad * 2)},0a${rad},${rad} 0 1,0 ${r2(-rad * 2)},0z`,
        );
      } else {
        // rounded: per-corner radius based on neighbors
        const R = r2(s * 0.45);
        const top = row > 0 && matrix[row - 1][col];
        const right = col < size - 1 && matrix[row][col + 1];
        const bottom = row < size - 1 && matrix[row + 1][col];
        const left = col > 0 && matrix[row][col - 1];
        const rTL = top || left ? 0 : R;
        const rTR = top || right ? 0 : R;
        const rBR = bottom || right ? 0 : R;
        const rBL = bottom || left ? 0 : R;
        parts.push(
          `M${r2(x + rTL)},${y}` +
            `h${r2(s - rTL - rTR)}` +
            `q${rTR},0 ${rTR},${rTR}` +
            `v${r2(s - rTR - rBR)}` +
            `q0,${rBR} ${-rBR},${rBR}` +
            `h${r2(-(s - rBR - rBL))}` +
            `q${-rBL},0 ${-rBL},${-rBL}` +
            `v${r2(-(s - rBL - rTL))}` +
            `q0,${-rTL} ${rTL},${-rTL}z`,
        );
      }
    }
  }

  return parts.join(' ');
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

  const sizeRatio = hasLogo
    ? logo?.size !== undefined
      ? Math.max(0, Math.min(1, logo.size))
      : DEFAULT_SIZE_RATIO
    : 0;
  const targetArea = sizeRatio * MAX_SAFE_AREA;

  let ecLevel: ErrorCorrectionLevel;
  let absoluteArea: number;
  if (userECL) {
    ecLevel = userECL;
    absoluteArea = Math.min(targetArea, SAFE_AREAS[userECL]);
  } else if (targetArea > 0) {
    ecLevel = pickECLForArea(targetArea);
    absoluteArea = targetArea;
  } else {
    ecLevel = 'M';
    absoluteArea = 0;
  }

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

  const applyLogoMask = hasLogo && (logo?.hideDots ?? true);

  // Data modules
  const finderModules = getFinderPatternModules(qrSize);
  const dataPath =
    dotStyle === 'square'
      ? renderSquareRLE(matrix, finderModules, moduleSize, marginPx)
      : renderModulesPer(matrix, finderModules, moduleSize, marginPx, dotStyle);

  // Logo dimensions (aspect ratio = 1 for headless; no image loading available)
  const logoMargin = logo?.margin ?? 0;
  const clampedArea = absoluteArea * svgSize * svgSize;
  const logoBoxWidth = r2(Math.sqrt(clampedArea));
  const logoBoxHeight = logoBoxWidth;
  const logoBoxX = r2((svgSize - logoBoxWidth) / 2);
  const logoBoxY = r2((svgSize - logoBoxHeight) / 2);
  const logoX = r2(logoBoxX + logoMargin);
  const logoY = r2(logoBoxY + logoMargin);
  const logoWidth = r2(logoBoxWidth - logoMargin * 2);
  const logoHeight = r2(logoBoxHeight - logoMargin * 2);

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

  if (hasLogo) {
    svg += `<image href="${esc(logoSrc!)}" x="${logoX}" y="${logoY}" width="${logoWidth}" height="${logoHeight}"/>`;
  }

  svg += `</svg>`;

  return svg;
}
