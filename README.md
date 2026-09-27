# @ttsalpha/qrcode

Lightweight, fully customizable React QR code library. Pure SVG, zero dependencies, built from scratch.

[![npm](https://img.shields.io/npm/v/@ttsalpha/qrcode)](https://www.npmjs.com/package/@ttsalpha/qrcode)
[![license](https://img.shields.io/npm/l/@ttsalpha/qrcode)](./LICENSE)
[![CI](https://github.com/ttsalpha/qrcode/actions/workflows/ci.yml/badge.svg)](https://github.com/ttsalpha/qrcode/actions/workflows/ci.yml)

## Showcase

<img src="https://cdn.ttsalpha.com/qrcode/01.svg" width="160" alt="Square QR code" /> <img src="https://cdn.ttsalpha.com/qrcode/02.svg" width="160" alt="Rounded QR code" /> <img src="https://cdn.ttsalpha.com/qrcode/03.svg" width="160" alt="Circle QR code" />

## Features

- **Pure SVG.** No canvas, no raster images, scales perfectly at any size.
- **Zero runtime dependencies.** QR encoding implemented from scratch (ISO/IEC 18004).
- **Smaller symbols.** Multi-segment encoding picks the cheapest mode per run of characters.
- **Fully typed.** Written in TypeScript with strict mode.
- **3 dot styles.** Square, circle, and snake-connected rounded.
- **Customizable corners.** Independent style and color for each finder pattern part.
- **Logo support.** Embed an image or any React element in the center.
- **Export helpers.** `toSVGString()` for server use, `toDataURL()` for PNG/JPEG download.
- **Server-safe entry.** `@ttsalpha/qrcode/server` works in React Server Components.
- **Tree-shakeable.** Named exports only, ESM + CJS output.

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
  dotColor="#171717"
  corner={{
    square: { style: 'extra-rounded', color: '#14b8a6' },
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
    size: 0.5,
    margin: 4,
  }}
/>
```

`logo.size` is a 0–1 scale relative to the largest safe logo, not a pixel
size. The error correction level is raised automatically to match, so
`qr.errorCorrectionLevel` only needs setting when you want to override it. See
[LogoOptions](#logooptions) for the full mapping.

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

| Prop              | Type            | Default   | Description                                      |
| ----------------- | --------------- | --------- | ------------------------------------------------ |
| `value`           | `string`        | required  | The data to encode                               |
| `size`            | `number`        | `256`     | SVG size in pixels                               |
| `margin`          | `number`        | `4`       | Quiet zone size in modules                       |
| `dotStyle`        | `DotStyle`      | `square`  | Style of data modules                            |
| `dotColor`        | `string`        | `#000000` | Color of data modules                            |
| `backgroundColor` | `string`        | `#ffffff` | Background color (`transparent` ok)              |
| `corner`          | `CornerOptions` | —         | Finder pattern corner styles                     |
| `logo`            | `LogoOptions`   | —         | Logo in the center of the QR code                |
| `qr`              | `QROptions`     | —         | QR encoding options                              |
| `className`       | `string`        | —         | CSS class on the `<svg>` element                 |
| `style`           | `CSSProperties` | —         | Inline style on the `<svg>` element              |
| `ariaLabel`       | `string`        | —         | Accessible label, defaults to `QR code: {value}` |

An empty `value`, or one too long to fit any version, throws a `RangeError`
rather than rendering nothing. The ceiling is roughly 2,950 bytes at error
correction level `L` and 1,270 at `H`, so catch it when the value comes from
user input.

### `DotStyle`

| Value     | Description                                                  |
| --------- | ------------------------------------------------------------ |
| `square`  | Full square                                                  |
| `circle`  | Full circle                                                  |
| `rounded` | Rounded corners, adjacent modules connect into a fluid shape |

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

When `corner.dot.style` is omitted it follows the square style:

| `corner.square.style` | default `corner.dot.style` |
| --------------------- | -------------------------- |
| `extra-rounded`       | `rounded`                  |
| `circle`              | `circle`                   |
| anything else         | `square`                   |

### `LogoOptions`

```ts
interface LogoOptions {
  src?: string; // https, relative path, blob:, or data:image/... URI
  element?: ReactNode; // takes priority over src if both are given
  size?: number; // 0–1, relative to the largest safe logo. default: 0.4
  margin?: number; // gap between logo and cleared area. larger means smaller logo
  hideDots?: boolean; // clear QR dots behind the logo. default: true
}
```

The error correction level is picked from `logo.size`, so a bigger logo
automatically buys the redundancy it needs:

| `logo.size` | Error correction | Logo width, at most |
| ----------- | ---------------- | ------------------- |
| `≤ 0.25`    | `L`              | 15% of the QR       |
| `≤ 0.44`    | `M`              | 20%                 |
| `≤ 0.69`    | `Q`              | 25%                 |
| `≤ 1.00`    | `H`              | 30%                 |

Setting `qr.errorCorrectionLevel` yourself overrides this, and the logo is then
clamped to whatever that level can safely carry (with a console warning in
development). Aspect ratio is detected from `src` or `element`; for a landscape
logo the height shrinks proportionally so it is never wider than the QR itself.

`size` snaps to whole modules so the cleared area never cuts a dot in half. It
lands on the nearest size that fits the grid and never on a larger one, which is
coarse enough to notice on a small symbol.

> **Security.** `javascript:` and non-image `data:` URIs in `src` are silently
> rejected. Never pass unsanitised user input as `element`: it is rendered
> verbatim inside a `<foreignObject>`.

### `QROptions`

```ts
interface QROptions {
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'; // default: 'M'
  version?: number; // 1–40. default: auto
}
```

## Export Helpers

Both helpers are available from two entry points:

| Import from               | Use when                                                 |
| ------------------------- | -------------------------------------------------------- |
| `@ttsalpha/qrcode`        | Client components, anything that also renders `<QRCode>` |
| `@ttsalpha/qrcode/server` | React Server Components, and any server-only code        |

The root entry is marked `'use client'` because it ships the `<QRCode>`
component. In a React Server Component every export of a client module becomes a
client reference, so calling `toSVGString()` from the root entry there throws.
The `/server` entry exposes the same helpers and types with no client boundary.

### `toSVGString(props)`

Generates an SVG string without mounting to the DOM. Useful for server-side
rendering, saving to a database, or copying to the clipboard. Output is
deterministic: identical props always produce an identical string, so results
can be content-hashed and cached.

```ts
import { toSVGString } from '@ttsalpha/qrcode/server';

const svg = toSVGString({ value: 'https://example.com', size: 512 });
// "<svg role="img" ...>...</svg>"
```

### `toDataURL(props, options?)`

Renders the QR code to a `data:` URL via Canvas. Browser only, since it needs
the Canvas API.

```ts
import { toDataURL } from '@ttsalpha/qrcode';
// or '@ttsalpha/qrcode/server' outside a client component

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
| `format`  | `'png' \| 'jpeg'` | `png`           | Output image format           |
| `quality` | `number` (0–1)    | browser default | JPEG quality. Ignored for PNG |

Two things behave differently here than in `<QRCode>`:

- **Transparency.** JPEG has no alpha channel, so a `transparent`
  `backgroundColor` is filled with white.
- **Remote logos.** The SVG is rasterised by loading it as an image, and a
  document loaded that way may not fetch external resources. A `logo.src`
  pointing at an `http(s)` URL is dropped from the output even though it renders
  fine in `<QRCode>`. Pass a `data:image/...` URI if the logo must appear in the
  exported image.

## Technical Details

- QR versions 1–40, auto-selects the minimum version that fits the data
- Encoding modes: Numeric, Alphanumeric, Byte (UTF-8)
- Full Reed-Solomon error correction over GF(256)
- All 8 mask patterns evaluated with ISO 18004 penalty scoring
- All function patterns: finder, separator, timing, alignment, dark module,
  format info, version info
- Generated matrices are memoized in a 16-entry LRU, so repeated renders of the
  same value skip encoding entirely

### Encoding

The value is split into the cheapest sequence of mode segments rather than
forced into one mode, so a long digit run inside mixed text is encoded as
digits. An EMVCo or VietQR string drops from version 7 to 5 (45 to 37 modules
per side) at the same error correction level, while an ordinary lowercase URL
has nothing to split. The result is never larger than single-mode encoding.

## License

[MIT](https://github.com/ttsalpha/qrcode/blob/main/LICENSE) © [Son Tran](https://github.com/ttsalpha)
