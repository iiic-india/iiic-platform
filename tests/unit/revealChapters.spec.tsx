import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RevealChapters } from '@/components/experience/RevealChapters'

import { FakeIntersectionObserver, prefersReducedMotion } from '../helpers/browser'

// Chapters reveal once as they come into view (docs/11 §3.5, §7), as a component, with fake
// chapters. The observer is a stand-in the test drives (tests/helpers/browser.ts): it says
// whether a chapter is past the window's lowest tenth, and where its top edge is in a window
// 768 px tall. The stylesheet's part (what "waiting" and "in" look like) is checked in a
// browser (tests/e2e/experience.e2e.spec.ts).

const REVEAL = '0px 0px -10% 0px'

const draw = () =>
  render(
    <main>
      {['Fake chapter one', 'Fake chapter two', 'Fake chapter three', 'Fake chapter four'].map(
        (heading) => (
          <div data-reveal="" key={heading}>
            <section>
              <h2>{heading}</h2>
            </section>
          </div>
        ),
      )}
      <RevealChapters />
    </main>,
  )

const chaptersIn = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLElement>('[data-reveal]'),
]
const states = (chapters: HTMLElement[]) =>
  chapters.map((chapter) => chapter.getAttribute('data-reveal'))
const observer = () => FakeIntersectionObserver.watching(REVEAL) as FakeIntersectionObserver

beforeEach(() => {
  FakeIntersectionObserver.install()
  prefersReducedMotion(false)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('chapters that reveal once (docs/11 §3.5)', () => {
  it('are drawn visible, and all watched by one observer', () => {
    const { container } = draw()
    const chapters = chaptersIn(container)
    expect(states(chapters)).toEqual(['', '', '', ''])
    expect(FakeIntersectionObserver.all).toHaveLength(1)
    expect(observer().watched).toEqual(new Set(chapters))
  })

  it('holds back only the chapters below the window, and reveals each once it comes into view', () => {
    const { container } = draw()
    const chapters = chaptersIn(container)
    const [first, second, third, fourth] = chapters as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ]
    observer().report([
      { target: first, inView: true, top: 300 },
      // In the window's lowest tenth: the reader may see it already, so it stays as it is.
      { target: second, inView: false, top: 700 },
      { target: third, inView: false, top: 1400 },
      { target: fourth, inView: false, top: 2600 },
    ])
    expect(states(chapters)).toEqual(['', '', 'waiting', 'waiting'])
    expect(observer().watched).toEqual(new Set([third, fourth]))
    observer().report([{ target: third, inView: true, top: 600 }])
    expect(states(chapters)).toEqual(['', '', 'in', 'waiting'])
    // Once: a chapter that has come in is no longer watched.
    expect(observer().watched).toEqual(new Set([fourth]))
  })

  it('never hides a chapter above the window, as on a page opened at a link further down', () => {
    const { container } = draw()
    const [first] = chaptersIn(container) as [HTMLElement]
    observer().report([{ target: first, inView: false, top: -900 }])
    expect(first.getAttribute('data-reveal')).toBe('')
    expect(observer().watched.has(first)).toBe(false)
  })

  it('holds nothing back under reduced motion', () => {
    prefersReducedMotion(true)
    const { container } = draw()
    expect(FakeIntersectionObserver.all).toEqual([])
    expect(states(chaptersIn(container))).toEqual(['', '', '', ''])
  })

  it('holds nothing back where the browser has no IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const { container } = draw()
    expect(states(chaptersIn(container))).toEqual(['', '', '', ''])
  })

  it('shows a held-back chapter again, and stops watching, when the page goes', () => {
    const { container, unmount } = draw()
    const fourth = chaptersIn(container).at(-1) as HTMLElement
    observer().report([{ target: fourth, inView: false, top: 2600 }])
    expect(fourth.getAttribute('data-reveal')).toBe('waiting')
    const watcher = observer()
    unmount()
    expect(fourth.getAttribute('data-reveal')).toBe('')
    expect(watcher.watched.size).toBe(0)
  })
})
