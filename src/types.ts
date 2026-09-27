import type { ReactNode, CSSProperties, SVGProps } from 'react';

export type DotStyle = 'square' | 'circle' | 'rounded';
export type CornerDotStyle = 'square' | 'rounded' | 'circle';
export type CornerSquareStyle =
  'square' | 'rounded' | 'extra-rounded' | 'circle';
export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';
export type EncodingMode = 'numeric' | 'alphanumeric' | 'byte';

export interface LogoOptions {
  /**
   * URL of the logo image. `javascript:` and non-image `data:` URLs are
   * silently rejected. Only pass values you control or have validated.
   */
  src?: string;
  /**
   * Arbitrary React node rendered inside a `<foreignObject>`. Never pass
   * content derived from untrusted user input without sanitising it first,
   * as it is rendered verbatim and can execute scripts.
   */
  element?: ReactNode;
  /**
   * Logo size on a 0–1 scale relative to the maximum safe area.
   * `0` = no logo, `1` = the largest safe logo (covers ~9% of QR area, uses ECL H).
   * Default: `0.4`.
   *
   * If `qr.errorCorrectionLevel` is not set, the component auto-picks the lowest ECL
   * that safely supports the requested size:
   * - `size ≤ 0.25` → ECL L
   * - `size ≤ 0.44` → ECL M
   * - `size ≤ 0.69` → ECL Q
   * - `size ≤ 1.00` → ECL H
   *
   * If `errorCorrectionLevel` is set, the size is clamped to that ECL's safe
   * limit, with a console warning outside production builds.
   */
  size?: number;
  /**
   * Width divided by height. `<QRCode>` measures this from `src` or `element`
   * once it loads; set it to skip the measurement and the reflow that follows,
   * and to get the same layout from `toSVGString`, which cannot load the image
   * and otherwise assumes a square. Default: `1`.
   */
  aspectRatio?: number;
  /**
   * Space between the logo and the edge of the cleared area, in modules, like
   * the symbol's own `margin`, so the result does not change with `size`.
   * Fractions are allowed. Larger = smaller logo, and a value wider than the
   * cleared area leaves no logo at all. Default: `0`
   */
  margin?: number;
  /** Clear QR dots behind the logo area. Recommended when logo has transparency. */
  hideDots?: boolean;
}

export interface CornerOptions {
  dot?: {
    style?: CornerDotStyle;
    color?: string;
  };
  square?: {
    style?: CornerSquareStyle;
    color?: string;
  };
}

export interface QROptions {
  errorCorrectionLevel?: ErrorCorrectionLevel;
  version?: number;
}

// The data contract both renderers share. toSVGString reads exactly these.
export interface QRCodeProps {
  value: string;
  size?: number;
  margin?: number;
  dotStyle?: DotStyle;
  dotColor?: string;
  backgroundColor?: string;
  corner?: CornerOptions;
  logo?: LogoOptions;
  qr?: QROptions;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
  /**
   * Prefix for the ids this symbol generates internally. `toSVGString` derives
   * them from the props so its output stays content-hashable, which means two
   * identical codes on one page share ids. Give one of them a prefix to keep
   * the document valid. `<QRCode>` uses React's own unique id and ignores this.
   */
  idPrefix?: string;
}

/**
 * Props for `<QRCode>`: the shared contract plus anything else an `<svg>`
 * accepts, such as `id`, `onClick` and `data-*`, which are spread onto the
 * root element. Only the component takes these; `toSVGString` renders from
 * {@link QRCodeProps} alone and would silently drop them.
 */
export type QRCodeComponentProps = QRCodeProps &
  Omit<
    SVGProps<SVGSVGElement>,
    | keyof QRCodeProps
    | 'children'
    | 'ref'
    | 'width'
    | 'height'
    | 'viewBox'
    // Set from the component's own props, so accepting them would only
    // advertise an override that never happens.
    | 'role'
    | 'aria-labelledby'
    // Throws at render: the component always has children.
    | 'dangerouslySetInnerHTML'
  >;
