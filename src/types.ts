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
   * Logo size as a fraction of the QR size (0–1). Default: `0.2`
   *
   * Automatically clamped to keep the QR scannable based on error correction level:
   * `L` → 0.15, `M` → 0.22, `Q` → 0.32, `H` → 0.40
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
}
