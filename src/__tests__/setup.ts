import '@testing-library/jest-dom';

// ResizeObserver: fire the callback immediately on observe() so tests can
// assert on dimension-dependent behaviour without waiting for async ticks.
globalThis.ResizeObserver = class ResizeObserver {
  private cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe(target: Element) {
    // Simulate a measurement using the element's bounding rect.
    // jsdom returns zeros by default; individual tests can override via
    // jest.spyOn(el, 'getBoundingClientRect').mockReturnValue(...).
    const { width, height } = target.getBoundingClientRect();
    this.cb([{ contentRect: { width, height } } as ResizeObserverEntry], this);
  }
  unobserve() {}
  disconnect() {}
};

// Image: expose naturalWidth/naturalHeight so logo.src aspect-ratio tests work.
Object.defineProperty(globalThis.Image.prototype, 'src', {
  set(url: string) {
    Object.defineProperty(this, '_src', { value: url, writable: true });
    // Synthetic load: if the test pre-set naturalWidth/naturalHeight, fire onload.
    if (this.naturalWidth && this.naturalHeight && this.onload) {
      this.onload(new Event('load'));
    }
  },
  get() {
    return (this as { _src?: string })._src ?? '';
  },
  configurable: true,
});
