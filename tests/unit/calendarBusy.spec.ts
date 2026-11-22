// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { busyWindow, longestHorizon, normaliseBusy } from '@/lib/calendar/busy'

// Busy times as the platform keeps them (D-22, B14; docs/16 §7): Google's free/busy answer,
// clipped to the window the slot engine looks at and merged, so one stretch of busy time is one
// row. Fake times only.

const at = (iso: string) => new Date(iso)
const span = (start: string, end: string) => ({ start: at(start), end: at(end) })
const window = span('2099-01-05T00:00:00Z', '2099-01-06T00:00:00Z')

describe('normaliseBusy', () => {
  it('merges overlapping and touching blocks, earliest first', () => {
    const merged = normaliseBusy(
      [
        span('2099-01-05T10:00:00Z', '2099-01-05T11:00:00Z'),
        span('2099-01-05T04:00:00Z', '2099-01-05T05:00:00Z'),
        span('2099-01-05T10:30:00Z', '2099-01-05T12:00:00Z'),
        span('2099-01-05T12:00:00Z', '2099-01-05T12:30:00Z'),
        span('2099-01-05T04:15:00Z', '2099-01-05T04:45:00Z'),
      ],
      window,
    )
    expect(merged).toEqual([
      span('2099-01-05T04:00:00Z', '2099-01-05T05:00:00Z'),
      span('2099-01-05T10:00:00Z', '2099-01-05T12:30:00Z'),
    ])
  })

  it('keeps blocks that only come close apart', () => {
    const merged = normaliseBusy(
      [
        span('2099-01-05T10:00:00Z', '2099-01-05T11:00:00Z'),
        span('2099-01-05T11:01:00Z', '2099-01-05T12:00:00Z'),
      ],
      window,
    )
    expect(merged).toHaveLength(2)
  })

  it('clips blocks to the window and drops those outside it', () => {
    const merged = normaliseBusy(
      [
        span('2099-01-04T22:00:00Z', '2099-01-05T02:00:00Z'),
        span('2099-01-05T23:00:00Z', '2099-01-06T03:00:00Z'),
        span('2099-01-03T10:00:00Z', '2099-01-03T11:00:00Z'),
        span('2099-01-06T00:00:00Z', '2099-01-06T01:00:00Z'),
      ],
      window,
    )
    expect(merged).toEqual([
      span('2099-01-05T00:00:00Z', '2099-01-05T02:00:00Z'),
      span('2099-01-05T23:00:00Z', '2099-01-06T00:00:00Z'),
    ])
  })

  it('drops empty, inverted and unreadable blocks', () => {
    const merged = normaliseBusy(
      [
        span('2099-01-05T10:00:00Z', '2099-01-05T10:00:00Z'),
        span('2099-01-05T11:00:00Z', '2099-01-05T10:00:00Z'),
        { start: new Date('not a date'), end: at('2099-01-05T10:00:00Z') },
      ],
      window,
    )
    expect(merged).toEqual([])
  })

  it('does not change the blocks it was given', () => {
    const input = [span('2099-01-04T22:00:00Z', '2099-01-05T02:00:00Z')]
    normaliseBusy(input, window)
    expect(input[0]?.start.toISOString()).toBe('2099-01-04T22:00:00.000Z')
  })
})

describe('busyWindow', () => {
  it('runs from now to the end of the horizon’s last day in India', () => {
    // 2 December 2026, 1:30 AM in India; fourteen days on is 16 December, which ends at
    // 23:59:59.999 India time, 18:29:59.999 UTC.
    const now = at('2026-12-01T20:00:00Z')
    const { start, end } = busyWindow(now, 14)
    expect(start.toISOString()).toBe('2026-12-01T20:00:00.000Z')
    expect(end.toISOString()).toBe('2026-12-16T18:29:59.999Z')
  })

  it('covers the rest of today when the horizon is zero days', () => {
    const { end } = busyWindow(at('2026-12-01T05:00:00Z'), 0)
    expect(end.toISOString()).toBe('2026-12-01T18:29:59.999Z')
  })
})

describe('longestHorizon', () => {
  it('takes the longest horizon any service or the settings set', () => {
    expect(longestHorizon([14, null, 30, undefined, 7])).toBe(30)
  })

  it('is missing when nothing sets one, rather than guessing', () => {
    expect(longestHorizon([null, undefined, 0, -3, 2.5, '20'])).toBeNull()
  })
})
