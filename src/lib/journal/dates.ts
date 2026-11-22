/**
 * A date as the site writes it: "30 October 2026" (VOICE.md, "Spelling, numbers and dates"),
 * on the calendar of Asia/Kolkata whatever the server's zone (CLAUDE.md #8: stored in UTC,
 * shown in India's time). Null for a value that is not a date.
 */
const DAY = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Kolkata',
})

export function formatDate(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : DAY.format(date)
}
