// Server-safe entry. The root entry ships <QRCode> behind a "use client"
// banner, and in a React Server Component every export of a client module
// becomes a client reference, so calling toSVGString() from one throws. This
// entry carries no banner. Plain Node servers can use either.
//
// Neither entry may import react-dom/server: under the react-server condition
// React resolves it to a stub that throws on import.
export { toSVGString, toDataURL } from './utils';
export type { ToDataURLOptions, ImageFormat } from './utils';
export type {
  QRCodeProps,
  QRCodeComponentProps,
  DotStyle,
  CornerDotStyle,
  CornerSquareStyle,
  ErrorCorrectionLevel,
  EncodingMode,
  LogoOptions,
  CornerOptions,
  QROptions,
} from './types';
