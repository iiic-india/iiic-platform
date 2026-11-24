import { describe, expect, it } from 'vitest'

import { WindowLimit } from '@/lib/newsletter/limit'

// The newsletter forms' first line against bursts (docs/19 §8; docs/12 §6).
describe('the window limit', () => {
  it('lets the first tries through, refuses the rest of the window, and opens again after it', () => {
    const limit = new WindowLimit(3, 60_000)
    expect([0, 1, 2].map((t) => limit.take('a', t))).toEqual([true, true, true])
    expect(limit.take('a', 30_000)).toBe(false)
    expect(limit.take('b', 30_000)).toBe(true)
    expect(limit.take('a', 60_000)).toBe(true)
  })

  it('stays small: old windows are cleared when the map is full', () => {
    const limit = new WindowLimit(1, 1_000, 2)
    limit.take('a', 0)
    limit.take('b', 0)
    expect(limit.take('c', 5_000)).toBe(true)
    expect(limit.take('a', 5_000)).toBe(true)
  })
})
