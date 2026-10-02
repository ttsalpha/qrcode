import type { QRCodeProps } from './types';
import type { SVGStringOptions } from './core/types';
import { toSVGString as buildSVGString } from './core/svgString';

export function toSVGString(props: QRCodeProps): string {
  // Rendering a React node would pull react-dom/server into every consumer of
  // this module, including React Server Components, where it does not exist.
  if (props.logo?.element) {
    throw new TypeError(
      '[QRCode] logo.element cannot be serialised to a string; pass logo.src instead, or render <QRCode>',
    );
  }
  return buildSVGString(props as SVGStringOptions);
}

export type ImageFormat = 'png' | 'jpeg';

export interface ToDataURLOptions {
  format?: ImageFormat;
  /** JPEG quality 0–1. Ignored for PNG. Default: browser default (~0.92). */
  quality?: number;
  /** Raster size multiplier, for exporting above the on-screen size. Default: `1`. */
  scale?: number;
}

export async function toDataURL(
  props: QRCodeProps,
  options: ToDataURLOptions = {},
): Promise<string> {
  const { format = 'png', quality, scale = 1 } = options;

  // Checked before the blob exists, so a non-browser runtime cannot leak an
  // object URL that nothing will ever revoke.
  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    throw new Error(
      '[QRCode] toDataURL needs a browser environment (Image and Canvas)',
    );
  }
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new RangeError(
      `[QRCode] scale must be a positive number, got ${scale}`,
    );
  }

  const size = props.size ?? 256;
  const pixels = Math.max(1, Math.round(size * scale));
  const svgString = toSVGString(props);

  return new Promise((resolve, reject) => {
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      // Anything thrown here escapes the handler rather than rejecting, which
      // would leave the promise pending forever. canvas.toDataURL in particular
      // throws SecurityError once a cross-origin logo has tainted the canvas.
      try {
        const canvas = document.createElement('canvas');
        canvas.width = pixels;
        canvas.height = pixels;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('[QRCode] Canvas 2D context unavailable'));
          return;
        }

        // JPEG has no alpha channel, so fill the background before drawing
        if (format === 'jpeg') {
          ctx.fillStyle =
            !props.backgroundColor || props.backgroundColor === 'transparent'
              ? '#ffffff'
              : props.backgroundColor;
          ctx.fillRect(0, 0, pixels, pixels);
        }

        ctx.drawImage(img, 0, 0, pixels, pixels);
        resolve(canvas.toDataURL(`image/${format}`, quality));
      } catch (err) {
        reject(err);
      } finally {
        URL.revokeObjectURL(url);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('[QRCode] Failed to render SVG to image'));
    };

    img.src = url;
  });
}
