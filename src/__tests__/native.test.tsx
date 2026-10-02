import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, cleanup } from '@testing-library/react';
import { QRCode } from '../native/QRCode';
import { toSVGString } from '../core/svgString';
import type { NativeQRCodeProps } from '../native/QRCode';

// react-native-svg needs the native runtime, so each component becomes the
// DOM element of the same name. Props React DOM would not recognise are mapped
// to attributes a test can read.
vi.mock('react-native-svg', async () => {
  const React = await import('react');
  type Props = { children?: React.ReactNode; [prop: string]: any };
  const host = (tag: string) =>
    React.forwardRef<Element, Props>(function Host(
      { children, ...props },
      ref,
    ) {
      return React.createElement(tag, { ...props, ref }, children);
    });
  const Svg = React.forwardRef<Element, Props>(function Svg(
    {
      children,
      accessible,
      accessibilityRole,
      accessibilityLabel,
      testID,
      ...props
    },
    ref,
  ) {
    return React.createElement(
      'svg',
      {
        ...props,
        ref,
        role: accessibilityRole,
        'aria-label': accessibilityLabel,
        'data-accessible': String(accessible),
        'data-testid': testID,
      },
      children,
    );
  });
  const Image = ({ href, ...props }: Props) =>
    React.createElement('image', {
      ...props,
      href:
        typeof href === 'number'
          ? `asset:${href}`
          : (href as { uri: string }).uri,
    });
  const SvgXml = ({ xml, ...props }: Props) =>
    React.createElement('g', { ...props, 'data-xml': xml });
  return {
    default: Svg,
    Svg,
    Image,
    SvgXml,
    Path: host('path'),
    Rect: host('rect'),
    G: host('g'),
    Defs: host('defs'),
    Mask: host('mask'),
    ClipPath: host('clipPath'),
  };
});

const URL7 = 'https://shop.example.com/order?id=42&ref=qr&utm_source=table-01';
const LOGO = 'https://example.com/logo.png';

afterEach(cleanup);

const draw = (props: NativeQRCodeProps) => render(<QRCode {...props} />);

const geometryOf = (root: ParentNode) => {
  const maskRect = root.querySelectorAll('mask rect')[1];
  const image = root.querySelector('image');
  const svg = root.querySelector('svg')!;
  return {
    width: svg.getAttribute('width'),
    height: svg.getAttribute('height'),
    viewBox: svg.getAttribute('viewBox'),
    paths: [...root.querySelectorAll('path')].map((p) => p.getAttribute('d')),
    mask: maskRect && {
      x: maskRect.getAttribute('x'),
      y: maskRect.getAttribute('y'),
      width: maskRect.getAttribute('width'),
      height: maskRect.getAttribute('height'),
    },
    logo: image && {
      x: image.getAttribute('x'),
      y: image.getAttribute('y'),
      width: image.getAttribute('width'),
      height: image.getAttribute('height'),
    },
  };
};

const fromString = (props: Parameters<typeof toSVGString>[0]) =>
  geometryOf(
    new DOMParser().parseFromString(toSVGString(props), 'image/svg+xml'),
  );

describe('native <QRCode>', () => {
  describe('draws the same geometry as toSVGString', () => {
    const cases: Array<[string, Parameters<typeof toSVGString>[0]]> = [
      ['default', { value: 'HELLO WORLD' }],
      ['size and margin', { value: 'HELLO WORLD', size: 333, margin: 2 }],
      ['dot circle', { value: 'HELLO WORLD', dotStyle: 'circle' }],
      ['dot rounded', { value: 'HELLO WORLD', dotStyle: 'rounded' }],
      [
        'corner styles',
        {
          value: 'HELLO WORLD',
          corner: {
            square: { style: 'extra-rounded' },
            dot: { style: 'circle' },
          },
        },
      ],
      ['transparent', { value: 'HELLO WORLD', backgroundColor: 'transparent' }],
      ['v7 payload', { value: 'A'.repeat(200), size: 333 }],
      ['logo', { value: URL7, logo: { src: LOGO, size: 0.5, aspectRatio: 1 } }],
      [
        'wide logo',
        { value: URL7, logo: { src: LOGO, size: 0.5, aspectRatio: 3 } },
      ],
      [
        'logo, margin and radius',
        { value: URL7, logo: { src: LOGO, margin: 1, radius: 0.5 } },
      ],
    ];
    for (const [label, props] of cases) {
      it(label, () => {
        const { container } = draw(props as NativeQRCodeProps);
        expect(geometryOf(container)).toEqual(fromString(props));
      });
    }
  });

  it('colors the symbol', () => {
    const { container } = draw({
      value: 'A',
      dotColor: '#112233',
      backgroundColor: '#445566',
      corner: { square: { color: '#778899' }, dot: { color: '#aabbcc' } },
    });
    expect(container.querySelector('rect')?.getAttribute('fill')).toBe(
      '#445566',
    );
    const fills = [...container.querySelectorAll('path')].map((p) =>
      p.getAttribute('fill'),
    );
    expect(fills).toContain('#112233');
    expect(fills).toContain('#778899');
    expect(fills).toContain('#aabbcc');
  });

  it('draws the finder ring with the even-odd rule', () => {
    const { container } = draw({ value: 'A' });
    const rings = [...container.querySelectorAll('path[fill-rule]')];
    expect(rings).toHaveLength(3);
  });

  it('leaves the background out when transparent', () => {
    const { container } = draw({ value: 'A', backgroundColor: 'transparent' });
    expect(container.querySelector('svg > rect')).toBeNull();
  });

  describe('accessibility', () => {
    it('is an image with a default label', () => {
      const { container } = draw({ value: 'hello' });
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('role')).toBe('image');
      expect(svg.getAttribute('aria-label')).toBe('QR code: hello');
      expect(svg.getAttribute('data-accessible')).toBe('true');
    });

    it('takes a custom label', () => {
      const { container } = draw({ value: 'hello', ariaLabel: 'Scan to pay' });
      expect(container.querySelector('svg')?.getAttribute('aria-label')).toBe(
        'Scan to pay',
      );
    });

    it('lets the caller override the defaults and pass testID', () => {
      const { container } = draw({
        value: 'hello',
        accessible: false,
        testID: 'qr',
      });
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('data-accessible')).toBe('false');
      expect(svg.getAttribute('data-testid')).toBe('qr');
    });
  });

  it('forwards the ref to the Svg', () => {
    const ref = React.createRef<never>();
    render(<QRCode value="A" ref={ref} />);
    expect((ref.current as unknown as Element).tagName).toBe('svg');
  });

  describe('logo', () => {
    it('draws a remote image from a string src', () => {
      const { container } = draw({ value: URL7, logo: { src: LOGO } });
      expect(container.querySelector('image')?.getAttribute('href')).toBe(LOGO);
    });

    it('draws a local asset from a number src', () => {
      const { container } = draw({ value: URL7, logo: { src: 7 } });
      expect(container.querySelector('image')?.getAttribute('href')).toBe(
        'asset:7',
      );
      expect(container.querySelector('mask')).not.toBeNull();
    });

    it('draws svg markup with SvgXml', () => {
      const xml = '<svg viewBox="0 0 1 1"><circle r="1"/></svg>';
      const { container } = draw({ value: URL7, logo: { svg: xml } });
      const el = container.querySelector('[data-xml]')!;
      expect(el.getAttribute('data-xml')).toBe(xml);
      expect(container.querySelector('image')).toBeNull();
    });

    it('prefers svg over src', () => {
      const { container } = draw({
        value: URL7,
        logo: { src: LOGO, svg: '<svg/>' },
      });
      expect(container.querySelector('[data-xml]')).not.toBeNull();
      expect(container.querySelector('image')).toBeNull();
    });

    it('places a custom logo in the same box as an image logo', () => {
      const aspectRatio = 1;
      const withImage = draw({
        value: URL7,
        logo: { src: LOGO, aspectRatio },
      });
      const imageBox = geometryOf(withImage.container).logo;
      cleanup();
      const { container } = draw({
        value: URL7,
        logo: { svg: '<svg/>', aspectRatio },
      });
      const g = container.querySelector('[data-xml]')!;
      expect(g.getAttribute('width')).toBe(imageBox!.width);
      expect(g.getAttribute('height')).toBe(imageBox!.height);
      expect(g.parentElement?.getAttribute('x')).toBe(imageBox!.x);
      expect(g.parentElement?.getAttribute('y')).toBe(imageBox!.y);
    });

    it('ignores an unsafe string src', () => {
      const { container } = draw({
        value: URL7,
        logo: { src: 'javascript:alert(1)' },
      });
      expect(container.querySelector('image')).toBeNull();
      expect(container.querySelector('mask')).toBeNull();
    });

    it('keeps the dots when hideDots is off', () => {
      const { container } = draw({
        value: URL7,
        logo: { src: LOGO, hideDots: false },
      });
      expect(container.querySelector('image')).not.toBeNull();
      expect(container.querySelector('mask')).toBeNull();
    });

    it('rounds the corners with a clip path', () => {
      const { container } = draw({
        value: URL7,
        logo: { src: LOGO, radius: 1, aspectRatio: 1 },
      });
      const clip = container.querySelector('clipPath')!;
      const rect = clip.querySelector('rect')!;
      const image = container.querySelector('image')!;
      expect(image.getAttribute('clip-path')).toBe(`url(#${clip.id})`);
      expect(Number(rect.getAttribute('rx'))).toBeGreaterThan(0);
      expect(rect.getAttribute('width')).toBe(image.getAttribute('width'));
    });

    it('clips an svg logo from a group that does not translate it', () => {
      const { container } = draw({
        value: URL7,
        logo: { svg: '<svg/>', radius: 0.5, aspectRatio: 1 },
      });
      const clip = container.querySelector('clipPath')!;
      const clipped = container.querySelector(
        `[clip-path="url(#${clip.id})"]`,
      )!;
      expect(clipped.contains(container.querySelector('[data-xml]'))).toBe(
        true,
      );
      // The clip rect holds absolute coordinates; a translated group would
      // shift it a second time and hide the logo.
      expect(clipped.hasAttribute('x')).toBe(false);
      expect(clipped.hasAttribute('y')).toBe(false);
    });

    it('does not clip a square logo', () => {
      const { container } = draw({ value: URL7, logo: { src: LOGO } });
      expect(container.querySelector('clipPath')).toBeNull();
      expect(container.querySelector('image')?.hasAttribute('clip-path')).toBe(
        false,
      );
    });

    it('warns and ignores logo.element', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { container } = draw({
        value: URL7,
        logo: { src: LOGO, element: 'x' as never },
      });
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/logo\.element/));
      expect(container.querySelector('image')).not.toBeNull();
      warn.mockRestore();
    });

    it('warns when an explicit error correction level clamps the logo', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      draw({
        value: URL7,
        qr: { errorCorrectionLevel: 'L' },
        logo: { src: LOGO, size: 1 },
      });
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/logo clamped/));
      warn.mockRestore();
    });
  });

  describe('onError', () => {
    it('is called once with the error and renders nothing', () => {
      const onError = vi.fn();
      const { container, rerender } = render(
        <QRCode value="" onError={onError} />,
      );
      expect(container.querySelector('svg')).toBeNull();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0]![0]).toBeInstanceOf(RangeError);

      // A new inline callback must not make the same failure fire again.
      const next = vi.fn();
      rerender(<QRCode value="" onError={next} />);
      expect(next).not.toHaveBeenCalled();
    });

    it('is called again for a different failing value', () => {
      const onError = vi.fn();
      const { rerender } = render(<QRCode value="" onError={onError} />);
      rerender(<QRCode value={'a'.repeat(10000)} onError={onError} />);
      expect(onError).toHaveBeenCalledTimes(2);
    });

    it('recovers when the value becomes valid', () => {
      const onError = vi.fn();
      const { container, rerender } = render(
        <QRCode value="" onError={onError} />,
      );
      rerender(<QRCode value="ok" onError={onError} />);
      expect(container.querySelector('svg')).not.toBeNull();
    });

    it('throws while rendering when there is no handler', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => render(<QRCode value="" />)).toThrow(RangeError);
      spy.mockRestore();
    });
  });
});
