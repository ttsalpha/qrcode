import type { ReactNode, CSSProperties } from 'react';

export type DotStyle = 'square' | 'circle' | 'rounded';
export type CornerDotStyle = 'square' | 'rounded' | 'circle';
export type CornerSquareStyle = 'square' | 'rounded' | 'extra-rounded';
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
  width?: number;
  height?: number;
  padding?: number;
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
  width?: number;
  height?: number;
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
