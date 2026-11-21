/**
 * India Standard Time, in which the platform shows every time (CLAUDE.md #8): times are stored
 * in UTC and turned into IST only where a person reads them, or where a rule is set in IST (the
 * quiet hours, the day an analytics session belongs to). India keeps no daylight saving, so the
 * offset never moves; the browser's own time-zone data does the arithmetic all the same.
 */
export const IST = 'Asia/Kolkata'

/**
 * A date field's time-zone setting in Payload: stored in UTC, picked and shown in IST in the
 * admin whatever the browser's own zone, as the audit log does (src/collections/AuditLog.ts).
 */
export const IST_FIELD = {
  defaultTimezone: IST,
  supportedTimezones: [{ label: 'India Standard Time', value: IST }],
}

const DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: IST,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const CLOCK = new Intl.DateTimeFormat('en-GB', {
  timeZone: IST,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const LONG_DATE = new Intl.DateTimeFormat('en-GB', {
  timeZone: IST,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** The calendar day in India, as YYYY-MM-DD. */
export function istDay(instant: Date): string {
  return DAY.format(instant)
}

/** Minutes since midnight in India, from 0 to 1439. */
export function istMinutes(instant: Date): number {
  const parts = CLOCK.formatToParts(instant)
  const read = (type: 'hour' | 'minute') => Number(parts.find((part) => part.type === type)?.value)
  return read('hour') * 60 + read('minute')
}

/** A date as src/brand/VOICE.md writes it, in India: 30 October 2026. */
export function formatIstDate(instant: Date): string {
  return LONG_DATE.format(instant)
}
