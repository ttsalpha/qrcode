'use client';

declare const process: { env: { NODE_ENV: string } };

import * as React from 'react';
import type { QRCodeProps, CornerDotStyle, CornerSquareStyle } from '../types';
import { generateQRMatrix } from '../core/matrix';
import { getFinderPatterns } from '../renderer/svg';
import { buildDataModulesPath } from '../renderer/paths';
import {
  pickECLForArea,
  isSafeSrc,
  resolveLogoEcl,
} from '../renderer/logoSafety';
import { QRCorner } from './QRCorner';

// Avoid useLayoutEffect SSR warning while still running synchronously on the client
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect;

export const QRCode = /* @__PURE__ */ React.memo(function QRCode({
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
}: QRCodeProps): React.JSX.Element {
  const requestedVersion = qr?.version;
  const userECL = qr?.errorCorrectionLevel;
  const userSize = logo?.size;
  const hasLogoSrc = !!(logo?.element || (logo?.src && isSafeSrc(logo.src)));

  const { ecLevel, absoluteArea, targetArea, clamped } = resolveLogoEcl(
    hasLogoSrc,
    userSize,
    userECL,
  );
  if (process.env.NODE_ENV !== 'production' && clamped) {
    console.warn(
      `[QRCode] logo.size=${userSize} needs ECL ≥ "${pickECLForArea(targetArea)}"; ECL "${userECL}" set, logo clamped.`,
    );
  }

  const [srcAspectRatio, setSrcAspectRatio] = React.useState(1);
  const [elementAspectRatio, setElementAspectRatio] = React.useState(1);
  const measureRef = React.useRef<HTMLDivElement>(null);

  // Sync before first paint — handles cached images and static elements with no flash.
  // Falls back to async for uncached images (onload) and dynamic elements (ResizeObserver).
  useIsomorphicLayoutEffect(() => {
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
  }, [logo?.src]);

  useIsomorphicLayoutEffect(() => {
    if (!measureRef.current || !logo?.element) return;
    const { width, height } = measureRef.current.getBoundingClientRect();
    if (width && height) setElementAspectRatio(width / height);
  }, [logo?.element]);

  // ResizeObserver as safety net for elements whose size changes after mount
  // (e.g. logo.element contains an <img> that loads asynchronously).
  React.useEffect(() => {
    if (!measureRef.current || !logo?.element) return;
    const el = measureRef.current;
    const observer = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r?.width && r.height) setElementAspectRatio(r.width / r.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [logo?.element]);

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
    squareStyle === 'extra-rounded'
      ? 'rounded'
      : squareStyle === 'circle'
        ? 'circle'
        : 'square';
  const cornerDotStyleVal: CornerDotStyle =
    corner?.dot?.style ?? defaultCornerDotStyle;
  const cornerDotColor = corner?.dot?.color ?? dotColor;

  const dataPath = React.useMemo(
    () => buildDataModulesPath(matrix, moduleSize, marginPx, dotStyle),
    [matrix, moduleSize, marginPx, dotStyle],
  );
  const finderPatterns = React.useMemo(
    () => getFinderPatterns(qrSize, moduleSize, marginPx),
    [qrSize, moduleSize, marginPx],
  );

  const uid = React.useId().replace(/:/g, '');
  const maskId = uid + 'm';
  const titleId = uid + 't';

  const aspectRatio = logo?.element ? elementAspectRatio : srcAspectRatio;
  const clampedArea = absoluteArea * svgSize * svgSize;
  const logoBoxWidth = Math.sqrt(clampedArea * aspectRatio);
  const logoBoxHeight = Math.sqrt(clampedArea / aspectRatio);
  const logoMargin = logo?.margin ?? 0;
  const logoBoxX = (svgSize - logoBoxWidth) / 2;
  const logoBoxY = (svgSize - logoBoxHeight) / 2;
  const logoX = logoBoxX + logoMargin;
  const logoY = logoBoxY + logoMargin;
  const logoWidth = Math.max(0, logoBoxWidth - logoMargin * 2);
  const logoHeight = Math.max(0, logoBoxHeight - logoMargin * 2);

  const applyLogoMask =
    hasLogoSrc && logoWidth > 0 && logoHeight > 0 && (logo?.hideDots ?? true);

  return (
    <>
      {logo?.element && (
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
        role="img"
        aria-labelledby={titleId}
        width={size}
        height={size}
        viewBox={`0 0 ${svgSize} ${svgSize}`}
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        style={style}
      >
        <title id={titleId}>{ariaLabel ?? `QR code: ${value}`}</title>
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
                x={logoBoxX}
                y={logoBoxY}
                width={logoBoxWidth}
                height={logoBoxHeight}
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
});
