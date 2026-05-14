# @ttsalpha/qrcode

Lightweight, fully customizable React QR code library — pure SVG, zero dependencies, built from scratch.

[![npm](https://img.shields.io/npm/v/@ttsalpha/qrcode)](https://www.npmjs.com/package/@ttsalpha/qrcode)
[![license](https://img.shields.io/npm/l/@ttsalpha/qrcode)](./LICENSE)
[![CI](https://github.com/ttsalpha/qrcode/actions/workflows/ci.yml/badge.svg)](https://github.com/ttsalpha/qrcode/actions/workflows/ci.yml)

## Features

- **Pure SVG** — no canvas, no raster images, scales perfectly at any size
- **Zero runtime dependencies** — QR encoding implemented from scratch (ISO/IEC 18004)
- **Fully typed** — written in TypeScript with strict mode
- **3 dot styles** — square, circle, and snake-connected rounded
- **Customizable corners** — independent style and color for each finder pattern part
- **Logo support** — embed an image or any React element in the center
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
  width={256}
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
    width: 48,
    height: 48,
    padding: 4,
  }}
  qr={{ errorCorrectionLevel: 'H' }}
/>
```

> When using a logo, set `errorCorrectionLevel: 'H'` — it recovers up to 30% of occluded modules.

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
| `width`           | `number`        | `256`       | SVG width in pixels                   |
| `height`          | `number`        | `256`       | SVG height in pixels                  |
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
    style?: 'square' | 'rounded' | 'extra-rounded'; // outer 7×7 ring
    color?: string;
  };
}
```

> When `corner.square` is `'extra-rounded'` and `corner.dot.style` is not set, the dot style defaults to `'rounded'` automatically.

### `LogoOptions`

```ts
interface LogoOptions {
  src?: string; // https, relative path, blob:, or data:image/… URI
  element?: ReactNode; // takes priority over src if both provided
  width?: number; // default: 20% of QR width
  height?: number; // default: 20% of QR height
  padding?: number; // transparent padding around the logo
}
```

> **Security:** `javascript:` and non-image `data:` URIs in `src` are silently rejected. Never pass unsanitised user input as `element` — it is rendered verbatim inside a `<foreignObject>`.

### `QROptions`

```ts
interface QROptions {
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'; // default: 'M'
  version?: number; // 1–40, default: auto
}
```

## Technical Details

- QR versions 1–40, auto-selects the minimum version that fits the data
- Encoding modes: Numeric, Alphanumeric, Byte (UTF-8) — auto-selected
- Full Reed-Solomon error correction over GF(256)
- All 8 mask patterns evaluated with ISO 18004 penalty scoring
- All function patterns: finder, separator, timing, alignment, dark module, format info, version info

## License

MIT © [Son Tran](https://github.com/ttsalpha)
