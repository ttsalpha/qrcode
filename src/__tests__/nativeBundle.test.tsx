import { describe, it, expect, vi, afterEach } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { createElement } from 'react';
import { render, cleanup } from '@testing-library/react';

// The published native bundle, not the source: react-native-svg cannot load in
// Node, so it is mocked, and what is under test is the code the build emitted.
vi.mock('react-native-svg', async () => {
  const React = await import('react');
  type Props = { children?: React.ReactNode; [prop: string]: any };
  const host = (tag: string) =>
    React.forwardRef<Element, Props>(function Host(
      { children, accessible: _a, accessibilityRole, accessibilityLabel, ...p },
      ref,
    ) {
      return React.createElement(
        tag,
        {
          ...p,
          ref,
          role: accessibilityRole,
          'aria-label': accessibilityLabel,
        },
        children,
      );
    });
  const Svg = host('svg');
  return {
    default: Svg,
    Svg,
    Path: host('path'),
    Rect: host('rect'),
    G: host('g'),
    Defs: host('defs'),
    Mask: host('mask'),
    ClipPath: host('clipPath'),
    Image: ({ href, ...p }: Props) =>
      React.createElement('image', {
        ...p,
        href: (href as { uri: string }).uri,
      }),
    SvgXml: () => null,
  };
});

const built = existsSync(resolve(process.cwd(), 'dist/native.js'));

afterEach(cleanup);

describe.skipIf(!built)('published native bundle', () => {
  const load = () => {
    const path = resolve(process.cwd(), 'dist/native.js');
    return import(/* @vite-ignore */ path);
  };

  it('exports only QRCode', async () => {
    expect(Object.keys(await load())).toEqual(['QRCode']);
  });

  it('renders a symbol with a logo', async () => {
    const { QRCode } = await load();
    const { container } = render(
      createElement(QRCode, {
        value: 'https://example.com/pay',
        logo: { src: 'https://example.com/logo.png', radius: 0.5 },
      }),
    );
    expect(container.querySelectorAll('path').length).toBeGreaterThan(3);
    expect(container.querySelector('image')?.getAttribute('href')).toBe(
      'https://example.com/logo.png',
    );
    expect(container.querySelector('svg')?.getAttribute('role')).toBe('image');
  });
});
