export type DotStyle = 'square' | 'circle' | 'rounded';
export type CornerDotStyle = 'square' | 'rounded' | 'circle';
export type CornerSquareStyle =
  'square' | 'rounded' | 'extra-rounded' | 'circle';
export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';
export type EncodingMode = 'numeric' | 'alphanumeric' | 'byte';

export interface CoreLogoOptions {
  /**
   * URL of the logo image. `javascript:` and non-image `data:` URLs are
   * silently rejected. Only pass values you control or have validated.
   */
  src?: string;
  /**
   * Reserve the logo area for content the adapter draws itself, with no `src`.
   * The area is still sized, cleared and checked against the error correction
   * level; `QRGeometry.logo` comes back without a `src`.
   */
  custom?: boolean;
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

/** What decides the drawing. Everything `buildQR` reads is in here. */
export interface QRCodeOptions {
  value: string;
  size?: number;
  margin?: number;
  dotStyle?: DotStyle;
  dotColor?: string;
  backgroundColor?: string;
  corner?: CornerOptions;
  logo?: CoreLogoOptions;
  qr?: QROptions;
}

/** CSS declarations as a plain object, with camelCase or custom-property keys. */
export interface StyleMap {
  [property: string]: string | number | null | undefined;
}

/** `QRCodeOptions` plus what `toSVGString` writes onto the root element. */
export interface SVGStringOptions extends QRCodeOptions {
  className?: string;
  style?: StyleMap;
  ariaLabel?: string;
  /**
   * Prefix for the ids this symbol generates internally. `toSVGString` derives
   * them from the props so its output stays content-hashable, which means two
   * identical codes on one page share ids. Give one of them a prefix to keep
   * the document valid. `<QRCode>` uses React's own unique id and ignores this.
   */
  idPrefix?: string;
}

export interface QRPath {
  /** SVG path data, already rounded. */
  d: string;
  fill: string;
  fillRule?: 'evenodd';
}

export interface QRRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface QRLogoGeometry extends QRRect {
  /** Absent when the logo is `custom`: the adapter draws it. */
  src?: string;
}

export interface QRFinder {
  /** The 7×7 ring; draw with `fillRule: 'evenodd'`. */
  square: QRPath;
  /** The 3×3 dot inside it. */
  dot: QRPath;
}

/**
 * Everything needed to draw one symbol, in a square coordinate space of
 * `viewBox` units. Draw in this order: background, then `modules` and
 * `finders` with `clear` knocked out of them, then `logo`.
 */
export interface QRGeometry {
  /** Rendered width and height. */
  size: number;
  /** Side of the square viewBox. */
  viewBox: number;
  /** The error correction level actually used, after logo sizing. */
  ecLevel: ErrorCorrectionLevel;
  /** Absent when the background is transparent. */
  background?: string;
  /** All data modules in one path; absent when there are none to draw. */
  modules?: QRPath;
  /** The three finder patterns: top left, top right, bottom left. */
  finders: QRFinder[];
  /** Area to cut out of `modules` and `finders`, present when dots hide behind the logo. */
  clear?: QRRect;
  /** Present when a logo is drawn. */
  logo?: QRLogoGeometry;
  /** Developer-facing notes, such as a logo that was clamped to fit. */
  warnings: string[];
}
