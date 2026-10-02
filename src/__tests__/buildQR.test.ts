import { describe, it, expect } from 'vitest';
import { buildQR } from '../core/buildQR';
import { toSVGString } from '../core/svgString';

const URL7 = 'https://shop.example.com/order?id=42&ref=qr&utm_source=table-01';
const LOGO = 'https://example.com/logo.png';

describe('buildQR', () => {
  it('describes a plain symbol with no logo', () => {
    const g = buildQR({ value: 'HELLO WORLD' });
    expect(g.size).toBe(256);
    expect(g.viewBox).toBeGreaterThan(0);
    expect(g.ecLevel).toBe('M');
    expect(g.background).toBe('#ffffff');
    expect(g.modules?.fill).toBe('#000000');
    expect(g.modules?.d).toMatch(/^M/);
    expect(g.finders).toHaveLength(3);
    expect(g.clear).toBeUndefined();
    expect(g.logo).toBeUndefined();
    expect(g.warnings).toEqual([]);
  });

  it('is deterministic', () => {
    const props = { value: URL7, dotStyle: 'rounded', logo: { src: LOGO } };
    expect(buildQR(props as never)).toEqual(buildQR(props as never));
  });

  it('leaves the background out when it is transparent', () => {
    expect(
      buildQR({ value: 'A', backgroundColor: 'transparent' }).background,
    ).toBeUndefined();
  });

  it('draws the finders with the corner colors and the ring evenodd', () => {
    const g = buildQR({
      value: 'A',
      dotColor: '#111111',
      corner: {
        square: { style: 'rounded', color: '#222222' },
        dot: { color: '#333333' },
      },
    });
    for (const finder of g.finders) {
      expect(finder.square.fill).toBe('#222222');
      expect(finder.square.fillRule).toBe('evenodd');
      expect(finder.dot.fill).toBe('#333333');
    }
  });

  it('places the logo inside the cleared area', () => {
    const g = buildQR({ value: URL7, logo: { src: LOGO, size: 0.5 } });
    expect(g.logo?.src).toBe(LOGO);
    expect(g.clear).toBeDefined();
    const { clear, logo } = g;
    expect(logo!.x).toBeGreaterThanOrEqual(clear!.x - 0.01);
    expect(logo!.y).toBeGreaterThanOrEqual(clear!.y - 0.01);
    expect(logo!.x + logo!.width).toBeLessThanOrEqual(
      clear!.x + clear!.width + 0.01,
    );
    expect(logo!.y + logo!.height).toBeLessThanOrEqual(
      clear!.y + clear!.height + 0.01,
    );
  });

  it('raises the error correction level for a bigger logo', () => {
    expect(
      buildQR({ value: URL7, logo: { src: LOGO, size: 0.1 } }).ecLevel,
    ).toBe('L');
    expect(buildQR({ value: URL7, logo: { src: LOGO, size: 1 } }).ecLevel).toBe(
      'H',
    );
  });

  it('keeps the dots under the logo when hideDots is off', () => {
    const g = buildQR({ value: URL7, logo: { src: LOGO, hideDots: false } });
    expect(g.logo).toBeDefined();
    expect(g.clear).toBeUndefined();
  });

  it('ignores an unsafe src', () => {
    const g = buildQR({ value: URL7, logo: { src: 'javascript:alert(1)' } });
    expect(g.logo).toBeUndefined();
    expect(g.clear).toBeUndefined();
  });

  describe('custom logo', () => {
    it('reserves the area without a src', () => {
      const g = buildQR({ value: URL7, logo: { custom: true } });
      expect(g.logo).toBeDefined();
      expect(g.logo?.src).toBeUndefined();
      expect(g.clear).toBeDefined();
    });

    it('sizes the area like a src logo', () => {
      const custom = buildQR({
        value: URL7,
        logo: { custom: true, size: 0.6 },
      });
      const withSrc = buildQR({ value: URL7, logo: { src: LOGO, size: 0.6 } });
      expect(custom.ecLevel).toBe(withSrc.ecLevel);
      expect(custom.clear).toEqual(withSrc.clear);
      expect({ ...custom.logo, src: undefined }).toEqual({
        ...withSrc.logo,
        src: undefined,
      });
    });
  });

  describe('warnings', () => {
    it('reports a logo clamped by an explicit error correction level', () => {
      const g = buildQR({
        value: URL7,
        qr: { errorCorrectionLevel: 'L' },
        logo: { src: LOGO, size: 1 },
      });
      expect(g.warnings).toHaveLength(1);
      expect(g.warnings[0]).toMatch(/logo clamped/);
    });

    it('reports a margin that leaves no room for the logo', () => {
      const g = buildQR({
        value: URL7,
        logo: { src: LOGO, margin: 50 },
      });
      expect(g.logo).toBeUndefined();
      expect(g.warnings.some((w) => /leaves no room/.test(w))).toBe(true);
    });
  });

  describe('errors', () => {
    it('throws for an empty value', () => {
      expect(() => buildQR({ value: '' })).toThrow(RangeError);
    });

    it('throws for a value that does not fit', () => {
      expect(() => buildQR({ value: 'a'.repeat(10000) })).toThrow(RangeError);
    });

    it('throws for an invalid size or margin', () => {
      expect(() => buildQR({ value: 'A', size: -1 })).toThrow(RangeError);
      expect(() => buildQR({ value: 'A', margin: NaN })).toThrow(RangeError);
    });
  });
});

describe('toSVGString with a custom logo', () => {
  it('draws no image, but still clears the area', () => {
    const svg = toSVGString({ value: URL7, logo: { custom: true } });
    expect(svg).not.toMatch(/<image/);
    expect(svg).toMatch(/<mask/);
  });
});
