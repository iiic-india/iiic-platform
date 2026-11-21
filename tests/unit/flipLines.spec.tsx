import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FLIP_COPY } from '@/components/experience/copy'
import styles from '@/components/experience/experience.module.css'
import { FlipLines } from '@/components/experience/FlipLines'

import { prefersReducedMotion } from '../helpers/browser'

// Flip the line (docs/11 §3.2) as a component, with fake lines, so that what is tested is the
// device and not the copy; the framework page's own lines are drawn in experienceDevices.spec.tsx.
// The keys are pressed as a person presses them (user-event): Enter and Space press a native
// button, Tab moves between them.

const LINES = [
  { object: 'Fake object line one', subject: 'Fake subject line one' },
  { object: 'Fake object line two', subject: 'Fake subject line two, a little longer' },
  { object: 'Fake object line three', subject: 'Fake subject line three' },
] as const
const [ONE, TWO, THREE] = LINES

const draw = () =>
  render(
    <FlipLines id="fake" lines={[...LINES]}>
      <table>
        <tbody>
          {LINES.map((line) => (
            <tr key={line.object}>
              <th scope="row">{line.object}</th>
              <td>{line.subject}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </FlipLines>,
  )

/** The line buttons, by whether each shows its subject side. */
const linesShowing = (pressed: boolean) =>
  screen
    .queryAllByRole('button', { pressed })
    .filter((button) => button.textContent !== FLIP_COPY.flipAll)
const flipAll = () => screen.getByRole('button', { name: FLIP_COPY.flipAll })

beforeEach(() => prefersReducedMotion(false))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('Flip the line (docs/11 §3.2)', () => {
  it('makes each line a toggle button named by the side it shows, and says what pressing does', () => {
    draw()
    for (const line of LINES) {
      const button = screen.getByRole('button', {
        name: line.object,
        pressed: false,
        description: FLIP_COPY.toSubject,
      })
      expect(button.getAttribute('type')).toBe('button')
      expect(button.getAttribute('aria-description')).toBe(FLIP_COPY.toSubject)
    }
    // The hints are read through the buttons alone, never as text of their own.
    for (const hint of [FLIP_COPY.toSubject, FLIP_COPY.toObject]) {
      expect(screen.getByText(hint).hasAttribute('hidden')).toBe(true)
    }
    expect(flipAll().getAttribute('aria-pressed')).toBe('false')
  })

  it('turns a line with Enter and back with Space, and focus stays where it was', async () => {
    const user = userEvent.setup()
    draw()
    await user.tab()
    const button = screen.getByRole('button', { name: ONE.object, pressed: false })
    expect(document.activeElement).toBe(button)
    await user.keyboard('{Enter}')
    expect(
      screen.getByRole('button', {
        name: ONE.subject,
        pressed: true,
        description: FLIP_COPY.toObject,
      }),
    ).toBe(button)
    expect(button.getAttribute('aria-description')).toBe(FLIP_COPY.toObject)
    expect(document.activeElement).toBe(button)
    // Only the line pressed turned.
    expect(linesShowing(true)).toEqual([button])
    await user.keyboard(' ')
    expect(
      screen.getByRole('button', {
        name: ONE.object,
        pressed: false,
        description: FLIP_COPY.toSubject,
      }),
    ).toBe(button)
    expect(document.activeElement).toBe(button)
    expect(linesShowing(true)).toEqual([])
  })

  it('is one stop per line, then Flip all, then Show both, in reading order', async () => {
    const user = userEvent.setup()
    draw()
    const stops: string[] = []
    for (let stop = 0; stop < 5; stop += 1) {
      await user.tab()
      stops.push(document.activeElement?.textContent ?? '')
    }
    expect(stops).toEqual([
      ONE.object + ONE.subject,
      TWO.object + TWO.subject,
      THREE.object + THREE.subject,
      FLIP_COPY.flipAll,
      FLIP_COPY.showBoth,
    ])
  })

  it('turns every line with Flip all, from the keyboard, and every line back once all are turned', async () => {
    const user = userEvent.setup()
    draw()
    await user.click(screen.getByRole('button', { name: TWO.object }))
    flipAll().focus()
    await user.keyboard('{Enter}')
    expect(flipAll().getAttribute('aria-pressed')).toBe('true')
    expect(linesShowing(true).map((button) => button.getAttribute('aria-describedby'))).toEqual(
      Array(3).fill('fake_to-object'),
    )
    for (const line of LINES) {
      expect(screen.getByRole('button', { name: line.subject, pressed: true })).toBeTruthy()
    }
    await user.keyboard(' ')
    expect(flipAll().getAttribute('aria-pressed')).toBe('false')
    expect(linesShowing(true)).toEqual([])
    for (const line of LINES) {
      expect(screen.getByRole('button', { name: line.object, pressed: false })).toBeTruthy()
    }
  })

  it('says all are turned when the reader has turned each by hand', async () => {
    const user = userEvent.setup()
    draw()
    for (const line of LINES) await user.click(screen.getByRole('button', { name: line.object }))
    expect(flipAll().getAttribute('aria-pressed')).toBe('true')
    await user.click(screen.getByRole('button', { name: THREE.subject }))
    expect(flipAll().getAttribute('aria-pressed')).toBe('false')
  })

  it('opens the plain table with Show both: the view without JavaScript and on paper', async () => {
    const user = userEvent.setup()
    const { container } = draw()
    const link = screen.getByRole('link', { name: FLIP_COPY.showBoth })
    expect(link.getAttribute('href')).toBe('#fake_both')
    const both = document.getElementById('fake_both') as HTMLElement
    expect(both.className).toBe(styles.both)
    expect(
      within(both)
        .getAllByRole('rowheader')
        .map((cell) => cell.textContent),
    ).toEqual(LINES.map((line) => line.object))
    // The table stands apart from the lines, so the stylesheet can show it alone.
    const lines = container.getElementsByClassName(styles.flip ?? '').item(0)
    expect(lines?.contains(both)).toBe(false)
    expect(both.hasAttribute('data-shown')).toBe(false)
    link.focus()
    await user.keyboard('{Enter}')
    expect(both.hasAttribute('data-shown')).toBe(true)
  })

  it('turns at once under reduced motion: nothing waits on a timer or a transition', () => {
    prefersReducedMotion(true)
    vi.useFakeTimers()
    draw()
    fireEvent.click(flipAll())
    expect(linesShowing(true)).toHaveLength(LINES.length)
    expect(linesShowing(false)).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })
})
