import type { IstDay } from '@/lib/booking/types'
import { istDay } from '@/lib/time/ist'

import type { AddWorkingDays } from '../tasks'

/**
 * Working days (docs/17 §4; src/lib/pipeline/tasks.ts): Monday to Friday in India, the office's
 * hours, with the holidays IIIC gives skipped like weekends. Until IIIC supplies its holidays
 * (I-52) the list is empty. Pure, and free of `server-only`: the collections' hooks use it.
 */

/** The holidays the office keeps, as India days. None until IIIC gives them (I-52). */
export const OFFICE_HOLIDAYS: readonly IstDay[] = []

/** An India day as a date at noon UTC, so adding days never crosses a day boundary. */
function noonOf(day: IstDay): Date {
  return new Date(`${day}T12:00:00Z`)
}

function dayOf(noon: Date): IstDay {
  return noon.toISOString().slice(0, 10)
}

/** Whether an India day is a working day: not a Saturday, a Sunday or a holiday. */
export function isWorkingDay(day: IstDay, holidays: readonly IstDay[] = OFFICE_HOLIDAYS): boolean {
  const weekday = noonOf(day).getUTCDay()
  return weekday !== 0 && weekday !== 6 && !holidays.includes(day)
}

/**
 * The day `days` working days after `from`, in India: counted from the day after `from`'s day,
 * whatever the hour, so from a Friday evening two working days is Tuesday, and from a Monday
 * morning it is Wednesday. Zero days is `from`'s own day.
 */
export const addWorkingDays: AddWorkingDays = (from, days, holidays = OFFICE_HOLIDAYS) => {
  const whole = Math.max(0, Math.floor(days))
  const cursor = noonOf(istDay(from))
  let counted = 0
  while (counted < whole) {
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    if (isWorkingDay(dayOf(cursor), holidays)) counted += 1
  }
  return dayOf(cursor)
}
