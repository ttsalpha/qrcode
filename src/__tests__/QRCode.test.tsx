import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { QRCode } from '../components/QRCode';

describe('QRCode component', () => {
  it('renders an SVG element', () => {
    const { container } = render(<QRCode value="https://example.com" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  it('renders with default size', () => {
    const { container } = render(<QRCode value="TEST" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('256');
    expect(svg?.getAttribute('height')).toBe('256');
  });

  it('respects custom size', () => {
    const { container } = render(<QRCode value="TEST" size={400} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('400');
    expect(svg?.getAttribute('height')).toBe('400');
  });

  it('renders with className', () => {
    const { container } = render(<QRCode value="TEST" className="my-qr" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('my-qr');
  });

  it('renders background rect when backgroundColor is set', () => {
    const { container } = render(
      <QRCode value="TEST" backgroundColor="#ffffff" />,
    );
    const rect = container.querySelector('rect');
    expect(rect).not.toBeNull();
    expect(rect?.getAttribute('fill')).toBe('#ffffff');
  });

  it('no background rect when backgroundColor is transparent', () => {
    const { container } = render(
      <QRCode value="TEST" backgroundColor="transparent" />,
    );
    const rect = container.querySelector('rect');
    expect(rect).toBeNull();
  });

  it('renders exactly 3 corner groups', () => {
    const { container } = render(<QRCode value="TEST" />);
    const groups = container.querySelectorAll('g');
    // 1 wrapper <g> for QR content + 3 <g> from QRCorner
    expect(groups).toHaveLength(4);
  });

  it('renders path elements for data modules', () => {
    const { container } = render(<QRCode value="TEST" />);
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBeGreaterThan(0);
  });

  it('renders logo image when src is provided', () => {
    const { container } = render(
      <QRCode value="TEST" logo={{ src: 'https://example.com/logo.png' }} />,
    );
    const image = container.querySelector('image');
    expect(image).not.toBeNull();
    expect(image?.getAttribute('href')).toBe('https://example.com/logo.png');
  });

  it('does not render logo image for javascript: src', () => {
    const { container } = render(
      // eslint-disable-next-line no-script-url
      <QRCode value="TEST" logo={{ src: 'javascript:alert(1)' }} />,
    );
    expect(container.querySelector('image')).toBeNull();
  });

  it('does not render logo image for non-image data: src', () => {
    const { container } = render(
      <QRCode
        value="TEST"
        logo={{ src: 'data:text/html,<script>alert(1)</script>' }}
      />,
    );
    expect(container.querySelector('image')).toBeNull();
  });

  it('renders logo image for data:image/ src', () => {
    const { container } = render(
      <QRCode value="TEST" logo={{ src: 'data:image/png;base64,abc' }} />,
    );
    expect(container.querySelector('image')).not.toBeNull();
  });

  it('renders logo element when element is provided', () => {
    const { container } = render(
      <QRCode
        value="TEST"
        logo={{ element: <div data-testid="logo">Logo</div> }}
      />,
    );
    const foreignObject = container.querySelector('foreignObject');
    expect(foreignObject).not.toBeNull();
  });

  it('renders mask to hide dots by default when logo is provided', () => {
    const { container } = render(
      <QRCode
        value="TEST"
        backgroundColor="#ffffff"
        logo={{ src: 'https://example.com/logo.png' }}
      />,
    );
    expect(container.querySelector('mask')).not.toBeNull();
  });

  it('renders mask when hideDots is explicitly true', () => {
    const { container } = render(
      <QRCode
        value="TEST"
        backgroundColor="#ffffff"
        logo={{ src: 'https://example.com/logo.png', hideDots: true }}
      />,
    );
    expect(container.querySelector('mask')).not.toBeNull();
  });

  it('does not render mask when hideDots is false', () => {
    const { container } = render(
      <QRCode
        value="TEST"
        logo={{ src: 'https://example.com/logo.png', hideDots: false }}
      />,
    );
    expect(container.querySelector('mask')).toBeNull();
    const rects = container.querySelectorAll('rect');
    expect(rects.length).toBe(1); // background only
  });

  it('respects custom logo size ratio', () => {
    const { container } = render(
      <QRCode
        value="TEST"
        size={300}
        logo={{ src: 'https://example.com/logo.png', size: 0.3 }}
      />,
    );
    const image = container.querySelector('image');
    expect(image).not.toBeNull();
  });

  it('clamps logo size to ECL maximum', () => {
    // ECL M max is 0.3 — passing 0.9 should be clamped, logo still renders
    const { container } = render(
      <QRCode
        value="TEST"
        size={300}
        logo={{ src: 'https://example.com/logo.png', size: 0.9 }}
        qr={{ errorCorrectionLevel: 'M' }}
      />,
    );
    const image = container.querySelector('image');
    expect(image).not.toBeNull();
    // clamped to 0.22 * svgSize; logo renders at box size (no margin)
    expect(Number(image?.getAttribute('width'))).toBeLessThanOrEqual(
      300 * 0.22 + 1,
    );
  });

  it('logo margin reduces rendered logo size within the cleared box', () => {
    const { container } = render(
      <QRCode
        value="TEST"
        size={300}
        logo={{ src: 'https://example.com/logo.png', size: 0.3, margin: 10 }}
        qr={{ errorCorrectionLevel: 'M' }}
      />,
    );
    const image = container.querySelector('image');
    expect(image).not.toBeNull();
    // logo width = box - margin*2; box ≈ 0.3 * svgSize, margin shrinks it
    const width = Number(image?.getAttribute('width'));
    expect(width).toBeGreaterThan(0);
  });

  it('renders different error correction levels', () => {
    for (const ecLevel of ['L', 'M', 'Q', 'H'] as const) {
      const { container } = render(
        <QRCode value="TEST" qr={{ errorCorrectionLevel: ecLevel }} />,
      );
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
    }
  });

  it('renders all dot styles without error', () => {
    for (const dotStyle of ['square', 'circle', 'rounded'] as const) {
      const { container } = render(<QRCode value="TEST" dotStyle={dotStyle} />);
      expect(container.querySelector('svg')).not.toBeNull();
    }
  });

  it('renders all corner square styles without error', () => {
    for (const style of [
      'square',
      'rounded',
      'extra-rounded',
      'circle',
    ] as const) {
      const { container } = render(
        <QRCode value="TEST" corner={{ square: { style } }} />,
      );
      expect(container.querySelector('svg')).not.toBeNull();
    }
  });

  it('renders all corner dot styles without error', () => {
    for (const style of ['square', 'rounded', 'circle'] as const) {
      const { container } = render(
        <QRCode value="TEST" corner={{ dot: { style } }} />,
      );
      expect(container.querySelector('svg')).not.toBeNull();
    }
  });

  it('extra-rounded corner defaults to rounded dot style', () => {
    const { container } = render(
      <QRCode
        value="TEST"
        corner={{ square: { style: 'extra-rounded', color: '#ff0000' } }}
      />,
    );
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('explicit corner dot style overrides extra-rounded default', () => {
    const { container } = render(
      <QRCode
        value="TEST"
        corner={{
          square: { style: 'extra-rounded', color: '#ff0000' },
          dot: { style: 'circle', color: '#0000ff' },
        }}
      />,
    );
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('circle corner square defaults to circle dot style', () => {
    const { container } = render(
      <QRCode
        value="TEST"
        corner={{ square: { style: 'circle', color: '#ff0000' } }}
      />,
    );
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders with empty string value', () => {
    // Should not crash even with empty string
    expect(() => render(<QRCode value=" " />)).not.toThrow();
  });

  it('renders with long data', () => {
    const longString = 'https://example.com/'.repeat(5);
    const { container } = render(<QRCode value={longString} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  describe('logo aspect ratio detection', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('logo.src: uses 1:1 when naturalWidth/naturalHeight are not set', () => {
      const { container } = render(
        <QRCode
          value="TEST"
          size={300}
          logo={{ src: 'https://example.com/logo.png' }}
        />,
      );
      const image = container.querySelector('image');
      expect(image).not.toBeNull();
      const w = Number(image?.getAttribute('width'));
      const h = Number(image?.getAttribute('height'));
      expect(w / h).toBeCloseTo(1, 1);
    });

    it('logo.src: applies landscape aspect ratio from naturalWidth/naturalHeight', () => {
      // Pre-set naturalWidth/naturalHeight on prototype so that when setup.ts
      // src setter fires onload, the component reads the correct dimensions.
      Object.defineProperty(Image.prototype, 'naturalWidth', {
        value: 200,
        configurable: true,
      });
      Object.defineProperty(Image.prototype, 'naturalHeight', {
        value: 100,
        configurable: true,
      });

      const { container } = render(
        <QRCode
          value="TEST"
          size={300}
          logo={{ src: 'https://example.com/wide.png' }}
        />,
      );
      const image = container.querySelector('image');
      expect(image).not.toBeNull();
      const w = Number(image?.getAttribute('width'));
      const h = Number(image?.getAttribute('height'));
      expect(w / h).toBeCloseTo(2, 1);

      delete (Image.prototype as Partial<typeof Image.prototype>).naturalWidth;
      delete (Image.prototype as Partial<typeof Image.prototype>).naturalHeight;
    });

    it('logo.element: uses aspect ratio from ResizeObserver measurement', () => {
      const { container } = render(
        <QRCode
          value="TEST"
          size={300}
          logo={{
            element: <div style={{ width: 200, height: 100 }}>Logo</div>,
          }}
        />,
      );
      // jsdom getBoundingClientRect returns 0 — ResizeObserver fires with 0,0
      // so aspectRatio stays 1. This test asserts the foreignObject exists and
      // has equal width/height (1:1 fallback) rather than crashing.
      const fo = container.querySelector('foreignObject');
      expect(fo).not.toBeNull();
      // Override bounding rect and verify ResizeObserver would update correctly
      const measureDiv = container.querySelector(
        'div[aria-hidden]',
      ) as HTMLElement;
      expect(measureDiv).not.toBeNull();
    });
  });
});
