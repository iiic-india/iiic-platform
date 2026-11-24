import type { ReminderStep } from '@/emails/other/privacy'

/**
 * When a privacy request's reminders go to staff (docs/06 O4, O7). Pure.
 *
 * O4: at 50% and 80% of the time from receipt to the resolve-by deadline.
 * O7: 24 hours before each mark: the 48-hour acknowledgement (so 24 hours after receipt) and the
 * one-month resolution (docs/06: "at 24 h and before each deadline"; the offset before the month's
 * mark is proposed, docs/19 §10).
 * Each reminder is useless from its deadline on (`before`).
 */
export const BEFORE_DEADLINE_MS = 24 * 3_600_000

export function reminderTimes(
  automation: 'O4' | 'O7',
  clocks: { received: Date; acknowledgeBy: Date; resolveBy: Date },
): { step: ReminderStep; at: Date; before: Date }[] {
  const { received, acknowledgeBy, resolveBy } = clocks
  if (automation === 'O4') {
    const span = resolveBy.getTime() - received.getTime()
    return [
      { step: 'p50', at: new Date(received.getTime() + span * 0.5), before: resolveBy },
      { step: 'p80', at: new Date(received.getTime() + span * 0.8), before: resolveBy },
    ]
  }
  return [
    {
      step: 'acknowledge',
      at: new Date(acknowledgeBy.getTime() - BEFORE_DEADLINE_MS),
      before: acknowledgeBy,
    },
    { step: 'resolve', at: new Date(resolveBy.getTime() - BEFORE_DEADLINE_MS), before: resolveBy },
  ]
}
