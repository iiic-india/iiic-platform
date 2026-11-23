/**
 * O5's periods for M6's records (docs/06 O5; docs/04; docs/19 §3, §8), as pure functions.
 * A pending newsletter signup is kept only while its link works (7 days), then a day's grace for
 * a click on the last evening; the message log is kept one year. Pure, tested.
 */
const DAY = 86_400_000

export const RETENTION_DAYS = {
  /** After its link has lapsed: the address was held only to send the confirmation. */
  pendingSignupGrace: 1,
  /** The message log (docs/19 §3: kept one year). */
  messages: 365,
} as const

export function retentionCutoffs(now: Date): { pendingSignups: Date; messages: Date } {
  return {
    pendingSignups: new Date(now.getTime() - RETENTION_DAYS.pendingSignupGrace * DAY),
    messages: new Date(now.getTime() - RETENTION_DAYS.messages * DAY),
  }
}
