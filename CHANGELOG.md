# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2026-09-27

### Breaking

- `logo.margin` is measured in modules rather than SVG units, so the same
  props give the same logo at any `size`. A value carried over from 2.x is
  several times too large and usually leaves no logo. Start from `1`.
- `toSVGString` throws on `logo.element`, which never produced a valid SVG
  document. Pass `logo.src`, or render `<QRCode>`.
- An invalid `size` or `margin` throws instead of rendering NaN geometry. Zero
  still draws nothing.

### Security

- `toSVGString` wrote the four color props raw into `fill="..."`, so a color
  could close the attribute and inject markup into any page that inlines the
  output. `<QRCode>` was never affected.

### Added

- A `./server` entry with no client boundary, callable from a React Server
  Component.
- Multi-mode segmentation, which splits a value into the cheapest sequence of
  segments. An EMVCo/VietQR string drops from version 7 to 5; output is never
  larger than single-mode encoding.
- `logo.aspectRatio`, needed by `toSVGString`, which cannot load the image.
- `idPrefix`, for two identical symbols on one page.
- `scale` on `toDataURL`.
- `ref` forwarding and passthrough of unknown SVG props on `<QRCode>`.
- `ErrorCorrectionLevel`, `EncodingMode` and `QRCodeComponentProps` are now
  exported.

### Fixed

- Versions 30 to 40 at error correction level M did not decode at all: the
  data capacity was understated by 31 to 98 codewords.
- The `./server` entry threw on import inside a React Server Component.
- A larger `margin` bought a larger logo than the error correction could
  carry. The safe area is now measured against the symbol, and the cleared
  area snaps to whole modules rather than cutting dots in half.
- A payload that fit a version exactly was rejected or pushed to a larger one.
- A lone surrogate silently truncated the payload.
- A non-string `value` encoded a scannable empty symbol.
- Format information copy 2 carried the wrong bits, costing the redundant copy
  decoders fall back to.
- `<QRCode>` and `toSVGString` disagreed about the viewBox and the seams
  between modules; they now share their geometry, their corner rounding and
  their inline-style serialisation.
- `isSafeSrc` accepted `java\tscript:`.
- A control character in the value made the SVG unparseable.
- `toDataURL` hung forever when a cross-origin logo tainted the canvas, and
  leaked an object URL outside the browser.

### Changed

- SVG ids come from a hash of the props rather than a counter, so identical
  props produce identical output that can be content-hashed.

### Performance

- Path building is 2.6x to 3.5x faster, and the `rounded` style emits 29% less
  path data.
- The path is cached alongside its matrix, so repeated `toSVGString` and
  `toDataURL` calls no longer rebuild it.
- Dropping `react-dom/server` keeps over 200 KiB out of any client bundle that
  imports `<QRCode>` and cuts cold-start import from 12.5 ms to 3.3 ms. The
  published package is 129 KB unpacked, down from 704 KB.

## [2.4.3] - 2026-08-02

### Fixed

- The last alignment coordinate for versions 31 and 32 was 132 and 136, where
  ISO/IEC 18004 Annex E requires 134 and 138. Misplaced alignment patterns
  degrade scannability at those two sizes. The 40-row table is replaced by the
  Annex E derivation, which also shrinks the bundle.

### Performance

- Mask scoring fuses into a single row-major pass with per-column running
  state, dropping the size² scratch buffer and the column pass.
- The Reed-Solomon inner loop drops an always-false zero-coefficient guard.
- Path building iterates only the data columns. Output is byte-identical.

## [2.4.2] - 2026-08-01

### Performance

- Minified, targeting es2020: ESM gzip 12.6 KB to 8.2 KB, raw 62 KB to 18.5 KB.
- The 160-row error correction block table becomes three flat arrays plus a
  runtime block split, 19 KB smaller raw, still reproducing ISO 18004 Table 9.
- The matrix is returned as a flat `Uint8Array` rather than converted to
  `boolean[][]` on every render.

No change to the public API or the output.

## [2.4.1] - 2026-07-20

### Fixed

- Removed a `treeshake` build option that dropped the `"use client"` banner.

## [2.4.0] - 2026-07-20

### Performance

- Matrix generation is 4.8x to 7.8x faster cold and near-free on repeated
  values, with bit-identical output and no API change.
- The version is chosen arithmetically rather than by re-encoding up to 40
  candidates, and bits are written into a preallocated `Uint8Array`.
- Mask scoring uses a fused two-pass scorer with a precomputed 12x6 tile per
  pattern, down from roughly 72 full-matrix passes to 16 per generation.
- A 16-entry LRU keyed on value, error correction level and version.
- The React component and `buildSVGString` share one path builder.

## [2.3.1] - 2026-05-30

### Fixed

- A `logo.margin` larger than half the logo box drove the width and height
  negative, so the image rendered outside the box at an unexpected size. The
  logo and its mask are now hidden instead.

### Performance

- `toSVGString` builds the string directly instead of going through
  `renderToStaticMarkup`, roughly 40% faster for one render and 23% at 10,000.
- Coordinates round to 2 decimals and the `square` style uses horizontal
  run-length encoding, cutting SVG output by 79% to 82%.
- Mask selection XORs in place rather than allocating 8 boolean arrays of
  size² per code.

## [2.3.0] - 2026-05-23

### Changed

- The logo safe areas are the empirical linear limits: L 15%, M 20%, Q 25%,
  H 30%.
- `logo.size` defaults to 0.4, up from 0.3, which auto-picks level M and gives
  a logo roughly 19% of the width.

## [2.2.1] - 2026-05-17

### Fixed

- Added the `"use client"` directive to the build output for the Next.js App
  Router.

## [2.2.0] - 2026-05-17

### Added

- The logo aspect ratio is detected automatically: from `naturalWidth` and
  `naturalHeight` for `logo.src`, and from `getBoundingClientRect` plus a
  `ResizeObserver` for `logo.element`. Measurement happens before first paint.

### Changed

- The logo cap is area-based rather than a linear height cap, so a wide logo
  can no longer overflow the code. Square logos are unaffected.

## [2.1.0] - 2026-05-16

### Added

- `toSVGString` and `toDataURL` export helpers.
- Accessibility: `role="img"` and `aria-labelledby`.
- A development warning when `logo.size` exceeds what the error correction
  level allows.

### Fixed

- `hideDots` uses an SVG mask, so it works over a transparent background.

### Performance

- Data modules merge into a single SVG path element.

## [2.0.0] - 2026-05-16

### Breaking

- `width` and `height` are replaced by a single `size` prop.

### Added

- `logo.margin`, a `hideDots` default, and a scannable size clamp.
- `circle` style for corner squares.
- The `"use client"` directive on `<QRCode>`.

## [1.0.0] - 2026-05-15

First release: a QR encoding core implementing ISO/IEC 18004, an SVG renderer,
and React components.

### Fixed

- An empty string is no longer classified as numeric, `encodeQR` throws on
  empty data and validates that the requested version is in 1 to 40 and that
  the data fits it, and padding throws instead of silently truncating on
  overflow.

### Security

- Unsafe `logo.src` URL schemes are rejected, and the risk of `logo.element` is
  documented.

[3.0.0]: https://github.com/ttsalpha/qrcode/compare/v2.4.3...v3.0.0
[2.4.3]: https://github.com/ttsalpha/qrcode/compare/v2.4.2...v2.4.3
[2.4.2]: https://github.com/ttsalpha/qrcode/compare/v2.4.1...v2.4.2
[2.4.1]: https://github.com/ttsalpha/qrcode/compare/v2.4.0...v2.4.1
[2.4.0]: https://github.com/ttsalpha/qrcode/compare/v2.3.1...v2.4.0
[2.3.1]: https://github.com/ttsalpha/qrcode/compare/v2.3.0...v2.3.1
[2.3.0]: https://github.com/ttsalpha/qrcode/compare/v2.2.1...v2.3.0
[2.2.1]: https://github.com/ttsalpha/qrcode/compare/v2.2.0...v2.2.1
[2.2.0]: https://github.com/ttsalpha/qrcode/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/ttsalpha/qrcode/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/ttsalpha/qrcode/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/ttsalpha/qrcode/releases/tag/v1.0.0
