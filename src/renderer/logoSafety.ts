import type { ErrorCorrectionLevel } from '../types';

// Max logo area as fraction of svgSize² per ECL. sqrt(value) = linear logo/svgSize.
// Empirical safe linear limits: L≤15%, M≤20%, Q≤25%, H≤30%.
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
export function isSafeSrc(src: string): boolean {
  const s = src.trim().toLowerCase();
  if (s.startsWith('javascript:')) return false;
  if (s.startsWith('data:') && !s.startsWith('data:image/')) return false;
  return true;
}

export interface LogoEclResolution {
  ecLevel: ErrorCorrectionLevel;
  // Logo area as a fraction of svgSize², after clamping to the ECL's safe limit
  absoluteArea: number;
  // Area the user asked for before clamping — used for the dev warning
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
  // Normalize user size [0, 1] → absolute area (fraction of svgSize²)
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
