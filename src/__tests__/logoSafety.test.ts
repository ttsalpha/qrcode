import { describe, it, expect } from 'vitest';
import {
  SAFE_AREAS,
  layoutLogo,
  resolveLogoEcl,
  type LogoLayoutInput,
} from '../renderer/logoSafety';
import type { ErrorCorrectionLevel } from '../types';

// The cleared area used to be a continuous fraction of the SVG with no relation
// to moduleSize, so its edges cut through modules: measured across versions 1 to
// 15 and sizes 0.3 to 0.8, 21 of 24 combinations left part of a dot showing.
// These assertions pin the grid alignment that replaced it.

const MODULE_SIZE = 8;
const MARGIN_MODULES = 4;

function inputFor(
  qrSize: number,
  logoSize: number,
  aspectRatio = 1,
  ecLevel?: ErrorCorrectionLevel,
): LogoLayoutInput {
  const resolved = resolveLogoEcl(true, logoSize, ecLevel);
  const totalModules = qrSize + MARGIN_MODULES * 2;
  return {
    absoluteArea: resolved.absoluteArea,
    aspectRatio,
    ecLevel: resolved.ecLevel,
    qrSize,
    totalModules,
    moduleSize: MODULE_SIZE,
    marginPx: MARGIN_MODULES * MODULE_SIZE,
  };
}

// QR sizes are 4·version + 17
const VERSIONS = [1, 3, 7, 15, 40];
const SIZES = [0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0];
const sizeOf = (version: number) => version * 4 + 17;

describe('layoutLogo', () => {
  it('clears a whole, odd number of modules on both axes', () => {
    for (const version of VERSIONS) {
      for (const logoSize of SIZES) {
        const input = inputFor(sizeOf(version), logoSize);
        const { clearWidth, clearHeight } = layoutLogo(input);

        const wModules = clearWidth / MODULE_SIZE;
        const hModules = clearHeight / MODULE_SIZE;
        expect(Number.isInteger(wModules)).toBe(true);
        expect(Number.isInteger(hModules)).toBe(true);
        // an even span would put the edges through module centres
        expect(wModules % 2).toBe(1);
        expect(hModules % 2).toBe(1);
      }
    }
  });

  it('starts the cleared area on a module boundary', () => {
    for (const version of VERSIONS) {
      for (const logoSize of SIZES) {
        const input = inputFor(sizeOf(version), logoSize);
        const { clearX, clearY } = layoutLogo(input);
        expect(Number.isInteger((clearX - input.marginPx) / MODULE_SIZE)).toBe(
          true,
        );
        expect(Number.isInteger((clearY - input.marginPx) / MODULE_SIZE)).toBe(
          true,
        );
      }
    }
  });

  it('centres the cleared area on the symbol', () => {
    for (const version of VERSIONS) {
      for (const logoSize of SIZES) {
        const input = inputFor(sizeOf(version), logoSize);
        const { clearX, clearY, clearWidth, clearHeight } = layoutLogo(input);
        const svgCentre = (input.totalModules * MODULE_SIZE) / 2;
        expect(clearX + clearWidth / 2).toBeCloseTo(svgCentre, 10);
        expect(clearY + clearHeight / 2).toBeCloseTo(svgCentre, 10);
      }
    }
  });

  it('never clears more than the EC level budgets for', () => {
    for (const version of VERSIONS) {
      for (const logoSize of SIZES) {
        const input = inputFor(sizeOf(version), logoSize);
        const { clearWidth, clearHeight } = layoutLogo(input);
        const svgSize = input.totalModules * MODULE_SIZE;
        const area = (clearWidth * clearHeight) / (svgSize * svgSize);
        expect(area).toBeLessThanOrEqual(SAFE_AREAS[input.ecLevel] + 1e-9);
      }
    }
  });

  it('keeps the logo inside the cleared area', () => {
    for (const version of VERSIONS) {
      for (const logoSize of SIZES) {
        for (const aspectRatio of [1, 2, 0.5, 3]) {
          const layout = layoutLogo(
            inputFor(sizeOf(version), logoSize, aspectRatio),
          );
          expect(layout.boxWidth).toBeLessThanOrEqual(layout.clearWidth + 1e-9);
          expect(layout.boxHeight).toBeLessThanOrEqual(
            layout.clearHeight + 1e-9,
          );
          expect(layout.boxX).toBeGreaterThanOrEqual(layout.clearX - 1e-9);
          expect(layout.boxY).toBeGreaterThanOrEqual(layout.clearY - 1e-9);
        }
      }
    }
  });

  it('never enlarges the logo beyond the size that was requested', () => {
    for (const version of VERSIONS) {
      for (const logoSize of SIZES) {
        for (const aspectRatio of [1, 2, 3]) {
          const input = inputFor(sizeOf(version), logoSize, aspectRatio);
          const svgSize = input.totalModules * MODULE_SIZE;
          const requestedArea = input.absoluteArea * svgSize * svgSize;
          const layout = layoutLogo(input);
          expect(layout.boxWidth).toBeLessThanOrEqual(
            Math.sqrt(requestedArea * aspectRatio) + 1e-9,
          );
        }
      }
    }
  });

  it('preserves the aspect ratio when it has to shrink the logo', () => {
    for (const aspectRatio of [2, 3, 0.5, 0.25]) {
      for (const version of VERSIONS) {
        const layout = layoutLogo(inputFor(sizeOf(version), 1.0, aspectRatio));
        expect(layout.boxWidth / layout.boxHeight).toBeCloseTo(aspectRatio, 6);
      }
    }
  });

  it('centres the logo inside the cleared area', () => {
    for (const aspectRatio of [1, 2, 0.5]) {
      const input = inputFor(sizeOf(7), 0.5, aspectRatio);
      const l = layoutLogo(input);
      expect(l.boxX + l.boxWidth / 2).toBeCloseTo(
        l.clearX + l.clearWidth / 2,
        10,
      );
      expect(l.boxY + l.boxHeight / 2).toBeCloseTo(
        l.clearY + l.clearHeight / 2,
        10,
      );
    }
  });

  it('produces nothing when there is no logo', () => {
    // rounding up before this check would turn a zero-size logo into one module
    const zero = layoutLogo(inputFor(sizeOf(3), 0));
    expect(zero.clearWidth).toBe(0);
    expect(zero.clearHeight).toBe(0);
    expect(zero.boxWidth).toBe(0);
    expect(zero.boxHeight).toBe(0);

    const noLogo = layoutLogo({
      ...inputFor(sizeOf(3), 0.4),
      absoluteArea: 0,
    });
    expect(noLogo.boxWidth).toBe(0);
  });

  it('never clears wider than the symbol, even for an extreme aspect ratio', () => {
    for (const aspectRatio of [8, 20, 1 / 8]) {
      const qrSize = sizeOf(1);
      const layout = layoutLogo(inputFor(qrSize, 1.0, aspectRatio));
      expect(layout.clearWidth).toBeLessThanOrEqual(qrSize * MODULE_SIZE);
      expect(layout.clearHeight).toBeLessThanOrEqual(qrSize * MODULE_SIZE);
      expect(layout.boxWidth).toBeLessThanOrEqual(layout.clearWidth + 1e-9);
    }
  });

  it('matches the worked examples from the spec of the rule', () => {
    // v7 at size 0.4: 10.06 modules rounds to 11, which is 4.31% against the
    // 4.00% level M is sized for, so it steps down to 9 and the logo follows.
    const v7 = layoutLogo(inputFor(sizeOf(7), 0.4));
    expect(v7.clearWidth / MODULE_SIZE).toBe(9);
    expect(v7.boxWidth / MODULE_SIZE).toBeCloseTo(9, 6);

    // v3 at size 0.6: 8.60 modules rounds to 9 and stays within budget, so the
    // logo keeps the size that was asked for.
    const v3 = layoutLogo(inputFor(sizeOf(3), 0.6));
    expect(v3.clearWidth / MODULE_SIZE).toBe(9);
    expect(v3.boxWidth / MODULE_SIZE).toBeCloseTo(8.6, 1);
  });
});
