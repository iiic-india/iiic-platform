import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { COPIED, COPIED_FOR_MS, LABEL, TakeItWithYou } from '@/components/experience/TakeItWithYou'

// "Take it with you" (docs/11 §3.6): the button that copies an article's question. The
// clipboard is faked: jsdom has none, as a browser without one would not. Each test sets up
// user-event first, which puts a clipboard of its own in place, and then its own fake over it.

const QUESTION = 'What would a fake reader carry home?'

/** A clipboard that records what it is given, and can refuse. */
function fakeClipboard(refuse = false) {
  const writeText = vi.fn(async (_text: string) => {
    if (refuse) throw new Error('fake refusal')
  })
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  return writeText
}

function noClipboard() {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
}

/** Reduced motion, as the browser reports it, or not. */
function prefersReducedMotion(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: reduce && query.includes('prefers-reduced-motion: reduce'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

const button = () => screen.getByRole('button')

/** A press, then React's effects, so that the two seconds have started when it returns. */
async function press(user: ReturnType<typeof userEvent.setup>) {
  await user.click(button())
  await act(async () => {})
}

/**
 * A user, with fake timers where a test moves the clock. The fake clock also follows the real
 * one, which Testing Library's own short waits need, so a test checks the two seconds with a
 * margin either side rather than to the millisecond.
 */
function setup({ fakeTimers = false } = {}) {
  if (fakeTimers) vi.useFakeTimers({ shouldAdvanceTime: true })
  return userEvent.setup(fakeTimers ? { advanceTimers: vi.advanceTimersByTime } : {})
}

beforeEach(() => {
  prefersReducedMotion(false)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  noClipboard()
})

describe('without JavaScript, or without a clipboard', () => {
  it('is absent from the server’s HTML: the question stays on the page by itself', () => {
    fakeClipboard()
    expect(renderToStaticMarkup(<TakeItWithYou question={QUESTION} />)).toBe('')
  })

  it('is absent where the browser offers no clipboard', () => {
    noClipboard()
    render(<TakeItWithYou question={QUESTION} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('with a clipboard', () => {
  it('is a button that says what it does, and stores nothing anywhere', async () => {
    const user = setup()
    fakeClipboard()
    const stored = vi.spyOn(Storage.prototype, 'setItem')
    render(<TakeItWithYou question={QUESTION} />)
    expect(button()).toHaveProperty('type', 'button')
    expect(button().textContent).toBe(LABEL)
    expect(LABEL).toBe('Take it with you')
    await user.click(button())
    expect(stored).not.toHaveBeenCalled()
    expect(document.cookie).toBe('')
    stored.mockRestore()
  })

  it('copies the question, and reads "Copied" for two seconds', async () => {
    const user = setup({ fakeTimers: true })
    const writeText = fakeClipboard()
    render(<TakeItWithYou question={QUESTION} />)
    await press(user)
    expect(writeText).toHaveBeenCalledExactlyOnceWith(QUESTION)
    expect(button().textContent).toBe(COPIED)
    expect(COPIED_FOR_MS).toBe(2000)
    act(() => {
      vi.advanceTimersByTime(COPIED_FOR_MS - 500)
    })
    expect(button().textContent).toBe(COPIED)
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(button().textContent).toBe(LABEL)
  })

  it('starts the two seconds again on a second press', async () => {
    const user = setup({ fakeTimers: true })
    fakeClipboard()
    render(<TakeItWithYou question={QUESTION} />)
    await press(user)
    act(() => {
      vi.advanceTimersByTime(1200)
    })
    await press(user)
    // 2.4 seconds after the first press, 1.2 after the second: still copied.
    act(() => {
      vi.advanceTimersByTime(1200)
    })
    expect(button().textContent).toBe(COPIED)
    act(() => {
      vi.advanceTimersByTime(COPIED_FOR_MS)
    })
    expect(button().textContent).toBe(LABEL)
  })

  it('tells a screen reader, politely, that the question is copied', async () => {
    const user = setup()
    fakeClipboard()
    render(<TakeItWithYou question={QUESTION} />)
    const status = screen.getByRole('status')
    expect(status.textContent).toBe('')
    await user.click(button())
    expect(status.textContent).toBe(COPIED)
  })

  it('keeps its words when the browser refuses to copy', async () => {
    const user = setup()
    const writeText = fakeClipboard(true)
    render(<TakeItWithYou question={QUESTION} />)
    await user.click(button())
    expect(writeText).toHaveBeenCalledOnce()
    expect(button().textContent).toBe(LABEL)
    expect(screen.getByRole('status').textContent).toBe('')
  })
})

describe('with a keyboard', () => {
  it('is reached with Tab and pressed with Enter or Space, and keeps the focus', async () => {
    const user = setup()
    const writeText = fakeClipboard()
    render(<TakeItWithYou question={QUESTION} />)
    await user.tab()
    expect(document.activeElement).toBe(button())
    await user.keyboard('{Enter}')
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(button().textContent).toBe(COPIED)
    expect(document.activeElement).toBe(button())
    await user.keyboard(' ')
    expect(writeText).toHaveBeenCalledTimes(2)
    expect(document.activeElement).toBe(button())
  })
})

describe('under reduced motion', () => {
  it('does the same, at once, with nothing that moves', async () => {
    prefersReducedMotion(true)
    expect(window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true)
    const user = setup()
    const writeText = fakeClipboard()
    render(<TakeItWithYou question={QUESTION} />)
    await user.click(button())
    expect(writeText).toHaveBeenCalledExactlyOnceWith(QUESTION)
    // The words change in the same step: no transition, no animation of the component's own.
    expect(button().textContent).toBe(COPIED)
    for (const element of [button(), screen.getByRole('status')]) {
      expect(element.getAttribute('style')).toBeNull()
      expect(element.className).not.toMatch(/anim|transition|fade|motion/i)
    }
  })
})
