import { istMinutes } from '@/lib/time/ist'

/**
 * Quiet hours (docs/06, Engine rules): no WhatsApp or SMS between these times, India time. The
 * settings hold them as HH:MM, 21:00 to 08:00 by default (docs/04). The window may cross
 * midnight; a window that starts and ends at the same minute is no window at all.
 */
export type QuietHours = { start: string; end: string }

export const DEFAULT_QUIET_HOURS: QuietHours = { start: '21:00', end: '08:00' }

/** A time of day as the settings hold it: 00:00 to 23:59. */
export const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** Minutes since midnight of a time of day, or null when it is not one. */
export function minutesOf(time: unknown): number | null {
  if (typeof time !== 'string' || !CLOCK_TIME.test(time)) return null
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/** Whether a moment falls in quiet hours, read in India. */
export function inQuietHours(instant: Date, quiet: QuietHours = DEFAULT_QUIET_HOURS): boolean {
  const start = minutesOf(quiet.start) ?? minutesOf(DEFAULT_QUIET_HOURS.start)
  const end = minutesOf(quiet.end) ?? minutesOf(DEFAULT_QUIET_HOURS.end)
  if (start === null || end === null || start === end) return false
  const now = istMinutes(instant)
  return start < end ? now >= start && now < end : now >= start || now < end
}
