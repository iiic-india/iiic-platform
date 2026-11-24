/**
 * The timing rules of docs/06, as pure functions (docs/19 §6): when each timed message is due,
 * before quiet hours are applied (src/lib/messaging/policy.ts `plannedSendTime`). The offsets are
 * docs/06's; making them settings is proposed (docs/19 §10), not built.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export const OFFSETS = {
  /** B5: 24 hours before; skipped if booked less than 24 hours ahead. */
  reminder24h: DAY,
  /** B6: 2 hours before an in-person session, 30 minutes before an online one. */
  reminderShortInPerson: 2 * HOUR,
  reminderShortOnline: 30 * MINUTE,
  /** B8: 2 hours after the session is marked completed. */
  feedbackAfterCompleted: 2 * HOUR,
  /** B9: 1 hour after the session is marked no-show. */
  noShowAfterMarked: HOUR,
  /** V1: one reminder 5 days after the request, if there is no reply. */
  reviewConsentReminder: 5 * DAY,
  /** B13: the payment link's one reminder, 24 hours before the session (assumed, docs/19 §10). */
  paymentLinkReminder: DAY,
} as const

export type ReminderInput = {
  startsAt: Date
  /** When the booking was confirmed: B5 is skipped when that was less than 24 h before. */
  confirmedAt: Date
  format: 'online' | 'office'
  now: Date
}

/** B5's due time, or null when it does not apply (booked late, or its time has passed). */
export function reminder24hAt({ startsAt, confirmedAt, now }: ReminderInput): Date | null {
  const due = new Date(startsAt.getTime() - OFFSETS.reminder24h)
  if (confirmedAt.getTime() > due.getTime()) return null
  if (due.getTime() <= now.getTime()) return null
  return due
}

/** B6's due time, or null when it has passed. */
export function reminderShortAt({ startsAt, format, now }: ReminderInput): Date | null {
  const offset = format === 'online' ? OFFSETS.reminderShortOnline : OFFSETS.reminderShortInPerson
  const due = new Date(startsAt.getTime() - offset)
  return due.getTime() <= now.getTime() ? null : due
}

/** A time a given span after another (B8, B9, V1). */
export function after(at: Date, span: number): Date {
  return new Date(at.getTime() + span)
}
