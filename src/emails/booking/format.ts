import { formatIstDate, formatIstTime, IST } from '@/lib/time/ist'

/**
 * How the booking messages write dates, times and money (src/brand/VOICE.md, "Spelling, numbers
 * and dates"), always in India's time. Pure.
 */

const WEEKDAY = new Intl.DateTimeFormat('en-IN', { timeZone: IST, weekday: 'long' })
const DAY_MONTH = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST,
  day: 'numeric',
  month: 'long',
})

/** Friday, 6 November 2026. */
export function longDay(instant: Date): string {
  return `${WEEKDAY.format(instant)}, ${formatIstDate(instant)}`
}

/** Friday, 6 November (VOICE.md's subject lines). */
export function shortDay(instant: Date): string {
  return `${WEEKDAY.format(instant)}, ${DAY_MONTH.format(instant)}`
}

/** A day in India given as YYYY-MM-DD (a time request's days), as Friday, 6 November 2026. */
export function longIstDay(day: string): string {
  return longDay(new Date(`${day}T12:00:00+05:30`))
}

/** 3 PM, or 3 PM – 3:45 PM when the end is known. */
export function timeSpan(startsAt: Date, endsAt?: Date | null): string {
  const start = formatIstTime(startsAt)
  return endsAt ? `${start} – ${formatIstTime(endsAt)}` : start
}

const GROUPED = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const GROUPED_PAISE = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * An amount in paise as rupees with Indian grouping: ₹1,500 for a whole number of rupees, and
 * ₹1,500.50 only when there are paise (VOICE.md: prices without decimals). The person's own
 * payment, a payment link or a refund only (D-24); never a price while prices are hidden.
 */
export function rupees(paise: number): string {
  const whole = paise % 100 === 0
  return `₹${(whole ? GROUPED : GROUPED_PAISE).format(paise / 100)}`
}

/** An amount on a tax document: always two decimals (VOICE.md: invoices show two decimals). */
export function rupeesExact(paise: number): string {
  return `₹${GROUPED_PAISE.format(paise / 100)}`
}

/** The first word of a full name, for the greeting (VOICE.md: WhatsApp starts with it). */
export function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName.trim()
}
