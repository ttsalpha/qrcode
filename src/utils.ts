import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { QRCodeProps } from './types';
import { QRCode } from './components/QRCode';
import { buildSVGString } from './renderer/svgDirect';

export function toSVGString(props: QRCodeProps): string {
  // logo.element is a React node, so it must go through renderToStaticMarkup
  if (props.logo?.element) {
    return renderToStaticMarkup(createElement(QRCode, props));
  }
  return buildSVGString(props);
}

export type ImageFormat = 'png' | 'jpeg';

export interface ToDataURLOptions {
  format?: ImageFormat;
  /** JPEG quality 0–1. Ignored for PNG. Default: browser default (~0.92). */
  quality?: number;
}

export async function toDataURL(
  props: QRCodeProps,
  options: ToDataURLOptions = {},
): Promise<string> {
  const { format = 'png', quality } = options;
  const size = props.size ?? 256;
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
        canvas.width = size;
        canvas.height = size;
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
          ctx.fillRect(0, 0, size, size);
        }

        ctx.drawImage(img, 0, 0, size, size);
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
