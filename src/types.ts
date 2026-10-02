import type { ReactNode, CSSProperties, SVGProps } from 'react';
import type { CoreLogoOptions, SVGStringOptions } from './core/types';

export type {
  CornerDotStyle,
  CornerOptions,
  CornerSquareStyle,
  DotStyle,
  EncodingMode,
  ErrorCorrectionLevel,
  QROptions,
} from './core/types';

export interface LogoOptions extends CoreLogoOptions {
  /**
   * Arbitrary React node rendered inside a `<foreignObject>`. Never pass
   * content derived from untrusted user input without sanitising it first,
   * as it is rendered verbatim and can execute scripts.
   */
  element?: ReactNode;
}

// What <QRCode> and toSVGString both take; toSVGString reads exactly these.
export interface QRCodeProps extends Omit<SVGStringOptions, 'logo' | 'style'> {
  logo?: LogoOptions;
  style?: CSSProperties;
}

/**
 * Props for `<QRCode>`: the shared contract plus anything else an `<svg>`
 * accepts, such as `id`, `onClick` and `data-*`, which are spread onto the
 * root element. Only the component takes these; `toSVGString` renders from
 * {@link QRCodeProps} alone and would silently drop them.
 */
export type QRCodeComponentProps = QRCodeProps &
  Omit<
    SVGProps<SVGSVGElement>,
    | keyof QRCodeProps
    | 'children'
    | 'ref'
    | 'width'
    | 'height'
    | 'viewBox'
    // Set from the component's own props, so accepting them would only
    // advertise an override that never happens.
    | 'role'
    | 'aria-labelledby'
    // Throws at render: the component always has children.
    | 'dangerouslySetInnerHTML'
  >;
