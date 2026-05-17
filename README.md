# @ttsalpha/qrcode

Lightweight, fully customizable React QR code library — pure SVG, zero dependencies, built from scratch.

[![npm](https://img.shields.io/npm/v/@ttsalpha/qrcode)](https://www.npmjs.com/package/@ttsalpha/qrcode)
[![license](https://img.shields.io/npm/l/@ttsalpha/qrcode)](./LICENSE)
[![CI](https://github.com/ttsalpha/qrcode/actions/workflows/ci.yml/badge.svg)](https://github.com/ttsalpha/qrcode/actions/workflows/ci.yml)

## Showcase

<img src="https://cdn.ttsalpha.com/qrcode/01.svg" width="160" alt="Square QR code" /> <img src="https://cdn.ttsalpha.com/qrcode/02.svg" width="160" alt="Rounded QR code" /> <img src="https://cdn.ttsalpha.com/qrcode/03.svg" width="160" alt="Circle QR code" />

## Features

- **Pure SVG** — no canvas, no raster images, scales perfectly at any size
- **Zero runtime dependencies** — QR encoding implemented from scratch (ISO/IEC 18004)
- **Fully typed** — written in TypeScript with strict mode
- **3 dot styles** — square, circle, and snake-connected rounded
- **Customizable corners** — independent style and color for each finder pattern part
- **Logo support** — embed an image or any React element in the center
- **Export helpers** — `toSVGString()` for SSR/server use, `toDataURL()` for PNG/JPEG download
- **Tree-shakeable** — named exports only, ESM + CJS output

## Installation

```bash
pnpm add @ttsalpha/qrcode
```

React 18+ is required as a peer dependency.

## Quick Start

```tsx
import { QRCode } from '@ttsalpha/qrcode';

export default function App() {
  return <QRCode value="https://example.com" />;
}
```

## Examples

### Styled dots and corners

```tsx
<QRCode
  value="https://example.com"
  size={256}
  dotStyle="rounded"
  dotColor="#1a1a2e"
  corner={{
    square: { style: 'extra-rounded', color: '#e94560' },
  }}
/>
```

### With a logo

```tsx
<QRCode
  value="https://example.com"
  dotStyle="rounded"
  corner={{ square: { style: 'extra-rounded' } }}
  logo={{
    src: '/logo.png',
    size: 0.2,
    margin: 4,
  }}
  qr={{ errorCorrectionLevel: 'H' }}
/>
```

> Use `errorCorrectionLevel: 'H'` with a logo — it allows the largest logo area (up to 30% of QR area recovered). Non-square logos are supported; the aspect ratio is detected automatically.

### With a React element as logo

```tsx
<QRCode
  value="https://example.com"
  logo={{
    element: <MyIcon size={40} />,
  }}
  qr={{ errorCorrectionLevel: 'H' }}
/>
```

## Props

### `QRCodeProps`

| Prop              | Type            | Default     | Description                           |
| ----------------- | --------------- | ----------- | ------------------------------------- |
| `value`           | `string`        | —           | The data to encode (required)         |
| `size`            | `number`        | `256`       | SVG size in pixels                    |
| `margin`          | `number`        | `4`         | Quiet zone size in modules            |
| `dotStyle`        | `DotStyle`      | `'square'`  | Style of data modules                 |
| `dotColor`        | `string`        | `'#000000'` | Color of data modules                 |
| `backgroundColor` | `string`        | `'#ffffff'` | Background color (`'transparent'` ok) |
| `corner`          | `CornerOptions` | —           | Finder pattern corner styles          |
| `logo`            | `LogoOptions`   | —           | Logo in the center of the QR code     |
| `qr`              | `QROptions`     | —           | QR encoding options                   |
| `className`       | `string`        | —           | CSS class on the `<svg>` element      |
| `style`           | `CSSProperties` | —           | Inline style on the `<svg>` element   |

### `DotStyle`

| Value     | Description                                                             |
| --------- | ----------------------------------------------------------------------- |
| `square`  | Full square (default)                                                   |
| `circle`  | Full circle                                                             |
| `rounded` | Rounded corners; adjacent modules connect smoothly (snake/fluid effect) |

### `CornerOptions`

```ts
interface CornerOptions {
  dot?: {
    style?: 'square' | 'rounded' | 'circle'; // inner 3×3 block
    color?: string;
  };
  square?: {
    style?: 'square' | 'rounded' | 'extra-rounded' | 'circle'; // outer 7×7 ring
    color?: string;
  };
}
```

> When `corner.dot.style` is not set, the inner dot style defaults based on the square style: `extra-rounded` → `rounded`, `circle` → `circle`, others → `square`.

### `LogoOptions`

```ts
interface LogoOptions {
  src?: string; // https, relative path, blob:, or data:image/… URI
  element?: ReactNode; // takes priority over src if both provided
  size?: number; // logo height as a fraction of QR size (0–1), default: 0.2; aspect ratio is auto-detected
  margin?: number; // space between logo and edge of cleared area; larger = smaller logo
  hideDots?: boolean; // clear QR dots behind the logo area, default: true
}
```

> **Logo size is automatically clamped** based on `errorCorrectionLevel` and the logo's detected aspect ratio, so the total masked area stays within the EC recovery budget. For square logos the height limits are: `L` → 0.15, `M` → 0.22, `Q` → 0.32, `H` → 0.40. For landscape logos the height is reduced proportionally — the logo is never wider than the QR itself.

> **Security:** `javascript:` and non-image `data:` URIs in `src` are silently rejected. Never pass unsanitised user input as `element` — it is rendered verbatim inside a `<foreignObject>`.

### `QROptions`

```ts
interface QROptions {
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'; // default: 'M'
  version?: number; // 1–40, default: auto
}
```

## Export Helpers

### `toSVGString(props)`

Generates an SVG string without mounting to the DOM. Useful for server-side rendering, saving to a database, or copying to clipboard.

```ts
import { toSVGString } from '@ttsalpha/qrcode';

const svg = toSVGString({ value: 'https://example.com', size: 512 });
// "<svg role="img" ...>...</svg>"
```

### `toDataURL(props, options?)`

Renders the QR code to a `data:` URL via Canvas. Browser-only (requires Canvas API).

```ts
import { toDataURL } from '@ttsalpha/qrcode';

// PNG (default)
const png = await toDataURL({ value: 'https://example.com', size: 512 });

// JPEG with quality
const jpg = await toDataURL(
  { value: 'https://example.com', size: 512 },
  { format: 'jpeg', quality: 0.9 },
);

// Use as download link
const link = document.createElement('a');
link.href = await toDataURL({ value: 'https://example.com' });
link.download = 'qrcode.png';
link.click();
```

#### `ToDataURLOptions`

| Option    | Type              | Default         | Description                   |
| --------- | ----------------- | --------------- | ----------------------------- |
| `format`  | `'png' \| 'jpeg'` | `'png'`         | Output image format           |
| `quality` | `number` (0–1)    | browser default | JPEG quality. Ignored for PNG |

> **Note:** JPEG has no alpha channel. When `backgroundColor` is `'transparent'`, the background is automatically filled with white.

## Technical Details

- QR versions 1–40, auto-selects the minimum version that fits the data
- Encoding modes: Numeric, Alphanumeric, Byte (UTF-8) — auto-selected
- Full Reed-Solomon error correction over GF(256)
- All 8 mask patterns evaluated with ISO 18004 penalty scoring
- All function patterns: finder, separator, timing, alignment, dark module, format info, version info

## License

MIT © [Son Tran](https://github.com/ttsalpha)
