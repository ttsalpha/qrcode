import type {
  CornerDotStyle,
  CornerOptions,
  CornerSquareStyle,
  QRCodeOptions,
  QRFinder,
  QRGeometry,
} from './types';
import { generateQRMatrix } from './matrix';
import { getFinderPatterns } from './finder';
import { buildDataModulesPath, r2 } from './paths';
import { cornerPaths, resolveGeometry } from './shapes';
import {
  isSafeSrc,
  layoutLogo,
  logoAspectRatio,
  pickECLForArea,
  resolveLogoEcl,
} from './logoSafety';

export interface ResolvedCorner {
  squareStyle: CornerSquareStyle;
  squareColor: string;
  dotStyle: CornerDotStyle;
  dotColor: string;
}

// An extra-rounded or circular ring gets a matching dot unless one is asked for.
export function resolveCorner(
  corner: CornerOptions | undefined,
  dotColor: string,
): ResolvedCorner {
  const squareStyle = corner?.square?.style ?? 'square';
  const defaultDotStyle: CornerDotStyle =
    squareStyle === 'extra-rounded'
      ? 'rounded'
      : squareStyle === 'circle'
        ? 'circle'
        : 'square';
  return {
    squareStyle,
    squareColor: corner?.square?.color ?? dotColor,
    dotStyle: corner?.dot?.style ?? defaultDotStyle,
    dotColor: corner?.dot?.color ?? dotColor,
  };
}

function clampRadius(radius: number | undefined): number {
  return radius !== undefined && Number.isFinite(radius)
    ? Math.max(0, Math.min(1, radius))
    : 0;
}

/**
 * Resolves props into the geometry of one symbol. Pure JS: no DOM, no React.
 * Throws a `RangeError` or `TypeError` for input that cannot be encoded.
 */
export function buildQR(props: QRCodeOptions): QRGeometry {
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
  } = props;

  const logoSrc = logo?.src && isSafeSrc(logo.src) ? logo.src : undefined;
  const hasLogo = !!(logoSrc || logo?.custom);
  const userECL = qr?.errorCorrectionLevel;

  const { ecLevel, absoluteArea, targetArea, clamped } = resolveLogoEcl(
    hasLogo,
    logo?.size,
    userECL,
  );
  const warnings: string[] = [];
  if (clamped) {
    warnings.push(
      `[QRCode] logo.size=${logo?.size} needs ECL ≥ "${pickECLForArea(targetArea)}"; ECL "${userECL}" set, logo clamped.`,
    );
  }

  const { matrix, size: qrSize } = generateQRMatrix(
    value,
    ecLevel,
    qr?.version,
  );
  const { moduleSize, marginPx, svgSize } = resolveGeometry(
    size,
    margin,
    qrSize,
  );

  const resolved = resolveCorner(corner, dotColor);
  const modulesPath = buildDataModulesPath(
    matrix,
    qrSize,
    moduleSize,
    marginPx,
    dotStyle,
  );
  const finders = getFinderPatterns(qrSize, moduleSize, marginPx).map(
    (fp): QRFinder => {
      const { square, dot } = cornerPaths(
        r2(fp.x),
        r2(fp.y),
        moduleSize,
        resolved.squareStyle,
        resolved.dotStyle,
      );
      return {
        square: { d: square, fill: resolved.squareColor, fillRule: 'evenodd' },
        dot: { d: dot, fill: resolved.dotColor },
      };
    },
  );

  // In modules, like `margin`, so the logo keeps its proportions when `size`
  // changes. An absolute unit here would scale with the viewBox instead.
  const logoMargin = (logo?.margin ?? 0) * moduleSize;
  const layout = layoutLogo({
    absoluteArea,
    aspectRatio: logoAspectRatio(logo?.aspectRatio),
    ecLevel,
    qrSize,
    moduleSize,
    marginPx,
  });
  // Rounded at emission, like every other coordinate, so every renderer places
  // the logo and its clearing on identical values.
  const logoX = r2(layout.boxX + logoMargin);
  const logoY = r2(layout.boxY + logoMargin);
  const logoWidth = r2(Math.max(0, layout.boxWidth - logoMargin * 2));
  const logoHeight = r2(Math.max(0, layout.boxHeight - logoMargin * 2));
  const drawn = hasLogo && logoWidth > 0 && logoHeight > 0;

  // A margin carried over from when it meant SVG units consumes the whole box.
  // Both axes: a landscape logo runs out of height first.
  if (
    hasLogo &&
    layout.boxWidth > 0 &&
    layout.boxHeight > 0 &&
    (logoWidth <= 0 || logoHeight <= 0)
  ) {
    warnings.push(
      `[QRCode] logo.margin=${logo?.margin} is measured in modules and leaves no room for the logo; it was not rendered.`,
    );
  }

  return {
    size: r2(size),
    viewBox: svgSize,
    ecLevel,
    background: backgroundColor === 'transparent' ? undefined : backgroundColor,
    modules: modulesPath ? { d: modulesPath, fill: dotColor } : undefined,
    finders,
    clear:
      drawn && (logo?.hideDots ?? true)
        ? {
            x: r2(layout.clearX),
            y: r2(layout.clearY),
            width: r2(layout.clearWidth),
            height: r2(layout.clearHeight),
          }
        : undefined,
    logo: drawn
      ? {
          src: logoSrc,
          x: logoX,
          y: logoY,
          width: logoWidth,
          height: logoHeight,
          radius: r2(
            (clampRadius(logo?.radius) * Math.min(logoWidth, logoHeight)) / 2,
          ),
        }
      : undefined,
    warnings,
  };
}
