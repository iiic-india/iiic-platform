import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import styles from '@/components/experience/experience.module.css'
import { ReadingBar } from '@/components/experience/ReadingBar'

import { prefersReducedMotion } from '../helpers/browser'

// The bar (docs/11 §3.1). jsdom runs no stylesheet and scrolls nothing, so the test says how
// long the page is and where the reader is, whether the browser draws the bar from the scroll
// position itself (CSS.supports), and when an animation frame runs. What the stylesheet draws
// is checked in a browser (tests/e2e/experience.e2e.spec.ts).

const nav = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }))

const BAR = styles.readingBar ?? ''
const frames: FrameRequestCallback[] = []
const runFrames = () => frames.splice(0).forEach((frame) => frame(0))

/** The reader scrolls to a point on the page, and the next frame runs. */
function scrollTo(y: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y })
  fireEvent.scroll(window)
  runFrames()
}

const barIn = (container: HTMLElement) =>
  container.getElementsByClassName(BAR).item(0) as HTMLElement | null

beforeEach(() => {
  frames.length = 0
  prefersReducedMotion(false)
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => frames.push(frame))
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('CSS', { supports: () => false })
  // A page two windows longer than the window: 2,768 px against jsdom's 768.
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    value: 2768,
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  nav.pathname = '/'
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
})

describe('the bar (docs/11 §3.1)', () => {
  it('is on the narrative pages only, and hidden from assistive technology', () => {
    for (const path of ['/', '/framework', '/founders']) {
      nav.pathname = path
      const { container, unmount } = render(<ReadingBar />)
      expect(barIn(container)?.getAttribute('aria-hidden'), path).toBe('true')
      unmount()
    }
    // Counselling and booking above all carry no device (docs/11 §2, principle 6).
    for (const path of ['/counselling', '/book/session', '/organisations', '/learn', '/home']) {
      nav.pathname = path
      const { container, unmount } = render(<ReadingBar />)
      expect(container.innerHTML, path).toBe('')
      unmount()
    }
  })

  it('grows with the reader’s progress where the browser cannot grow it by itself', () => {
    nav.pathname = '/framework'
    const { container } = render(<ReadingBar />)
    runFrames()
    expect(barIn(container)?.style.getPropertyValue('--progress')).toBe('0')
    scrollTo(1000)
    expect(barIn(container)?.style.getPropertyValue('--progress')).toBe('0.5')
    scrollTo(2000)
    expect(barIn(container)?.style.getPropertyValue('--progress')).toBe('1')
  })

  it('draws once a frame however often the page scrolls, and listens passively', () => {
    const listen = vi.spyOn(window, 'addEventListener')
    nav.pathname = '/founders'
    const { container } = render(<ReadingBar />)
    runFrames()
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 500 })
    for (let scroll = 0; scroll < 5; scroll += 1) fireEvent.scroll(window)
    expect(frames).toHaveLength(1)
    runFrames()
    expect(barIn(container)?.style.getPropertyValue('--progress')).toBe('0.25')
    expect(listen).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true })
  })

  it('leaves the growing to the browser where CSS draws it from the scroll position', () => {
    vi.stubGlobal('CSS', { supports: (rule: string) => rule === 'animation-timeline: scroll()' })
    nav.pathname = '/founders'
    const { container } = render(<ReadingBar />)
    scrollTo(1000)
    expect(frames).toHaveLength(0)
    expect(barIn(container)?.style.getPropertyValue('--progress')).toBe('')
  })

  it('stands still under reduced motion: nothing listens, and the stylesheet draws it full', () => {
    prefersReducedMotion(true)
    nav.pathname = '/'
    const { container } = render(<ReadingBar />)
    scrollTo(1000)
    expect(frames).toHaveLength(0)
    expect(barIn(container)?.style.getPropertyValue('--progress')).toBe('')
  })

  it('goes, and stops listening, when the reader moves on to a page without it', () => {
    nav.pathname = '/framework'
    const { container, rerender } = render(<ReadingBar />)
    runFrames()
    nav.pathname = '/counselling'
    rerender(<ReadingBar />)
    expect(barIn(container)).toBeNull()
    scrollTo(1000)
    expect(frames).toHaveLength(0)
  })
})
