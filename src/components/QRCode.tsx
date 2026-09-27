'use client';

declare const process: { env: { NODE_ENV?: string } } | undefined;

import * as React from 'react';
import type {
  QRCodeComponentProps,
  CornerDotStyle,
  CornerSquareStyle,
} from '../types';
import { generateQRMatrix } from '../core/matrix';
import { getFinderPatterns } from '../renderer/svg';
import { buildDataModulesPath, r2 } from '../renderer/paths';
import { resolveGeometry, xmlSafeText } from '../renderer/utils';
import {
  pickECLForArea,
  isSafeSrc,
  resolveLogoEcl,
  layoutLogo,
  logoAspectRatio,
} from '../renderer/logoSafety';
import { QRCorner } from './QRCorner';

// Warn unless a bundler proved this is production. `process` is absent in plain
// browser ESM, and reading that as production silenced the warning in exactly
// the setups most likely to trip it.
const isDev =
  typeof process === 'undefined' || process.env?.NODE_ENV !== 'production';

// Avoid useLayoutEffect SSR warning while still running synchronously on the client
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect;

function QRCodeRoot(
  {
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
    // Consumed, not spread: useId already makes these ids unique, so the prop
    // only means anything to the string builder.
    idPrefix: _idPrefix,
    ...rest
  }: QRCodeComponentProps,
  ref: React.ForwardedRef<SVGSVGElement>,
): React.JSX.Element {
  const requestedVersion = qr?.version;
  const userECL = qr?.errorCorrectionLevel;
  const userSize = logo?.size;
  const hasLogoSrc = !!(logo?.element || (logo?.src && isSafeSrc(logo.src)));

  const { ecLevel, absoluteArea, targetArea, clamped } = resolveLogoEcl(
    hasLogoSrc,
    userSize,
    userECL,
  );
  if (isDev && clamped) {
    console.warn(
      `[QRCode] logo.size=${userSize} needs ECL ≥ "${pickECLForArea(targetArea)}"; ECL "${userECL}" set, logo clamped.`,
    );
  }

  // An explicit ratio is authoritative, so the measuring work is skipped
  // entirely and the logo never reflows after the first paint.
  const explicitAspect = logo?.aspectRatio;
  const measured = explicitAspect === undefined;

  const [srcAspectRatio, setSrcAspectRatio] = React.useState(1);
  const [elementAspectRatio, setElementAspectRatio] = React.useState(1);
  const measureRef = React.useRef<HTMLDivElement>(null);

  // Sync before first paint: handles cached images and static elements with no flash.
  // Falls back to async for uncached images (onload) and dynamic elements (ResizeObserver).
  useIsomorphicLayoutEffect(() => {
    if (!measured) return;
    if (!logo?.src || !isSafeSrc(logo.src)) {
      setSrcAspectRatio(1);
      return;
    }
    const img = new window.Image();
    img.src = logo.src;
    if (img.complete && img.naturalWidth && img.naturalHeight) {
      setSrcAspectRatio(img.naturalWidth / img.naturalHeight);
      return;
    }
    setSrcAspectRatio(1);
    img.onload = () => {
      if (img.naturalWidth && img.naturalHeight)
        setSrcAspectRatio(img.naturalWidth / img.naturalHeight);
    };
    return () => {
      img.onload = null;
    };
  }, [logo?.src, measured]);

  useIsomorphicLayoutEffect(() => {
    if (!measured || !measureRef.current || !logo?.element) return;
    const { width, height } = measureRef.current.getBoundingClientRect();
    if (width && height) setElementAspectRatio(width / height);
  }, [logo?.element, measured]);

  // ResizeObserver as safety net for elements whose size changes after mount
  // (e.g. logo.element contains an <img> that loads asynchronously).
  React.useEffect(() => {
    if (!measured || !measureRef.current || !logo?.element) return;
    const el = measureRef.current;
    const observer = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r?.width && r.height) setElementAspectRatio(r.width / r.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [logo?.element, measured]);

  const { matrix, size: qrSize } = React.useMemo(
    () => generateQRMatrix(value, ecLevel, requestedVersion),
    [value, ecLevel, requestedVersion],
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

  const dataPath = React.useMemo(
    () => buildDataModulesPath(matrix, qrSize, moduleSize, marginPx, dotStyle),
    [matrix, qrSize, moduleSize, marginPx, dotStyle],
  );
  const finderPatterns = React.useMemo(
    () => getFinderPatterns(qrSize, moduleSize, marginPx),
    [qrSize, moduleSize, marginPx],
  );

  const uid = React.useId().replace(/:/g, '');
  const maskId = uid + 'm';
  const titleId = uid + 't';

  const aspectRatio = measured
    ? logo?.element
      ? elementAspectRatio
      : srcAspectRatio
    : logoAspectRatio(explicitAspect);
  const layout = layoutLogo({
    absoluteArea,
    aspectRatio,
    ecLevel,
    qrSize,
    moduleSize,
    marginPx,
  });
  // In modules, like `margin`, so the logo keeps its proportions when `size`
  // changes. An absolute unit here would scale with the viewBox instead.
  const logoMargin = (logo?.margin ?? 0) * moduleSize;
  // Rounded at emission, like every other coordinate, so the component and
  // toSVGString place the logo and its mask on identical values.
  const logoX = r2(layout.boxX + logoMargin);
  const logoY = r2(layout.boxY + logoMargin);
  const logoWidth = r2(Math.max(0, layout.boxWidth - logoMargin * 2));
  const logoHeight = r2(Math.max(0, layout.boxHeight - logoMargin * 2));

  const applyLogoMask =
    hasLogoSrc && logoWidth > 0 && logoHeight > 0 && (logo?.hideDots ?? true);

  // A margin carried over from when it meant SVG units consumes the whole box.
  // Both axes: a landscape logo runs out of height first.
  if (
    isDev &&
    hasLogoSrc &&
    layout.boxWidth > 0 &&
    layout.boxHeight > 0 &&
    (logoWidth <= 0 || logoHeight <= 0)
  ) {
    console.warn(
      `[QRCode] logo.margin=${logo?.margin} is measured in modules and leaves no room for the logo; it was not rendered.`,
    );
  }

  return (
    <>
      {logo?.element && measured && (
        <div
          ref={measureRef}
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: '-200vw',
            display: 'inline-block',
            visibility: 'hidden',
            pointerEvents: 'none',
          }}
        >
          {logo.element}
        </div>
      )}
      <svg
        {...rest}
        ref={ref}
        role="img"
        aria-labelledby={titleId}
        width={r2(size)}
        height={r2(size)}
        viewBox={`0 0 ${svgSize} ${svgSize}`}
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        style={style}
      >
        <title id={titleId}>
          {xmlSafeText(ariaLabel ?? `QR code: ${value}`)}
        </title>
        {/* Background */}
        {backgroundColor !== 'transparent' && (
          <rect width={svgSize} height={svgSize} fill={backgroundColor} />
        )}

        {/* Mask cuts out the logo area regardless of background color */}
        {applyLogoMask && (
          <defs>
            <mask id={maskId}>
              <rect width={svgSize} height={svgSize} fill="white" />
              <rect
                x={r2(layout.clearX)}
                y={r2(layout.clearY)}
                width={r2(layout.clearWidth)}
                height={r2(layout.clearHeight)}
                fill="black"
              />
            </mask>
          </defs>
        )}

        <g mask={applyLogoMask ? `url(#${maskId})` : undefined}>
          {/* Data modules */}
          {dataPath && <path d={dataPath} fill={dotColor} />}

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
        </g>

        {/* Logo */}
        {hasLogoSrc && logo && logoWidth > 0 && logoHeight > 0 && (
          <>
            {logo.element ? (
              <foreignObject
                x={logoX}
                y={logoY}
                width={logoWidth}
                height={logoHeight}
              >
                {logo.element}
              </foreignObject>
            ) : (
              <image
                href={logo.src}
                x={logoX}
                y={logoY}
                width={logoWidth}
                height={logoHeight}
              />
            )}
          </>
        )}
      </svg>
    </>
  );
}

// Set explicitly: the published build is minified, so the inferred name is gone
// from React DevTools and from error stacks.
export const QRCode = /* @__PURE__ */ React.memo(
  React.forwardRef<SVGSVGElement, QRCodeComponentProps>(QRCodeRoot),
);
QRCode.displayName = 'QRCode';
