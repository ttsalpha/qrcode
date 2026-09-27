// Server-safe entry. The root entry carries a "use client" banner because it
// ships the <QRCode> component, and in a React Server Component every export of
// a client module becomes a client reference, so calling toSVGString() from one
// throws. This entry carries no banner, so a Server Component can call it. Plain
// Node servers can use either, since the directive is inert outside RSC.
export { toSVGString, toDataURL } from './utils';
export type { ToDataURLOptions, ImageFormat } from './utils';
export type {
  QRCodeProps,
  DotStyle,
  CornerDotStyle,
  CornerSquareStyle,
  LogoOptions,
  CornerOptions,
  QROptions,
} from './types';
