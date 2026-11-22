import { TZDate } from '@date-fns/tz'
import { addDays, endOfDay } from 'date-fns'

import type { Interval } from '@/lib/booking/types'
import { IST } from '@/lib/time/ist'

/**
 * Busy times as the platform keeps them (D-22, B14; docs/16 §7): what Google's free/busy answer
 * says, clipped to the window the slot engine looks at and merged, so one stretch of busy time
 * is one row of `busy-blocks`. Pure: the refresh that reads and writes them is in sync.ts.
 */

const valid = (interval: Interval) =>
  Number.isFinite(interval.start.getTime()) &&
  Number.isFinite(interval.end.getTime()) &&
  interval.end > interval.start

/**
 * Clips each interval to the window, drops the empty, inverted and unreadable ones, and merges
 * those that overlap or touch ([10:00, 10:30) and [10:30, 11:00) become [10:00, 11:00)), earliest
 * first. Returns new intervals; the input is left as it was.
 */
export function normaliseBusy(intervals: readonly Interval[], window: Interval): Interval[] {
  const clipped = intervals
    .filter(valid)
    .map(({ start, end }) => ({
      start: new Date(Math.max(start.getTime(), window.start.getTime())),
      end: new Date(Math.min(end.getTime(), window.end.getTime())),
    }))
    .filter(valid)
    .sort((a, b) => a.start.getTime() - b.start.getTime())
  const merged: Interval[] = []
  for (const interval of clipped) {
    const last = merged.at(-1)
    if (last && interval.start <= last.end) {
      if (interval.end > last.end) last.end = interval.end
    } else {
      merged.push({ ...interval })
    }
  }
  return merged
}

/**
 * The window busy times are read for: from now to the end of the horizon's last day in India,
 * the furthest day the slot engine can offer (docs/16 §6). The day arithmetic runs in
 * Asia/Kolkata through @date-fns/tz, never with a hand-made offset (CLAUDE.md #8).
 */
export function busyWindow(now: Date, horizonDays: number): Interval {
  const lastDay = endOfDay(addDays(new TZDate(now.getTime(), IST), horizonDays))
  return { start: new Date(now.getTime()), end: new Date(lastDay.getTime()) }
}

/**
 * The longest booking horizon in force: the most days ahead any service or the settings let a
 * client book. Only positive whole numbers count; with none set, the horizon is missing and no
 * window is guessed (CLAUDE.md #1).
 */
export function longestHorizon(values: readonly unknown[]): number | null {
  const days = values.filter(
    (value): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0,
  )
  return days.length ? Math.max(...days) : null
}
