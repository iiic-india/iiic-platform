import { TZDate } from '@date-fns/tz'
import { addDays, addHours, addMinutes, format, getISODay, isValid, parse } from 'date-fns'

import { WEEKDAYS, type Weekday } from '@/fields/workingSpans'
import { IST } from '@/lib/time/ist'

import type {
  ClockSpan,
  DayException,
  GenerateSlots,
  Interval,
  IstDay,
  SlotDay,
  SlotQuery,
  WeeklyHours,
} from './types'

/**
 * The slot engine (docs/16 §6; docs/03 F3, "Free times"; D-02): pure, no database, no clock of
 * its own. Instants are UTC `Date`s inside; working hours, exceptions and the days the answer is
 * grouped by are India time, and every turn from one to the other goes through @date-fns/tz in
 * Asia/Kolkata, never a hand-made offset (CLAUDE.md #8).
 *
 * The rule: start times run from the start of each working span, every `duration + buffer`; a
 * start is offered when [start, start + duration + buffer) fits inside the span, starts at or
 * after now + notice, falls on or before the horizon's last day (today in India plus the horizon's
 * days), and meets nothing taken. Each taken time keeps the buffer after it too (a gap after a
 * session, docs/04), so two sessions are always a buffer apart whichever was booked first and
 * whatever their lengths; ranges are half-open, as in the database's guard (docs/16 §4).
 */

/** A reference instant in India: parsing against it gives TZDates in Asia/Kolkata. */
const IN_INDIA = new TZDate(0, IST)

/** The instant a day and a time of day in India name ('2026-12-07', '10:00'). */
export function atIst(day: IstDay, clock: string): Date {
  const instant = parse(`${day} ${clock}`, 'yyyy-MM-dd HH:mm', IN_INDIA)
  if (!isValid(instant)) throw new RangeError('Not a day as YYYY-MM-DD and a time as HH:MM.')
  return new Date(instant.getTime())
}

/** The day in India an instant falls on, as YYYY-MM-DD. */
export function istDayOf(instant: Date): IstDay {
  return format(new TZDate(instant, IST), 'yyyy-MM-dd')
}

function dayStart(day: IstDay): TZDate {
  const start = parse(day, 'yyyy-MM-dd', IN_INDIA)
  if (!isValid(start)) throw new RangeError('Not a day as YYYY-MM-DD.')
  return start
}

/** The day after a day in India. */
export function nextIstDay(day: IstDay): IstDay {
  return format(addDays(dayStart(day), 1), 'yyyy-MM-dd')
}

/** The day of the week a day in India is, as working hours name it. */
export function weekdayOf(day: IstDay): Weekday {
  // ISO days run 1 (Monday) to 7 (Sunday), as WEEKDAYS does.
  return (WEEKDAYS[getISODay(dayStart(day)) - 1] as (typeof WEEKDAYS)[number]).value
}

/** The last day the horizon reaches: today in India plus the horizon's days. */
export function horizonLastDay(now: Date, horizonDays: number): IstDay {
  return format(addDays(new TZDate(now, IST), horizonDays), 'yyyy-MM-dd')
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end
}

/**
 * The working spans of one day: an exception's, if the day has one (closed is none), else the
 * hours valid on the day. When two sets of hours are valid on one day, the one that started last
 * holds (new hours replace the old from their first day); sets that start the same day add up.
 */
export function spansOn(
  day: IstDay,
  hours: readonly WeeklyHours[],
  exceptions: readonly DayException[],
): readonly ClockSpan[] {
  const exception = exceptions.find((entry) => entry.day === day)
  if (exception) return exception.kind === 'closed' ? [] : exception.spans
  const weekday = weekdayOf(day)
  // Days as YYYY-MM-DD compare as text.
  const valid = hours.filter(
    (entry) =>
      entry.weekday === weekday &&
      entry.validFrom <= day &&
      (entry.validTo === null || entry.validTo === undefined || day <= entry.validTo),
  )
  const newest = valid.reduce<string | null>(
    (latest, entry) => (latest === null || entry.validFrom > latest ? entry.validFrom : latest),
    null,
  )
  return valid.filter((entry) => entry.validFrom === newest).flatMap((entry) => entry.spans)
}

const isWholePositive = (value: number) => Number.isInteger(value) && value > 0
const isWhole = (value: number) => Number.isInteger(value) && value >= 0

export const generateSlots: GenerateSlots = (query: SlotQuery): readonly SlotDay[] => {
  const { now, durationMinutes, rules } = query
  const { noticeHours, horizonDays, bufferMinutes } = rules
  if (
    !isWholePositive(durationMinutes) ||
    !isWhole(noticeHours) ||
    !isWhole(horizonDays) ||
    !isWhole(bufferMinutes)
  ) {
    return []
  }
  const step = durationMinutes + bufferMinutes
  const earliest = addHours(now, noticeHours)
  const lastDay = horizonLastDay(now, horizonDays)
  // The gap after each taken time is kept free as well.
  const blocked = query.taken.map((taken) => ({
    start: taken.start,
    end: addMinutes(taken.end, bufferMinutes),
  }))

  const days: SlotDay[] = []
  for (let day = istDayOf(now); day <= lastDay; day = nextIstDay(day)) {
    const starts = new Map<number, Date>()
    for (const span of spansOn(day, query.hours, query.exceptions)) {
      const spanEnd = atIst(day, span.end)
      for (
        let start = atIst(day, span.start);
        addMinutes(start, step) <= spanEnd;
        start = addMinutes(start, step)
      ) {
        if (start < earliest) continue
        const wanted = { start, end: addMinutes(start, step) }
        if (blocked.some((taken) => overlaps(wanted, taken))) continue
        starts.set(start.getTime(), new Date(start.getTime()))
      }
    }
    if (starts.size) {
      days.push({ day, starts: [...starts.values()].sort((a, b) => a.getTime() - b.getTime()) })
    }
  }
  return days
}

/** Whether a start is one the engine offers. */
export function isOffered(days: readonly SlotDay[], start: Date): boolean {
  const day = istDayOf(start)
  return Boolean(
    days.find((entry) => entry.day === day)?.starts.some((s) => s.getTime() === start.getTime()),
  )
}
