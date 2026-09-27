import type { ErrorCorrectionLevel } from '../types';

// Max logo area as a fraction of the symbol area per ECL, where the symbol is
// the QR grid itself. sqrt(value) = the logo's linear share of it. Empirical
// safe linear limits: L≤15%, M≤20%, Q≤25%, H≤30%.
//
// Denominated by the symbol rather than the padded canvas on purpose: the
// margin carries no error correction, so counting it would let a larger margin
// silently buy a larger logo and destroy more of the data it has to sit on.
export const SAFE_AREAS = { L: 0.0225, M: 0.04, Q: 0.0625, H: 0.09 } as const;
export const MAX_SAFE_AREA = SAFE_AREAS.H;
export const DEFAULT_SIZE_RATIO = 0.4;

export function pickECLForArea(area: number): ErrorCorrectionLevel {
  if (area <= SAFE_AREAS.L) return 'L';
  if (area <= SAFE_AREAS.M) return 'M';
  if (area <= SAFE_AREAS.Q) return 'Q';
  return 'H';
}

// Block javascript: and non-image data: URLs; allow everything else
// (https, http, relative paths, blob:, data:image/…).
//
// Browsers strip tab, LF and CR from a URL before parsing it, so
// "java\tscript:" reaches the same handler as "javascript:". This strips every
// code unit up to 0x20, a superset, which can only reject more.
const SCHEME_NOISE = /[\u0000-\u0020]/g;

export function isSafeSrc(src: string): boolean {
  const s = src.replace(SCHEME_NOISE, '').toLowerCase();
  if (s.startsWith('javascript:')) return false;
  if (s.startsWith('data:') && !s.startsWith('data:image/')) return false;
  return true;
}

// A zero, negative or non-finite ratio would make the logo box collapse or turn
// into NaN geometry, so anything unusable falls back to square.
export function logoAspectRatio(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : 1;
}

export interface LogoEclResolution {
  ecLevel: ErrorCorrectionLevel;
  // Logo area as a fraction of the symbol area, clamped to the ECL's safe limit
  absoluteArea: number;
  // Area the user asked for before clamping, used for the dev warning
  targetArea: number;
  // True when an explicit ECL forced the logo area to shrink
  clamped: boolean;
}

// Resolves the effective error correction level and logo area from the
// user's logo settings. Shared by the React component and the headless
// builder so both always pick the same ECL for identical props.
export function resolveLogoEcl(
  hasLogo: boolean,
  userSize: number | undefined,
  userECL: ErrorCorrectionLevel | undefined,
): LogoEclResolution {
  // Normalize user size [0, 1] → absolute area (fraction of the symbol area)
  const sizeRatio = hasLogo
    ? userSize !== undefined
      ? Math.max(0, Math.min(1, userSize))
      : DEFAULT_SIZE_RATIO
    : 0;
  const targetArea = sizeRatio * MAX_SAFE_AREA;

  if (userECL) {
    return {
      ecLevel: userECL,
      absoluteArea: Math.min(targetArea, SAFE_AREAS[userECL]),
      targetArea,
      clamped: targetArea > SAFE_AREAS[userECL],
    };
  }
  if (targetArea > 0) {
    return {
      ecLevel: pickECLForArea(targetArea),
      absoluteArea: targetArea,
      targetArea,
      clamped: false,
    };
  }
  return { ecLevel: 'M', absoluteArea: 0, targetArea, clamped: false };
}

// A centred rect can only land on module boundaries if it spans an odd number
// of modules. qrSize is 4·version+17, always odd, and margin·2 is always even,
// so the symbol centre is the centre of a module; an even span would put the
// rect's edges through module centres, which is the artefact this avoids.
function ceilOdd(modules: number): number {
  const whole = Math.ceil(modules);
  return Math.max(1, whole % 2 === 0 ? whole + 1 : whole);
}

export interface LogoLayout {
  // Mask rect in SVG pixel coordinates, always a whole number of modules
  clearX: number;
  clearY: number;
  clearWidth: number;
  clearHeight: number;
  // Logo box, centred in the mask rect, aspect ratio preserved
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
}

const EMPTY_LAYOUT: LogoLayout = {
  clearX: 0,
  clearY: 0,
  clearWidth: 0,
  clearHeight: 0,
  boxX: 0,
  boxY: 0,
  boxWidth: 0,
  boxHeight: 0,
};

export interface LogoLayoutInput {
  // Fraction of the symbol area the logo may cover, from resolveLogoEcl
  absoluteArea: number;
  aspectRatio: number;
  ecLevel: ErrorCorrectionLevel;
  qrSize: number;
  moduleSize: number;
  marginPx: number;
}

// Places the logo and the area cleared behind it on the module grid, so no dot
// is ever left half covered.
//
// The cleared area is rounded up to whole modules, which can push it past the
// area budget the EC level was chosen for (on v9 at size 0.4, 10.06 modules
// rounds to 11, or 4.31% against the 4.00% level M is sized for). When that
// happens the search steps down and the logo shrinks to fit the smaller square.
//
// Both axes scale by one factor rather than rounding independently, which is
// what keeps a non-square logo from being distorted: a 3:1 logo would otherwise
// lose 40% of its width while its height grew.
//
// Shared by the React component and the headless builder so the two can never
// disagree about where the logo sits.
export function layoutLogo({
  absoluteArea,
  aspectRatio,
  ecLevel,
  qrSize,
  moduleSize,
  marginPx,
}: LogoLayoutInput): LogoLayout {
  const symbolSize = qrSize * moduleSize;
  const clampedArea = absoluteArea * symbolSize * symbolSize;
  const wantWidth = Math.sqrt(clampedArea * aspectRatio);
  const wantHeight = Math.sqrt(clampedArea / aspectRatio);

  // Must short-circuit before rounding, or a zero-size logo would round up to
  // one module and become visible.
  if (!(wantWidth > 0) || !(wantHeight > 0)) return EMPTY_LAYOUT;

  const wantWidthModules = wantWidth / moduleSize;
  const wantHeightModules = wantHeight / moduleSize;
  // Budget in module², so it can be compared without leaving module units
  const budget = SAFE_AREAS[ecLevel] * qrSize * qrSize;

  // The budget is an area, so a very wide logo could satisfy it with a
  // one-module strip spanning the symbol and still wipe out the timing
  // patterns and the finder separators, which no error correction can
  // reconstruct. A centred span of qrSize - 16 stops 8 modules short of each
  // edge, clearing all three. qrSize is odd, so the cap is odd too.
  const maxSpan = Math.max(1, qrSize - 16);

  let clearWidthModules = Math.min(ceilOdd(wantWidthModules), maxSpan);
  let clearHeightModules = 1;
  for (;;) {
    const scale = Math.min(1, clearWidthModules / wantWidthModules);
    clearHeightModules = Math.min(ceilOdd(wantHeightModules * scale), maxSpan);
    if (
      clearWidthModules * clearHeightModules <= budget ||
      clearWidthModules <= 1
    ) {
      break;
    }
    clearWidthModules -= 2;
  }

  // Fit against both axes so the logo never spills out of the cleared area,
  // including when a very wide logo hit the maxSpan clamp above.
  const fit = Math.min(
    1,
    clearWidthModules / wantWidthModules,
    clearHeightModules / wantHeightModules,
  );
  const boxWidth = wantWidth * fit;
  const boxHeight = wantHeight * fit;

  const clearWidth = clearWidthModules * moduleSize;
  const clearHeight = clearHeightModules * moduleSize;
  // Anchored to the QR grid rather than the SVG centre: qrSize and the span are
  // both odd, so the offset is a whole number of modules even if the caller
  // passes a fractional margin.
  const clearX = marginPx + ((qrSize - clearWidthModules) / 2) * moduleSize;
  const clearY = marginPx + ((qrSize - clearHeightModules) / 2) * moduleSize;

  return {
    clearX,
    clearY,
    clearWidth,
    clearHeight,
    boxX: clearX + (clearWidth - boxWidth) / 2,
    boxY: clearY + (clearHeight - boxHeight) / 2,
    boxWidth,
    boxHeight,
  };
}
