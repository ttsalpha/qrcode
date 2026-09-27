import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement, version as reactVersion } from 'react';
import { QRCode } from '../components/QRCode';
import { toSVGString } from '../utils';
import type { QRCodeProps } from '../types';

// <QRCode> and toSVGString are two independent renderers over one matrix, and
// nothing compared them before: they disagreed on the viewBox whenever the size
// was not divisible by the module count, and the React path left 0.01-unit
// seams between vertically adjacent modules that the string builder did not.
//
// react-dom/server is imported only to serialise the component here; the
// library itself no longer depends on it.

const CASES: Array<[string, QRCodeProps]> = [
  ['default', { value: 'HELLO WORLD' }],
  ['size not divisible by modules', { value: 'HELLO WORLD', size: 256 }],
  ['size divisible by modules', { value: 'HELLO WORLD', size: 290 }],
  ['small size', { value: 'HELLO WORLD', size: 68 }],
  ['margin 0', { value: 'HELLO WORLD', margin: 0 }],
  ['dot circle', { value: 'HELLO WORLD', dotStyle: 'circle' }],
  ['dot rounded', { value: 'HELLO WORLD', dotStyle: 'rounded' }],
  [
    'corner styles',
    {
      value: 'HELLO WORLD',
      corner: { square: { style: 'extra-rounded' }, dot: { style: 'circle' } },
    },
  ],
  [
    'logo',
    {
      value: 'https://shop.example.com/order?id=42',
      logo: { src: 'https://example.com/logo.png', size: 0.5 },
    },
  ],
  [
    'logo with aspect ratio',
    {
      value: 'https://shop.example.com/order?id=42',
      logo: { src: 'https://example.com/logo.png', size: 0.5, aspectRatio: 3 },
    },
  ],
  ['v7 payload', { value: 'A'.repeat(200), size: 333 }],
  // getBoundingClientRect().width routinely lands on a fraction.
  ['fractional size', { value: 'HELLO WORLD', size: 256.789 }],
  ['fractional size, small', { value: 'HELLO WORLD', size: 33.333333 }],
];

const parse = (markup: string) =>
  new DOMParser().parseFromString(markup, 'image/svg+xml');

function geometryOf(doc: Document) {
  const svg = doc.querySelector('svg');
  const paths = [...doc.querySelectorAll('path')].map((p) =>
    p.getAttribute('d'),
  );
  const maskRect = doc.querySelectorAll('mask rect')[1];
  const image = doc.querySelector('image');
  return {
    width: svg?.getAttribute('width'),
    height: svg?.getAttribute('height'),
    viewBox: svg?.getAttribute('viewBox'),
    paths,
    mask: maskRect && {
      x: maskRect.getAttribute('x'),
      y: maskRect.getAttribute('y'),
      width: maskRect.getAttribute('width'),
      height: maskRect.getAttribute('height'),
    },
    logo: image && {
      x: image.getAttribute('x'),
      y: image.getAttribute('y'),
      width: image.getAttribute('width'),
      height: image.getAttribute('height'),
    },
  };
}

describe('the component and toSVGString draw the same geometry', () => {
  for (const [label, props] of CASES) {
    it(label, () => {
      const fromComponent = geometryOf(
        parse(renderToStaticMarkup(createElement(QRCode, props))),
      );
      const fromBuilder = geometryOf(parse(toSVGString(props)));
      expect(fromComponent).toEqual(fromBuilder);
    });
  }
});

// The string builder reimplements React's style serialisation: which
// properties stay unitless, how a camelCase name is hyphenated, and that a
// custom property is left alone. Asserted against React itself rather than
// against a list, since the list is the thing that drifted.
describe('inline styles serialise the way React does', () => {
  const STYLES: Array<Record<string, string | number>> = [
    { opacity: 0.5, zIndex: 2, fontWeight: 600 },
    { strokeWidth: 2, strokeDashoffset: 4, fillOpacity: 0.3 },
    { aspectRatio: 1, gridRow: 2, gridColumn: 3, tabSize: 4 },
    { margin: 8, padding: 0, borderRadius: 4, width: 100 },
    { WebkitTransform: 'rotate(2deg)', msTransform: 'rotate(2deg)' },
    { MozUserSelect: 'none', WebkitLineClamp: 2 },
    { '--myColor': 'red', '--brandGap': '4px', '--n': 3 },
    { color: 'red', backgroundColor: '#fff', lineHeight: 1.5 },
  ];
  for (const style of STYLES) {
    it(Object.keys(style).join(', '), () => {
      const props = { value: 'HELLO WORLD', style } as QRCodeProps;
      const fromComponent = parse(
        renderToStaticMarkup(createElement(QRCode, props)),
      )
        .querySelector('svg')
        ?.getAttribute('style');
      const fromBuilder = parse(toSVGString(props))
        .querySelector('svg')
        ?.getAttribute('style');
      expect(fromBuilder).toBe(fromComponent);
    });
  }

  // Every property React has an opinion about, asserted against React itself:
  // the unitless list was hand-copied once and had already drifted. React 18
  // is excluded because it keeps every vendor-prefixed variant unitless, which
  // React 19 pared back to 26; the builder follows 19.
  const BASE = [
    'animationIterationCount',
    'aspectRatio',
    'borderImageOutset',
    'borderImageSlice',
    'borderImageWidth',
    'boxFlex',
    'boxFlexGroup',
    'boxOrdinalGroup',
    'columnCount',
    'columns',
    'flex',
    'flexGrow',
    'flexPositive',
    'flexShrink',
    'flexNegative',
    'flexOrder',
    'gridArea',
    'gridRow',
    'gridRowEnd',
    'gridRowSpan',
    'gridRowStart',
    'gridColumn',
    'gridColumnEnd',
    'gridColumnSpan',
    'gridColumnStart',
    'fontWeight',
    'lineClamp',
    'lineHeight',
    'opacity',
    'order',
    'orphans',
    'scale',
    'tabSize',
    'widows',
    'zIndex',
    'zoom',
    'fillOpacity',
    'floodOpacity',
    'stopOpacity',
    'strokeDasharray',
    'strokeDashoffset',
    'strokeMiterlimit',
    'strokeOpacity',
    'strokeWidth',
    // A sample of properties that do take px, so the check can fail both ways.
    'width',
    'margin',
    'padding',
    'borderRadius',
    'fontSize',
    'top',
  ];
  const ALL = BASE.flatMap((p) => [
    p,
    ...['Webkit', 'ms', 'Moz', 'O'].map(
      (pre) => pre + p[0].toUpperCase() + p.slice(1),
    ),
  ]);

  it.skipIf(reactVersion.startsWith('18.'))(
    `serialises all ${ALL.length} properties the way React does`,
    () => {
      const mismatched: string[] = [];
      for (const key of ALL) {
        const props = { value: 'HI', style: { [key]: 2 } } as QRCodeProps;
        const mine = parse(toSVGString(props))
          .querySelector('svg')
          ?.getAttribute('style');
        const react = parse(renderToStaticMarkup(createElement(QRCode, props)))
          .querySelector('svg')
          ?.getAttribute('style');
        if (mine !== react) mismatched.push(`${key}: ${mine} != ${react}`);
      }
      expect(mismatched).toEqual([]);
    },
  );

  // The one base property the two supported React majors disagree on. React 18
  // appends px to `scale`, which the CSS spec says is unitless; React 19
  // fixed that, and the builder follows React 19.
  it('follows React 19 on `scale`, the one property 18 and 19 disagree on', () => {
    const props = { value: 'HELLO WORLD', style: { scale: 2 } } as QRCodeProps;
    expect(
      parse(toSVGString(props)).querySelector('svg')?.getAttribute('style'),
    ).toBe('scale:2');

    const fromComponent = parse(
      renderToStaticMarkup(createElement(QRCode, props)),
    )
      .querySelector('svg')
      ?.getAttribute('style');
    expect(fromComponent).toBe(
      reactVersion.startsWith('18.') ? 'scale:2px' : 'scale:2',
    );
  });
});

// A run of dark modules must close exactly where the next one opens. Rounding
// each coordinate off an unrounded module size leaves a sub-pixel seam that
// shows up as pale lines across the symbol.
describe('vertically adjacent modules meet exactly', () => {
  for (const size of [68, 100, 256, 300, 512]) {
    it(`size ${size}`, () => {
      const d =
        parse(toSVGString({ value: 'HELLO WORLD', size }))
          .querySelector('g path')
          ?.getAttribute('d') ?? '';
      const rows = new Map<number, number>();
      for (const m of d.matchAll(/M[\d.]+,([\d.]+)h[\d.-]+v([\d.-]+)/g)) {
        rows.set(Number(m[1]), Number(m[2]));
      }
      const ys = [...rows.keys()].sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) {
        const gap = ys[i] - (ys[i - 1] + (rows.get(ys[i - 1]) as number));
        // Rows are not always adjacent, but when they are the seam is exact.
        // 1e-9 rather than 0: re-parsing exact 2-decimal strings as binary
        // floats leaves noise far below what a real 0.01 seam would show.
        if (Math.abs(gap) < 1) expect(Math.abs(gap)).toBeLessThan(1e-9);
      }
    });
  }
});

// The ids are derived from the props so the output stays content-hashable,
// which means two identical symbols on one page would otherwise share them.
describe('idPrefix', () => {
  const props: QRCodeProps = {
    value: 'HELLO WORLD',
    logo: { src: 'https://example.com/logo.png', size: 0.5 },
  };

  const idsOf = (markup: string) =>
    [...parse(markup).querySelectorAll('[id]')].map((n) =>
      n.getAttribute('id'),
    );

  it('identical props collide without one', () => {
    expect(idsOf(toSVGString(props))).toEqual(idsOf(toSVGString(props)));
  });

  it('separates them when given one', () => {
    const a = idsOf(toSVGString({ ...props, idPrefix: 'a' }));
    const b = idsOf(toSVGString({ ...props, idPrefix: 'b' }));
    expect(a).not.toEqual(b);
    expect(a.every((id) => id?.startsWith('a'))).toBe(true);
    expect(b.every((id) => id?.startsWith('b'))).toBe(true);
  });

  // The prefix lands in attribute position four times and inside url(#...),
  // so it is whitelisted rather than escaped: an escaped quote would still
  // produce a broken reference.
  it('cannot break out of the attribute it lands in', () => {
    const attack = '" onload="alert(1)" x="';
    const svg = toSVGString({ ...props, idPrefix: attack });
    const doc = parse(svg);
    expect(doc.querySelector('parsererror')).toBeNull();
    const root = doc.querySelector('svg') as SVGSVGElement;
    expect(root.hasAttribute('onload')).toBe(false);
    expect(root.getAttribute('aria-labelledby')).toMatch(/^[A-Za-z0-9_-]+$/);
    for (const id of idsOf(svg)) {
      expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('falls back when nothing usable is left', () => {
    expect(idsOf(toSVGString({ ...props, idPrefix: '!!!' }))[0]).toMatch(/^qr/);
  });

  it('keeps two prefixes apart even when they sanitise alike', () => {
    const a = idsOf(toSVGString({ ...props, idPrefix: 'a.b' }));
    const b = idsOf(toSVGString({ ...props, idPrefix: 'a-b' }));
    expect(a).not.toEqual(b);
  });

  it('is not leaked onto the svg element by the component', () => {
    const markup = renderToStaticMarkup(
      createElement(QRCode, { ...props, idPrefix: 'a' }),
    );
    expect(markup).not.toMatch(/idprefix/i);
  });
});
