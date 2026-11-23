import type { MessageStatus } from './types'

/**
 * The moves a message may make (docs/19 §3). The core moves a message only along this table, with
 * a conditional update (`where status = from`), so two runners never both send one message and a
 * late provider report never moves a message back. Pure: tests hold it to the design.
 */
export const MESSAGE_MOVES: Readonly<Record<MessageStatus, readonly MessageStatus[]>> = {
  // Waiting for its time; deferral by quiet hours keeps it queued with a later sendAt.
  queued: ['queued', 'sending', 'skipped', 'cancelled'],
  // Claimed by one runner: the provider took it, refused it, or the answer never came.
  sending: ['sent', 'failed', 'queued', 'unknown', 'skipped'],
  // The provider's later reports.
  sent: ['delivered', 'read', 'bounced', 'complained', 'failed'],
  delivered: ['read', 'bounced', 'complained'],
  read: ['complained'],
  // Staff may queue a failed or unknown message once more from the log (docs/05, Messages).
  failed: ['queued'],
  unknown: ['queued'],
  bounced: [],
  complained: [],
  skipped: [],
  cancelled: [],
}

/** Whether a message may move from one status to another. */
export function canMove(from: MessageStatus, to: MessageStatus): boolean {
  return MESSAGE_MOVES[from].includes(to)
}

/** Statuses from which nothing more happens unless staff act. */
export const FINAL_STATUSES: readonly MessageStatus[] = [
  'failed',
  'bounced',
  'complained',
  'skipped',
  'cancelled',
  'unknown',
]

/** Statuses a re-plan (a reschedule, a cancellation) may still cancel. */
export const CANCELLABLE_STATUSES: readonly MessageStatus[] = ['queued']

/**
 * docs/06, Engine rules: three retries with backoff of 1 minute, 10 minutes and 1 hour after the
 * first try, then the message fails visibly (Today, the log, O3). Read as: four tries at most.
 */
export const RETRY_DELAYS_MS = [60_000, 600_000, 3_600_000] as const
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1

/**
 * When to try again after a retryable failure, or null when the tries are spent. `attempts`
 * counts the tries already made, the one that just failed included.
 */
export function nextAttemptAt(attempts: number, now: Date): Date | null {
  if (!Number.isInteger(attempts) || attempts < 1) return null
  const delay = RETRY_DELAYS_MS[attempts - 1]
  return delay === undefined ? null : new Date(now.getTime() + delay)
}

/**
 * A message claimed for sending this long ago with no answer is `unknown`: the function that
 * held it has ended (Vercel's limit is 60 s here), and resending could send it twice.
 */
export const SENDING_STALE_AFTER_MS = 5 * 60_000
