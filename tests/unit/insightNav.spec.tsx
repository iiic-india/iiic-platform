import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { InsightNav } from '@/components/experience/InsightNav'

import { FakeIntersectionObserver, prefersReducedMotion } from '../helpers/browser'

// The titles beside the insights (docs/11 §3.5), as a component, with fake cards: links to the
// cards, the bar marking the card in view (aria-current). The observer is a stand-in the test
// drives (tests/helpers/browser.ts); its window runs from under the sticky header to 40% down.

const IN_VIEW = '-96px 0px -60% 0px'
const CARDS = [
  { id: 'fake-card-1', title: 'Fake title one' },
  { id: 'fake-card-2', title: 'Fake title two' },
  { id: 'fake-card-3', title: 'Fake title three' },
] as const

const draw = () =>
  render(
    <section>
      <h2 id="fake-heading">Fake heading</h2>
      <InsightNav
        labelledBy="fake-heading"
        ids={CARDS.map((card) => card.id)}
        titles={CARDS.map((card) => card.title)}
      />
      {CARDS.map((card) => (
        <article id={card.id} key={card.id}>
          <h3>{card.title}</h3>
        </article>
      ))}
    </section>,
  )

const links = () =>
  within(screen.getByRole('navigation', { name: 'Fake heading' })).getAllByRole('link')
const marked = () =>
  links()
    .filter((link) => link.getAttribute('aria-current') === 'true')
    .map((link) => link.textContent)
const card = (at: number) => document.getElementById(CARDS[at]?.id ?? '') as HTMLElement
const spy = () => FakeIntersectionObserver.watching(IN_VIEW) as FakeIntersectionObserver

beforeEach(() => {
  FakeIntersectionObserver.install()
  prefersReducedMotion(false)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the titles beside the insights (docs/11 §3.5)', () => {
  it('lists each title as a link to its card, named by the section’s heading', () => {
    draw()
    expect(links().map((link) => [link.textContent, link.getAttribute('href')])).toEqual(
      CARDS.map((each) => [each.title, `#${each.id}`]),
    )
    expect(marked()).toEqual([])
    expect(spy().watched).toEqual(new Set(CARDS.map((_, at) => card(at))))
  })

  it('marks the card in view, the upper one of two, and keeps the last one between cards', () => {
    draw()
    spy().report([{ target: card(1), inView: true }])
    expect(marked()).toEqual([CARDS[1].title])
    spy().report([{ target: card(0), inView: true }])
    expect(marked()).toEqual([CARDS[0].title])
    spy().report([{ target: card(0), inView: false }])
    expect(marked()).toEqual([CARDS[1].title])
    spy().report([{ target: card(1), inView: false }])
    expect(marked()).toEqual([CARDS[1].title])
  })

  it('is one stop per title for the keyboard, in the cards’ order', async () => {
    const user = userEvent.setup()
    draw()
    const stops: (string | null)[] = []
    for (let stop = 0; stop < CARDS.length; stop += 1) {
      await user.tab()
      stops.push(document.activeElement?.getAttribute('href') ?? null)
    }
    expect(stops).toEqual(CARDS.map((each) => `#${each.id}`))
  })

  it('marks the card in view the same way under reduced motion: only the sliding stops', () => {
    prefersReducedMotion(true)
    draw()
    spy().report([{ target: card(2), inView: true }])
    expect(marked()).toEqual([CARDS[2].title])
  })

  it('is a plain list of links where the browser has no IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    draw()
    expect(links()).toHaveLength(CARDS.length)
    expect(marked()).toEqual([])
  })

  it('stops watching when the page goes', () => {
    const { unmount } = draw()
    const observer = spy()
    unmount()
    expect(observer.watched.size).toBe(0)
  })
})
