import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toSVGString, toDataURL } from '../utils';

describe('toSVGString', () => {
  it('returns a string', () => {
    expect(typeof toSVGString({ value: 'TEST' })).toBe('string');
  });

  it('returns valid SVG markup', () => {
    const result = toSVGString({ value: 'TEST' });
    expect(result).toContain('<svg');
    expect(result).toContain('</svg>');
  });

  it('includes role="img"', () => {
    expect(toSVGString({ value: 'TEST' })).toContain('role="img"');
  });

  it('includes value in title by default', () => {
    expect(toSVGString({ value: 'https://example.com' })).toContain(
      'https://example.com',
    );
  });

  it('uses ariaLabel when provided', () => {
    const result = toSVGString({ value: 'TEST', ariaLabel: 'Scan me' });
    expect(result).toContain('Scan me');
    expect(result).not.toContain('QR code: TEST');
  });

  it('respects size prop', () => {
    const result = toSVGString({ value: 'TEST', size: 512 });
    expect(result).toContain('width="512"');
    expect(result).toContain('height="512"');
  });

  it('renders background rect when backgroundColor is set', () => {
    const result = toSVGString({ value: 'TEST', backgroundColor: '#ff0000' });
    expect(result).toContain('#ff0000');
  });

  it('omits background rect when backgroundColor is transparent', () => {
    const result = toSVGString({
      value: 'TEST',
      backgroundColor: 'transparent',
    });
    // no background rect: transparent means no rect rendered
    const rects = result.match(/<rect/g) ?? [];
    expect(rects.length).toBe(0);
  });

  // React escapes attribute values for <QRCode>; this builder writes the string
  // itself, so colors have to be escaped here or they break out of fill="...".
  describe('escapes caller-supplied colors', () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ['dotColor', { dotColor: '#000" onload="alert(1)' }],
      [
        'backgroundColor',
        { backgroundColor: '#fff"/><script>x()</script><rect fill="#fff' },
      ],
      ['corner square color', { corner: { square: { color: 'a"/><b c="' } } }],
      ['corner dot color', { corner: { dot: { color: 'a"/><b c="' } } }],
    ];

    for (const [label, props] of cases) {
      it(label, () => {
        const result = toSVGString({ value: 'TEST', ...props });
        expect(result).not.toContain('<script>');
        expect(result).not.toContain('<b c=');
        // no attribute may be introduced by the injected value
        expect(/[ "]onload="/.test(result)).toBe(false);
        expect(result).toContain('&quot;');
      });
    }
  });

  it('is deterministic: identical props produce identical output', () => {
    const props = {
      value: 'https://example.com',
      logo: { src: 'data:image/png;base64,iVBORw0KGgo=' },
    };
    expect(toSVGString(props)).toBe(toSVGString(props));
  });

  it('gives different ids to different values', () => {
    const idOf = (svg: string) => svg.match(/aria-labelledby="([^"]+)"/)?.[1];
    expect(idOf(toSVGString({ value: 'A' }))).not.toBe(
      idOf(toSVGString({ value: 'B' })),
    );
  });

  it('appends px to numeric style values, matching React', () => {
    const result = toSVGString({
      value: 'TEST',
      style: { borderRadius: 8, opacity: 0.5, margin: 0 },
    });
    expect(result).toContain('border-radius:8px');
    expect(result).toContain('opacity:0.5');
    expect(result).toContain('margin:0');
  });
});

// --- toDataURL ---

interface MockCtx {
  fillStyle: string;
  fillRect: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
}

function makeMockCanvas(ctx: MockCtx, dataURL: string) {
  return {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
    toDataURL: vi.fn(() => dataURL),
  };
}

function makeMockImage(fireLoad = true) {
  return class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_: string) {
      if (fireLoad) setTimeout(() => this.onload?.(), 0);
      else setTimeout(() => this.onerror?.(), 0);
    }
  };
}

describe('toDataURL', () => {
  let mockCtx: MockCtx;
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    mockCtx = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };

    // URL stubs
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();

    originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(
      (tag: string): HTMLElement => {
        if (tag === 'canvas')
          return makeMockCanvas(
            mockCtx,
            'data:image/png;base64,mock',
          ) as unknown as HTMLElement;
        return originalCreateElement(tag);
      },
    );

    vi.stubGlobal('Image', makeMockImage(true));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns a data URL string', async () => {
    const result = await toDataURL({ value: 'TEST' });
    expect(result).toMatch(/^data:/);
  });

  it('defaults to PNG format', async () => {
    vi.spyOn(document, 'createElement').mockImplementation(
      (tag: string): HTMLElement => {
        if (tag === 'canvas')
          return makeMockCanvas(
            mockCtx,
            'data:image/png;base64,mock',
          ) as unknown as HTMLElement;
        return originalCreateElement(tag);
      },
    );
    const result = await toDataURL({ value: 'TEST' });
    expect(result).toContain('image/png');
  });

  it('returns JPEG when format is jpeg', async () => {
    vi.spyOn(document, 'createElement').mockImplementation(
      (tag: string): HTMLElement => {
        if (tag === 'canvas')
          return makeMockCanvas(
            mockCtx,
            'data:image/jpeg;base64,mock',
          ) as unknown as HTMLElement;
        return originalCreateElement(tag);
      },
    );
    const result = await toDataURL({ value: 'TEST' }, { format: 'jpeg' });
    expect(result).toContain('image/jpeg');
  });

  it('fills white background for JPEG when background is transparent', async () => {
    await toDataURL(
      { value: 'TEST', backgroundColor: 'transparent' },
      { format: 'jpeg' },
    );
    expect(mockCtx.fillRect).toHaveBeenCalled();
    expect(mockCtx.fillStyle).toBe('#ffffff');
  });

  it('does not fill background for PNG', async () => {
    await toDataURL({ value: 'TEST' }, { format: 'png' });
    expect(mockCtx.fillRect).not.toHaveBeenCalled();
  });

  it('rejects when canvas context is unavailable', async () => {
    const nullCtxCanvas = makeMockCanvas(
      null as unknown as MockCtx,
      '',
    ) as unknown as HTMLCanvasElement;
    (nullCtxCanvas as unknown as { getContext: () => null }).getContext = () =>
      null;
    vi.spyOn(document, 'createElement').mockImplementation(
      (tag: string): HTMLElement => {
        if (tag === 'canvas') return nullCtxCanvas as unknown as HTMLElement;
        return originalCreateElement(tag);
      },
    );
    await expect(toDataURL({ value: 'TEST' })).rejects.toThrow(
      'Canvas 2D context unavailable',
    );
  });

  it('rejects when image fails to load', async () => {
    vi.stubGlobal('Image', makeMockImage(false));
    await expect(toDataURL({ value: 'TEST' })).rejects.toThrow(
      'Failed to render SVG to image',
    );
  });

  it('revokes blob URL after success', async () => {
    await toDataURL({ value: 'TEST' });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  it('revokes blob URL after failure', async () => {
    vi.stubGlobal('Image', makeMockImage(false));
    await expect(toDataURL({ value: 'TEST' })).rejects.toThrow();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });

  // A cross-origin logo taints the canvas and canvas.toDataURL then throws
  // SecurityError. The throw happens inside img.onload, outside the promise
  // executor, so without a catch the promise would stay pending forever.
  describe('when canvas.toDataURL throws (tainted canvas)', () => {
    beforeEach(() => {
      const taintedCanvas = makeMockCanvas(mockCtx, '');
      taintedCanvas.toDataURL = vi.fn(() => {
        throw new Error('SecurityError: tainted canvas');
      });
      vi.spyOn(document, 'createElement').mockImplementation(
        (tag: string): HTMLElement => {
          if (tag === 'canvas') return taintedCanvas as unknown as HTMLElement;
          return originalCreateElement(tag);
        },
      );
    });

    it('rejects instead of hanging', { timeout: 1000 }, async () => {
      await expect(toDataURL({ value: 'TEST' })).rejects.toThrow(
        'SecurityError',
      );
    });

    it('still revokes the blob URL', { timeout: 1000 }, async () => {
      await expect(toDataURL({ value: 'TEST' })).rejects.toThrow();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    });
  });
});
