import type { ReactNode, CSSProperties } from 'react';

export type DotStyle = 'square' | 'circle' | 'rounded';
export type CornerDotStyle = 'square' | 'rounded' | 'circle';
export type CornerSquareStyle =
  | 'square'
  | 'rounded'
  | 'extra-rounded'
  | 'circle';
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
   * If `errorCorrectionLevel` is set, the size is clamped to that ECL's safe limit
   * and a console warning is emitted (development only) when clamping occurs.
   *
   * Aspect ratio is auto-detected from `src` or `element`.
   */
  size?: number;
  /** Space between the logo and the edge of the cleared area. Larger = smaller logo. Default: `0` */
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
}
