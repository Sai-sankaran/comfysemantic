import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * jsdom implements neither ResizeObserver nor matchMedia, and the Workbench's
 * canvas sizing reads a measured box through ResizeObserver. Without a stub the
 * measured-fit scale stays 0 forever and every overlay renders at the
 * fallback aspect-ratio size, which would make the geometry tests pass for the
 * wrong reason.
 *
 * The stub reports a fixed viewport. Tests that care about a specific stage
 * size set `__stageRect` before rendering; everything else gets a sane default.
 */
export const STAGE_RECT = { width: 1200, height: 800 };

let stageRect = { ...STAGE_RECT };

export function setStageRect(next: { width: number; height: number }) {
  stageRect = { ...next };
}

/**
 * Every live observer, so a test can simulate the window being resized.
 *
 * The stub otherwise only fires on `observe`, which covers the first measurement
 * but leaves "does a resize disturb the workbench" untestable.
 */
const observers = new Set<() => void>();

/** Re-deliver the current stage size to everything observing it. */
export function fireResizeObservers() {
  for (const fire of [...observers]) fire();
}

class ResizeObserverStub {
  // Declared as a field rather than a constructor parameter property: the
  // project's tsconfig sets `erasableSyntaxOnly`, which forbids that syntax.
  callback: ResizeObserverCallback;
  private targets = new Set<Element>();
  private fire: () => void = () => {};
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  private deliver(target: Element) {
    // Deliver one synchronous measurement, which is what a browser does on the
    // frame after layout.
    this.callback(
      [
        {
          target,
          contentRect: {
            x: 0, y: 0,
            width: stageRect.width,
            height: stageRect.height,
            top: 0, left: 0, bottom: stageRect.height, right: stageRect.width,
            toJSON: () => ({}),
          },
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        } as unknown as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    );
  }
  observe(target: Element) {
    this.targets.add(target);
    this.fire = () => {
      for (const t of this.targets) this.deliver(t);
    };
    observers.add(this.fire);
    this.deliver(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
    observers.delete(this.fire);
  }
}

Element.prototype.scrollIntoView = function () {
  // jsdom does not implement scrollIntoView; the workbench uses it to keep
  // the editor visible when it updates, which is safe to stub as a no-op.
} as typeof Element.prototype.scrollIntoView;

globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

/**
 * jsdom performs no layout, so `getBoundingClientRect()` returns all zeros for
 * every element. The Workbench reads the stage size to compute its fit scale;
 * with a zero rect the scale stays 0 and every sizing assertion would pass or
 * fail for the wrong reason.
 *
 * The stage element reports the configured size; everything else reports a
 * stable non-zero box so nothing else silently collapses either.
 */
const realRect = Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect = function rect(this: Element) {
  if (this.classList?.contains('wb-stage')) {
    return {
      x: 0, y: 0,
      width: stageRect.width, height: stageRect.height,
      top: 0, left: 0,
      bottom: stageRect.height, right: stageRect.width,
      toJSON: () => ({}),
    } as DOMRect;
  }
  return realRect.call(this);
} as typeof Element.prototype.getBoundingClientRect;

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// Tauri asset URLs. The Workbench renders the page through `convertFileSrc`,
// which needs a Tauri host; outside it the call throws and the component shows
// its "page file could not be located" state. Tests that assert overlay
// geometry need the element to exist, so a stable data URL is used instead.
vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (p: string) => `asset://test/${encodeURIComponent(p)}`,
}));

afterEach(() => {
  cleanup();
  stageRect = { ...STAGE_RECT };
  observers.clear();
});