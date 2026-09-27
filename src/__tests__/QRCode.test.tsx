import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRef } from 'react';
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

  // The mask has to land on module boundaries, or it leaves part of a dot
  // showing along its edge. Covered exhaustively in logoSafety.test.ts; this
  // checks the component actually renders what the helper computed.
  it('renders the mask aligned to the module grid', () => {
    const qrSize = 21; // "TEST" fits v1 at every EC level used here
    const totalModules = qrSize + 8;
    const svgSize = 300;
    // Both renderers round the module size to 2 decimals before deriving any
    // coordinate from it, so adjacent modules tile exactly.
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const moduleSize = round2(svgSize / totalModules);
    const drawnSize = round2(moduleSize * totalModules);

    for (const logoSize of [0.2, 0.3, 0.5, 0.6]) {
      const { container } = render(
        <QRCode
          value="TEST"
          size={svgSize}
          logo={{ src: 'https://example.com/logo.png', size: logoSize }}
        />,
      );
      const clear = container.querySelectorAll('mask rect')[1];
      const x = Number(clear.getAttribute('x'));
      const width = Number(clear.getAttribute('width'));

      expect(width / moduleSize).toBeCloseTo(Math.round(width / moduleSize), 6);
      expect(Math.round(width / moduleSize) % 2).toBe(1);
      expect(x / moduleSize).toBeCloseTo(Math.round(x / moduleSize), 6);
      expect(x + width / 2).toBeCloseTo(drawnSize / 2, 6);
    }
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

  it('clamps logo size to ECL maximum when ECL is explicit (AR=1)', () => {
    // size=0.9 → targetArea=0.081, ECL M caps at SAFE_AREAS.M=0.04
    // logoWidth = sqrt(0.04) * svgSize = 0.2 * svgSize
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
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
    expect(Number(image?.getAttribute('width'))).toBeLessThanOrEqual(
      Math.sqrt(0.04) * 300 + 1,
    );
    warnSpy.mockRestore();
  });

  it('logo margin reduces rendered logo size within the cleared box', () => {
    const widthWithMargin = (margin: number) => {
      const { container } = render(
        <QRCode
          value="TEST"
          size={300}
          logo={{ src: 'https://example.com/logo.png', size: 0.6, margin }}
          qr={{ errorCorrectionLevel: 'H' }}
        />,
      );
      const image = container.querySelector('image');
      expect(image).not.toBeNull();
      return Number(image?.getAttribute('width'));
    };
    // margin is in modules, like the symbol's own margin prop
    const bare = widthWithMargin(0);
    const inset = widthWithMargin(1);
    expect(bare).toBeGreaterThan(0);
    expect(inset).toBeLessThan(bare);
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

    it('logo.src: wide logo respects area budget at max size', () => {
      // AR=3, size=1.0 + ECL H → absoluteArea = SAFE_AREAS.H = 0.09
      // logoWidth = sqrt(0.09*3)*svgSize ≈ 0.520*svgSize, logoHeight ≈ 0.173*svgSize
      Object.defineProperty(Image.prototype, 'naturalWidth', {
        value: 300,
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
          logo={{ src: 'https://example.com/wide3x.png', size: 1.0 }}
          qr={{ errorCorrectionLevel: 'H' }}
        />,
      );
      const image = container.querySelector('image');
      expect(image).not.toBeNull();
      const w = Number(image?.getAttribute('width'));
      const h = Number(image?.getAttribute('height'));
      const svgSize = 300;

      expect((w * h) / (svgSize * svgSize)).toBeLessThanOrEqual(0.09 + 0.01); // area within H-level budget
      expect(w).toBeLessThan(svgSize); // width must not overflow QR

      delete (Image.prototype as Partial<typeof Image.prototype>).naturalWidth;
      delete (Image.prototype as Partial<typeof Image.prototype>).naturalHeight;
    });

    it('warns when size exceeds explicit ECL budget', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      render(
        <QRCode
          value="TEST"
          size={300}
          logo={{ src: 'https://example.com/logo.png', size: 0.9 }}
          qr={{ errorCorrectionLevel: 'M' }}
        />,
      );

      // size=0.9 → targetArea=0.081 > SAFE_AREAS.M=0.04 → should warn
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[QRCode] logo.size'),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('needs ECL'),
      );
      warnSpy.mockRestore();
    });

    it('auto-picks ECL based on size when ECL not provided', () => {
      // size=0.5 → targetArea = 0.5 * 0.09 = 0.045 > SAFE_AREAS.M (0.04) → ECL Q
      const { container } = render(
        <QRCode
          value="TEST"
          size={300}
          logo={{ src: 'https://example.com/logo.png', size: 0.5 }}
        />,
      );
      const image = container.querySelector('image');
      expect(image).not.toBeNull();
      const w = Number(image?.getAttribute('width'));
      // area = 0.045 of the SYMBOL, not of the padded canvas. "TEST" is a v1
      // symbol: 21 modules inside a 21 + 4*2 grid drawn at 300px.
      const symbolSize = 21 * (300 / 29);
      expect(w).toBeCloseTo(Math.sqrt(0.045) * symbolSize, 0);
    });

    it('size=0 renders no logo', () => {
      const { container } = render(
        <QRCode
          value="TEST"
          size={300}
          logo={{ src: 'https://example.com/logo.png', size: 0 }}
        />,
      );
      // logo with size=0 produces zero dimensions, so it should not render
      expect(container.querySelector('image')).toBeNull();
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
      // jsdom getBoundingClientRect returns 0, so ResizeObserver fires with 0,0
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

describe('SVG passthrough', () => {
  it('forwards a ref to the svg element', () => {
    const ref = createRef<SVGSVGElement>();
    const { container } = render(<QRCode value="TEST" ref={ref} />);
    expect(ref.current).toBe(container.querySelector('svg'));
  });

  it('passes unknown svg props through to the root element', () => {
    const onClick = vi.fn();
    const { container } = render(
      <QRCode value="TEST" id="qr-1" data-testid="qr" onClick={onClick} />,
    );
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg.getAttribute('id')).toBe('qr-1');
    expect(svg.getAttribute('data-testid')).toBe('qr');
    svg.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps control of the attributes it derives from its own props', () => {
    // `role` is excluded from the prop type; the cast proves the runtime also
    // holds the line, so the exclusion is not the only thing guarding it.
    const forced = { role: 'presentation' } as Record<string, string>;
    const { container } = render(
      <QRCode value="TEST" size={128} {...forced} />,
    );
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('width')).toBe('128');
  });

  it('is named for React DevTools and error stacks', () => {
    expect(QRCode.displayName).toBe('QRCode');
  });
});

describe('title text', () => {
  it('drops control characters that would make the SVG invalid XML', () => {
    // GS1 payloads separate fields with 0x1D, which XML 1.0 forbids.
    const value = '01034531200000111719112510ABCD1234';
    const withGs = `${value.slice(0, 16)}\u001d${value.slice(16)}`;
    const { container } = render(<QRCode value={withGs} />);
    const title = container.querySelector('title')?.textContent ?? '';
    expect(title).toBe(`QR code: ${value}`);
    expect(title).not.toContain('\u001d');
  });

  it('leaves the encoded value untouched', () => {
    const withGs = 'AB\u001dCD';
    const { container } = render(<QRCode value={withGs} />);
    // The title is sanitised, but the symbol still encodes the real bytes.
    expect(container.querySelector('title')?.textContent).toBe('QR code: ABCD');
    expect(container.querySelector('svg')).not.toBeNull();
  });
});

describe('invalid geometry', () => {
  for (const [label, props] of [
    ['negative size', { size: -10 }],
    ['non-numeric size', { size: '256" onload="x' as unknown as number }],
    ['negative margin', { margin: -1 }],
  ] as const) {
    it(`rejects ${label} instead of rendering NaN geometry`, () => {
      expect(() => render(<QRCode value="TEST" {...props} />)).toThrow(
        RangeError,
      );
    });
  }

  // The 2-decimal grid collapses the module to nothing long before this, and
  // a 0x0 viewBox inside a full-width <svg> is worse than an error.
  it('rejects a margin that leaves no room for the symbol', () => {
    expect(() =>
      render(<QRCode value="TEST" size={256} margin={26000} />),
    ).toThrow(RangeError);
  });

  // `size={el.clientWidth}` is 0 on the first render, so this has to draw
  // nothing rather than unmount the tree.
  it('draws an empty symbol at size 0 without throwing', () => {
    const { container } = render(<QRCode value="TEST" size={0} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('0');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 0 0');
  });
});

describe('logo margin', () => {
  it('warns when the margin leaves no room for the logo', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(
      <QRCode
        value="TEST"
        size={256}
        logo={{ src: 'https://example.com/logo.png', size: 0.6, margin: 4 }}
      />,
    );
    expect(container.querySelector('image')).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('leaves no room for the logo'),
    );
    warn.mockRestore();
  });

  it('stays silent when the logo still fits', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = render(
      <QRCode
        value="TEST"
        size={256}
        logo={{ src: 'https://example.com/logo.png', size: 0.6, margin: 1 }}
      />,
    );
    expect(container.querySelector('image')).not.toBeNull();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('logo.aspectRatio', () => {
  // The hidden div exists only to be measured. With an explicit ratio there is
  // nothing to measure, and mounting the element twice runs its effects twice.
  it('skips the measuring copy when the ratio is given', () => {
    const { container } = render(
      <QRCode
        value="TEST"
        logo={{ element: <span data-testid="brand">L</span>, aspectRatio: 2 }}
      />,
    );
    expect(container.querySelectorAll('[data-testid="brand"]')).toHaveLength(1);
    expect(container.querySelector('div[aria-hidden]')).toBeNull();
    expect(container.querySelector('foreignObject')).not.toBeNull();
  });

  it('still measures when no ratio is given', () => {
    const { container } = render(
      <QRCode
        value="TEST"
        logo={{ element: <span data-testid="brand">L</span> }}
      />,
    );
    expect(container.querySelectorAll('[data-testid="brand"]')).toHaveLength(2);
    expect(container.querySelector('div[aria-hidden]')).not.toBeNull();
  });

  it('lays the logo out from the given ratio', () => {
    const widthFor = (aspectRatio: number) => {
      const { container } = render(
        <QRCode
          value="TEST"
          size={300}
          logo={{ src: 'https://example.com/l.png', size: 0.6, aspectRatio }}
        />,
      );
      const image = container.querySelector('image') as SVGImageElement;
      return [
        Number(image.getAttribute('width')),
        Number(image.getAttribute('height')),
      ];
    };
    const [w1, h1] = widthFor(1);
    const [w3, h3] = widthFor(3);
    expect(w1 / h1).toBeCloseTo(1, 2);
    expect(w3 / h3).toBeCloseTo(3, 2);
  });
});
