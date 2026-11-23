import { formatIstDate, formatIstTime, IST } from '@/lib/time/ist'

/**
 * Days and times as the booking flow writes them, in India time (CLAUDE.md #8; VOICE.md: "Friday,
 * 6 November", "10 AM"). Safe for the browser: Intl only.
 */

const WEEKDAY = new Intl.DateTimeFormat('en-GB', { timeZone: IST, weekday: 'long' })
const SHORT = new Intl.DateTimeFormat('en-GB', {
  timeZone: IST,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { timeZone: IST, day: 'numeric', month: 'long' })

/** Noon in India on a day given as YYYY-MM-DD: a safe instant to name the day by. */
export function noonOn(day: string): Date {
  return new Date(`${day}T12:00:00+05:30`)
}

/** The parts of a day for the date strip: "Tue", "3", "Nov". */
export function dayParts(day: string): { weekday: string; date: string; month: string } {
  const parts = SHORT.formatToParts(noonOn(day))
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return { weekday: read('weekday'), date: read('day'), month: read('month') }
}

/** A day in full: "Friday, 6 November". */
export function dayLong(day: string): string {
  const noon = noonOn(day)
  return `${WEEKDAY.format(noon)}, ${DAY_MONTH.format(noon)}`
}

/** A time: "10 AM", "3:30 PM". */
export function timeOf(iso: string): string {
  return formatIstTime(new Date(iso))
}

/** A start in full: "Friday, 6 November 2026, 10 AM". */
export function whenOf(iso: string): string {
  const instant = new Date(iso)
  return `${WEEKDAY.format(instant)}, ${formatIstDate(instant)}, ${formatIstTime(instant)}`
}
