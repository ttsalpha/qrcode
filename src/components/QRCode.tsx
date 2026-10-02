'use client';

declare const process: { env: { NODE_ENV?: string } } | undefined;

import * as React from 'react';
import type { QRCodeComponentProps } from '../types';
import { buildQR } from '../core/buildQR';
import { isSafeSrc } from '../core/logoSafety';
import { xmlSafeText } from '../core/shapes';

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

  const aspectRatio = measured
    ? logo?.element
      ? elementAspectRatio
      : srcAspectRatio
    : explicitAspect;

  // `element` is drawn here, not by the core, which only reserves its area.
  const { element: logoElement, ...logoRest } = logo ?? {};
  const geometry = buildQR({
    value,
    size,
    margin,
    dotStyle,
    dotColor,
    backgroundColor,
    corner,
    qr,
    logo: logo && { ...logoRest, custom: !!logoElement, aspectRatio },
  });
  if (isDev) {
    for (const warning of geometry.warnings) console.warn(warning);
  }

  const uid = React.useId().replace(/:/g, '');
  const maskId = uid + 'm';
  const titleId = uid + 't';
  const { viewBox, background, modules, finders, clear } = geometry;
  const logoBox = geometry.logo;

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
        width={geometry.size}
        height={geometry.size}
        viewBox={`0 0 ${viewBox} ${viewBox}`}
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        style={style}
      >
        <title id={titleId}>
          {xmlSafeText(ariaLabel ?? `QR code: ${value}`)}
        </title>
        {/* Background */}
        {background !== undefined && (
          <rect width={viewBox} height={viewBox} fill={background} />
        )}

        {/* Mask cuts out the logo area regardless of background color */}
        {clear && (
          <defs>
            <mask id={maskId}>
              <rect width={viewBox} height={viewBox} fill="white" />
              <rect
                x={clear.x}
                y={clear.y}
                width={clear.width}
                height={clear.height}
                fill="black"
              />
            </mask>
          </defs>
        )}

        <g mask={clear ? `url(#${maskId})` : undefined}>
          {/* Data modules */}
          {modules && <path d={modules.d} fill={modules.fill} />}

          {/* Finder patterns (corners) */}
          {finders.map((finder, idx) => (
            <g key={`corner-${idx}`}>
              <path
                d={finder.square.d}
                fill={finder.square.fill}
                fillRule="evenodd"
              />
              <path d={finder.dot.d} fill={finder.dot.fill} />
            </g>
          ))}
        </g>

        {/* Logo */}
        {logoBox && (logoElement || logoBox.src) && (
          <>
            {logoElement ? (
              <foreignObject
                x={logoBox.x}
                y={logoBox.y}
                width={logoBox.width}
                height={logoBox.height}
              >
                {logoElement}
              </foreignObject>
            ) : (
              <image
                href={logoBox.src}
                x={logoBox.x}
                y={logoBox.y}
                width={logoBox.width}
                height={logoBox.height}
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
