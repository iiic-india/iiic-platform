import { act } from '@testing-library/react'
import { vi } from 'vitest'

/**
 * Stand-ins for what jsdom does not have or cannot know: what is in view, and whether the reader
 * asked for less motion. Tests drive them as a browser would, and the client components cannot
 * tell the difference.
 */

/** IntersectionObserver as a test drives it: the test says what comes into view, and where. */
export class FakeIntersectionObserver {
  static all: FakeIntersectionObserver[] = []
  readonly watched = new Set<Element>()

  constructor(
    private readonly callback: IntersectionObserverCallback,
    readonly options: IntersectionObserverInit = {},
  ) {
    FakeIntersectionObserver.all.push(this)
  }

  observe(element: Element) {
    this.watched.add(element)
  }

  unobserve(element: Element) {
    this.watched.delete(element)
  }

  disconnect() {
    this.watched.clear()
  }

  takeRecords(): IntersectionObserverEntry[] {
    return []
  }

  /**
   * Each element in view or not, with its top edge where the test puts it (jsdom's window is
   * 768 px tall).
   */
  report(entries: { target: Element; inView: boolean; top?: number }[]) {
    act(() =>
      this.callback(
        entries.map(
          ({ target, inView, top = 0 }) =>
            ({
              target,
              isIntersecting: inView,
              intersectionRatio: inView ? 1 : 0,
              boundingClientRect: { top } as DOMRectReadOnly,
            }) as IntersectionObserverEntry,
        ),
        this as unknown as IntersectionObserver,
      ),
    )
  }

  /** Puts the stand-in in the window, forgetting every observer made before. */
  static install() {
    FakeIntersectionObserver.all = []
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  }

  /** The observer a device made, known by the part of the window it watches. */
  static watching(rootMargin: string): FakeIntersectionObserver | undefined {
    return FakeIntersectionObserver.all.find((each) => each.options.rootMargin === rootMargin)
  }
}

/** Whether the reader has asked for reduced motion (prefers-reduced-motion). */
export function prefersReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  }))
}
