# @ttsalpha/qrcode

Lightweight, fully customizable QR code library for React and React Native. Pure SVG, zero dependencies, built from scratch.

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
- **Logo support.** Embed an image or any React element in the center, with optional rounded corners.
- **Export helpers.** `toSVGString()` for server use, `toDataURL()` for PNG/JPEG download.
- **Server-safe entry.** `@ttsalpha/qrcode/server` works in React Server Components.
- **React Native.** `@ttsalpha/qrcode/native` draws the same symbols with `react-native-svg`. See [React Native and Expo](#react-native-and-expo).
- **Framework-free core.** `@ttsalpha/qrcode/core` returns the geometry of a symbol, with no React and no DOM. See [Core](#core).
- **Tree-shakeable.** Named exports only, ESM + CJS output.

## Installation

```bash
pnpm add @ttsalpha/qrcode
```

React 18+ is required as a peer dependency. `react-dom` is not needed. For
React Native, also install `react-native-svg`; see
[React Native and Expo](#react-native-and-expo).

## Entry points

| Import from               | Contents                                       | Needs at runtime                      |
| ------------------------- | ---------------------------------------------- | ------------------------------------- |
| `@ttsalpha/qrcode`        | `<QRCode>`, `toSVGString`, `toDataURL`         | React 18+                             |
| `@ttsalpha/qrcode/server` | `toSVGString`, `toDataURL`, no client boundary | nothing (`toDataURL` needs a browser) |
| `@ttsalpha/qrcode/native` | `<QRCode>` for React Native                    | React 18+, `react-native-svg`         |
| `@ttsalpha/qrcode/core`   | `buildQR`, `toSVGString`                       | nothing                               |

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
    margin: 1,
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

Only `<QRCode>` accepts `element`. [`toSVGString`](#tosvgstringprops) renders
without React, so it takes `logo.src` instead.

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
| `idPrefix`        | `string`        | `qr`      | Prefix for generated ids. `toSVGString` only     |

`idPrefix` is reduced to `A-Z a-z 0-9 _ -` before use, since it lands in
attribute position and inside `url(#…)`; two prefixes that reduce to the same
text still produce different ids.

Anything else an `<svg>` accepts (`id`, `onClick`, `data-*`, …) is passed
through to the root element, and `ref` gives you the `SVGSVGElement`.

An empty `value`, or one too long to fit any version, throws a `RangeError`
rather than rendering nothing. The ceiling is roughly 2,950 bytes at error
correction level `L` and 1,270 at `H`. A throw during render unmounts the React
tree above it, so wrap the component in an error boundary when the value comes
from user input, or validate the length before passing it in.

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

> `corner.square.style: 'circle'` replaces the square finder ring with a round
> one. Scanners look for the square 1:1:3:1:1 ratio, so this trades some
> scanning reliability for the look; test it at the size you will print.

### `LogoOptions`

```ts
interface LogoOptions {
  src?: string; // https, relative path, blob:, or data:image/... URI
  element?: ReactNode; // takes priority over src if both are given
  size?: number; // 0–1, relative to the largest safe logo. default: 0.4
  aspectRatio?: number; // width / height. default: measured from src, else 1
  margin?: number; // gap between logo and cleared area, in modules
  hideDots?: boolean; // clear QR dots behind the logo. default: true
  radius?: number; // corner radius, 0 (square) to 1 (fully rounded). default: 0
}
```

`radius` is a share of the logo's shorter side, so `1` makes a square logo a
circle and `0.2` rounds the corners slightly. It clips `src` and `element`
alike.

The error correction level is picked from `logo.size`, so a bigger logo
automatically buys the redundancy it needs:

| `logo.size` | Error correction | Cleared width, at most |
| ----------- | ---------------- | ---------------------- |
| `≤ 0.25`    | `L`              | 15% of the symbol      |
| `≤ 0.44`    | `M`              | 20%                    |
| `≤ 0.69`    | `Q`              | 25%                    |
| `≤ 1.00`    | `H`              | 30%                    |

The percentages are of the symbol, not of the rendered image: `margin` adds
quiet zone, which carries no error correction, so it never buys a larger logo.

Setting `qr.errorCorrectionLevel` yourself overrides this, and the logo is then
clamped to whatever that level can safely carry (with a console warning outside
production builds). For a landscape logo the height shrinks proportionally so it
is never wider than the QR itself.

`<QRCode>` measures the aspect ratio from `src` or `element` after it loads. Set
`logo.aspectRatio` to skip the measurement and the reflow that follows, and to
get the same layout out of `toSVGString`, which cannot load the image and
otherwise assumes a square.

`size` snaps to whole modules so the cleared area never cuts a dot in half. The
cleared area rounds up to the next odd module count, and the logo is then
scaled down to fit inside it, so the logo itself never grows beyond what was
asked for. On a small symbol the step between sizes is coarse enough to notice.

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

`logo.element` is a React node and has no meaning outside a React render, so
passing it here throws. Use `logo.src` for a string, or render `<QRCode>`.

### `toDataURL(props, options?)`

Renders the QR code to a `data:` URL via Canvas. Browser only, since it needs
the Canvas API.

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

| Option    | Type              | Default         | Description                      |
| --------- | ----------------- | --------------- | -------------------------------- |
| `format`  | `'png' \| 'jpeg'` | `png`           | Output image format              |
| `quality` | `number` (0–1)    | browser default | JPEG quality. Ignored for PNG    |
| `scale`   | `number`          | `1`             | Raster size multiplier of `size` |

Two things behave differently here than in `<QRCode>`:

- **Transparency.** JPEG has no alpha channel, so a `transparent`
  `backgroundColor` is filled with white.
- **Remote logos.** The SVG is rasterised by loading it as an image, and a
  document loaded that way may not fetch external resources. A `logo.src`
  pointing at an `http(s)` URL is dropped from the output even though it renders
  fine in `<QRCode>`. Pass a `data:image/...` URI if the logo must appear in the
  exported image.

## React Native and Expo

`@ttsalpha/qrcode/native` draws the same symbols as `<QRCode>` with
[`react-native-svg`](https://github.com/software-mansion/react-native-svg).
Nothing else is added to your app: the package still has no runtime
dependencies, and `react-native-svg` is an optional peer dependency.

```bash
pnpm add @ttsalpha/qrcode

# Expo
npx expo install react-native-svg

# React Native without Expo
pnpm add react-native-svg
```

```tsx
import { QRCode } from '@ttsalpha/qrcode/native';

export default function Pay() {
  return (
    <QRCode
      value="https://example.com"
      size={240}
      dotStyle="rounded"
      corner={{ square: { style: 'extra-rounded' } }}
      logo={{ src: require('./logo.png'), radius: 0.3 }}
    />
  );
}
```

**Requirements**

- `react-native-svg` 14 or newer.
- React Native 0.75 or newer. The encoder uses the global `TextEncoder`.
- A Metro that resolves package `exports`, which is the default from React
  Native 0.79 and Expo SDK 53. On an older setup, set
  `config.resolver.unstable_enablePackageExports = true` in `metro.config.js`.

`value`, `size`, `margin`, `dotStyle`, `dotColor`, `backgroundColor`, `corner`
and `qr` work exactly as in [`QRCodeProps`](#qrcodeprops). Everything else an
`<Svg>` accepts (`style`, `testID`, `onLayout`, …) is passed through. These
differ from the web component:

| Prop        | Type                     | Description                                                                               |
| ----------- | ------------------------ | ----------------------------------------------------------------------------------------- |
| `logo`      | `NativeLogoOptions`      | See below                                                                                 |
| `ariaLabel` | `string`                 | Becomes `accessibilityLabel`. Defaults to `QR code: {value}`. The role is `image`         |
| `onError`   | `(error: Error) => void` | Called when the symbol cannot be drawn. The component renders nothing instead of throwing |

The prop types are exported as `NativeQRCodeProps` and `NativeLogoOptions`.
There is no `className`, and `idPrefix` is not needed. Without `onError`, an
empty `value` or one too long to fit throws while rendering, as on the web.

### `NativeLogoOptions`

`size`, `aspectRatio`, `margin`, `hideDots` and `radius` mean the same as in
[`LogoOptions`](#logooptions). The sources are different:

```ts
interface NativeLogoOptions {
  src?: string | number; // a URL, or a local asset from require('./logo.png')
  svg?: string; // the logo as SVG markup. wins over src
}
```

- For a vector logo, pass its markup as `svg` rather than as `src`.
- Native cannot measure an image, so a logo is square unless you set
  `aspectRatio`.

### Getting an image

`<QRCode>` forwards its `ref` to the `Svg`, which can rasterise itself:

```tsx
import Svg from 'react-native-svg';

const ref = useRef<React.ElementRef<typeof Svg>>(null);

<QRCode ref={ref} value="https://example.com" />;

ref.current?.toDataURL((base64) => {
  // PNG, base64 without the data: prefix
});
```

For an SVG string, to save an `.svg` file or to render with `SvgXml`, import
[`toSVGString`](#tosvgstringprops) from `@ttsalpha/qrcode/core`. It is plain
JavaScript, so it works in React Native, and the native entry stays free of it.

### Not supported on native

- `logo.element`. There is no `<foreignObject>`; a warning is logged in
  development and the logo is skipped. Use `logo.src` or `logo.svg`.
- `toDataURL(props)`. It needs a canvas. Use the `ref` above.
- `className`, and the web-only `<svg>` props such as `onClick` and `data-*`.
- `logo.svg` in `toSVGString`. Use `logo.src` there.

## Core

`@ttsalpha/qrcode/core` is the part every renderer is built on. It is plain
JavaScript with no React and no DOM, so it runs on a server, in a worker, and in
React Native.

```ts
import { buildQR, toSVGString } from '@ttsalpha/qrcode/core';

const geometry = buildQR({ value: 'https://example.com', size: 256 });
```

`buildQR(props)` returns a `QRGeometry`, in a square coordinate space of
`viewBox` units, ready to draw with any renderer:

```ts
interface QRGeometry {
  size: number; // rendered width and height
  viewBox: number; // side of the square viewBox
  ecLevel: 'L' | 'M' | 'Q' | 'H'; // after logo sizing
  background?: string; // absent when transparent
  modules?: { d: string; fill: string }; // all data modules, one path
  finders: Array<{
    square: { d: string; fill: string; fillRule?: 'evenodd' }; // 7×7 ring
    dot: { d: string; fill: string }; // 3×3 dot
  }>;
  clear?: { x: number; y: number; width: number; height: number }; // cut out of the dots
  logo?: {
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
    src?: string;
  };
  warnings: string[];
}
```

Draw the background, then `modules` and `finders` with `clear` knocked out of
them, then `logo`. The props are those of [`QRCodeProps`](#qrcodeprops) minus
the React-only ones. `logo.custom: true` reserves the logo area without a `src`,
for a logo the renderer draws itself. Invalid input throws a `RangeError` or
`TypeError`, as in `<QRCode>`.

`toSVGString` takes the same options as the one exported from `/server`, with
types that need no React. React Native apps import it from here.

## Technical Details

- QR versions 1–40, auto-selects the minimum version that fits the data
- Encoding modes: Numeric, Alphanumeric, Byte (UTF-8)
- Full Reed-Solomon error correction over GF(256)
- All 8 mask patterns evaluated with ISO 18004 penalty scoring
- All function patterns: finder, separator, timing, alignment, dark module,
  format info, version info
- Generated matrices are memoized in a 16-entry LRU, so repeated renders of the
  same value skip encoding entirely, and the SVG path is cached alongside the
  matrix it was built from

### Encoding

The value is split into the cheapest sequence of mode segments rather than
forced into one mode, so a long digit run inside mixed text is encoded as
digits. An EMVCo or VietQR string drops from version 7 to 5 (45 to 37 modules
per side) at the same error correction level, while an ordinary lowercase URL
has nothing to split. The result is never larger than single-mode encoding.

## License

[MIT](https://github.com/ttsalpha/qrcode/blob/main/LICENSE) © [Son Tran](https://github.com/ttsalpha)
