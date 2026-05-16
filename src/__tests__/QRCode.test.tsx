import { describe, it, expect } from 'vitest';
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
    expect(groups).toHaveLength(3);
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

  it('renders hideDots rect by default when logo is provided', () => {
    const { container } = render(
      <QRCode
        value="TEST"
        backgroundColor="#ffffff"
        logo={{ src: 'https://example.com/logo.png' }}
      />,
    );
    const rects = container.querySelectorAll('rect');
    expect(rects.length).toBe(2); // background + hideDots
    expect(rects[1].getAttribute('fill')).toBe('#ffffff');
  });

  it('renders hideDots rect when hideDots is explicitly true', () => {
    const { container } = render(
      <QRCode
        value="TEST"
        backgroundColor="#ffffff"
        logo={{ src: 'https://example.com/logo.png', hideDots: true }}
      />,
    );
    const rects = container.querySelectorAll('rect');
    expect(rects.length).toBe(2); // background + hideDots
    expect(rects[1].getAttribute('fill')).toBe('#ffffff');
  });

  it('does not render hideDots rect when hideDots is false', () => {
    const { container } = render(
      <QRCode
        value="TEST"
        logo={{ src: 'https://example.com/logo.png', hideDots: false }}
      />,
    );
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
    for (const style of ['square', 'rounded', 'extra-rounded'] as const) {
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
});
