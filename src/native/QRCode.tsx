declare const process: { env: { NODE_ENV?: string } } | undefined;

import * as React from 'react';
import Svg, {
  ClipPath,
  Defs,
  G,
  Image,
  Mask,
  Path,
  Rect,
  SvgXml,
} from 'react-native-svg';
import type { SvgProps } from 'react-native-svg';
import { buildQR } from '../core/buildQR';
import type { CoreLogoOptions, QRCodeOptions, QRGeometry } from '../core/types';

const isDev =
  typeof process === 'undefined' || process.env?.NODE_ENV !== 'production';

export interface NativeLogoOptions extends Omit<
  CoreLogoOptions,
  'custom' | 'src'
> {
  /**
   * A remote URL, or a local asset from `require('./logo.png')`. For a vector
   * logo use `svg`.
   */
  src?: string | number;
  /** A logo as SVG markup, drawn with `SvgXml`. Wins over `src` when both are set. */
  svg?: string;
  /** Not supported on native: there is no `<foreignObject>`. Use `src` or `svg`. */
  element?: never;
}

export interface NativeQRCodeProps
  extends
    Omit<QRCodeOptions, 'logo'>,
    Omit<
      SvgProps,
      keyof QRCodeOptions | 'width' | 'height' | 'viewBox' | 'children' | 'ref'
    > {
  logo?: NativeLogoOptions;
  /** Read by screen readers. Default: `QR code: <value>`. */
  ariaLabel?: string;
  /**
   * Called with the error when the symbol cannot be drawn, such as a `value`
   * that does not fit. The component renders nothing then. Without it the
   * error is thrown while rendering.
   */
  onError?: (error: Error) => void;
}

type Built = { geometry: QRGeometry; error?: undefined } | { error: Error };

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
    ariaLabel,
    onError,
    ...rest
  }: NativeQRCodeProps,
  ref: React.ForwardedRef<React.ElementRef<typeof Svg>>,
): React.JSX.Element | null {
  const uid = React.useId().replace(/:/g, '');
  const maskId = uid + 'm';
  const clipId = uid + 'c';

  // Kept in a ref so an inline callback does not re-fire the effect below.
  const onErrorRef = React.useRef(onError);
  onErrorRef.current = onError;

  const { src, svg, element, ...logoRest } = logo ?? {};
  const logoSrc = typeof src === 'string' ? src : undefined;
  // `svg` and a local asset are drawn here, so the core only reserves the area.
  const custom = !!svg || typeof src === 'number';

  if (isDev && element) {
    console.warn(
      '[QRCode] logo.element is not supported on React Native and was ignored; pass logo.src or logo.svg.',
    );
  }

  // Memoized on primitives so a failing symbol keeps one error object across
  // renders, and onError fires once rather than on every re-render.
  const built = React.useMemo((): Built => {
    try {
      return {
        geometry: buildQR({
          value,
          size,
          margin,
          dotStyle,
          dotColor,
          backgroundColor,
          corner,
          qr,
          logo: logo && { ...logoRest, src: logoSrc, custom },
        }),
      };
    } catch (err) {
      if (!onErrorRef.current) throw err;
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }, [
    value,
    size,
    margin,
    dotStyle,
    dotColor,
    backgroundColor,
    corner?.square?.style,
    corner?.square?.color,
    corner?.dot?.style,
    corner?.dot?.color,
    qr?.errorCorrectionLevel,
    qr?.version,
    !!logo,
    logoSrc,
    custom,
    logoRest.size,
    logoRest.aspectRatio,
    logoRest.margin,
    logoRest.hideDots,
    logoRest.radius,
    !!onError,
  ]);

  const error = built.error;
  React.useEffect(() => {
    if (error) onErrorRef.current?.(error);
  }, [error]);

  if (built.error) return null;
  const { geometry } = built;
  if (isDev) {
    for (const warning of geometry.warnings) console.warn(warning);
  }

  const { viewBox, background, modules, finders, clear } = geometry;
  const logoBox = geometry.logo;
  const clipPath =
    logoBox && logoBox.radius > 0 ? `url(#${clipId})` : undefined;

  return (
    <Svg
      accessible
      accessibilityRole="image"
      accessibilityLabel={ariaLabel ?? `QR code: ${value}`}
      {...rest}
      ref={ref}
      width={geometry.size}
      height={geometry.size}
      viewBox={`0 0 ${viewBox} ${viewBox}`}
    >
      {background !== undefined && (
        <Rect width={viewBox} height={viewBox} fill={background} />
      )}

      {clear && (
        <Defs>
          <Mask id={maskId}>
            <Rect width={viewBox} height={viewBox} fill="white" />
            <Rect
              x={clear.x}
              y={clear.y}
              width={clear.width}
              height={clear.height}
              fill="black"
            />
          </Mask>
        </Defs>
      )}

      <G mask={clear ? `url(#${maskId})` : undefined}>
        {modules && <Path d={modules.d} fill={modules.fill} />}
        {finders.map((finder, idx) => (
          <G key={idx}>
            <Path
              d={finder.square.d}
              fill={finder.square.fill}
              fillRule="evenodd"
            />
            <Path d={finder.dot.d} fill={finder.dot.fill} />
          </G>
        ))}
      </G>

      {logoBox && clipPath && (
        <Defs>
          <ClipPath id={clipId}>
            <Rect
              x={logoBox.x}
              y={logoBox.y}
              width={logoBox.width}
              height={logoBox.height}
              rx={logoBox.radius}
              ry={logoBox.radius}
            />
          </ClipPath>
        </Defs>
      )}

      {logoBox && svg ? (
        // The clip is in absolute coordinates, so it cannot sit on the group
        // that translates its children.
        <G clipPath={clipPath}>
          <G x={logoBox.x} y={logoBox.y}>
            <SvgXml xml={svg} width={logoBox.width} height={logoBox.height} />
          </G>
        </G>
      ) : logoBox && typeof src === 'number' ? (
        <Image
          href={src}
          x={logoBox.x}
          y={logoBox.y}
          width={logoBox.width}
          height={logoBox.height}
          clipPath={clipPath}
        />
      ) : logoBox?.src ? (
        <Image
          href={{ uri: logoBox.src }}
          x={logoBox.x}
          y={logoBox.y}
          width={logoBox.width}
          height={logoBox.height}
          clipPath={clipPath}
        />
      ) : null}
    </Svg>
  );
}

export const QRCode = /* @__PURE__ */ React.memo(
  React.forwardRef<React.ElementRef<typeof Svg>, NativeQRCodeProps>(QRCodeRoot),
);
QRCode.displayName = 'QRCode';
