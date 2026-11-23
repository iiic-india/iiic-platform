/**
 * What an editor may do to a newsletter issue (docs/19 §8; docs/06 N4), as pure functions. An
 * issue is drafted, scheduled with a time, and cancelled until it sends; only the send moves it
 * to `sending` and `sent`, and a sent issue no longer changes. Free of `server-only`, tested
 * without a database.
 */

export type IssueStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled'
export type IssueState = { status: IssueStatus; scheduledFor: string | null }

/** A minute's grace, so a time picked for "now" is not refused while the form is saved. */
const GRACE_MS = 60_000

export const ISSUE_MESSAGES = {
  sent: 'This issue has gone out and can no longer change.',
  sending: 'This issue is being sent and can no longer change.',
  sendOnly: 'An issue moves to sending and sent on its own, at its time. Schedule it instead.',
  needsTime: 'Give the time to send it.',
  past: 'Give a time from now on.',
} as const

export type IssueProblem = { path: 'status' | 'scheduledFor'; message: string }

const sameTime = (a: string | null, b: string | null) =>
  (a ? Date.parse(a) : null) === (b ? Date.parse(b) : null)

/** Why an editor's change is refused, or `null` when it may be saved. */
export function issueChangeProblem(
  before: IssueState | null,
  after: IssueState,
  now: Date,
): IssueProblem | null {
  if (before?.status === 'sent') return { path: 'status', message: ISSUE_MESSAGES.sent }
  if (before?.status === 'sending') return { path: 'status', message: ISSUE_MESSAGES.sending }
  if (after.status === 'sending' || after.status === 'sent') {
    return { path: 'status', message: ISSUE_MESSAGES.sendOnly }
  }
  if (after.status !== 'scheduled') return null
  if (!after.scheduledFor) return { path: 'scheduledFor', message: ISSUE_MESSAGES.needsTime }
  const changed =
    before?.status !== 'scheduled' || !sameTime(before.scheduledFor, after.scheduledFor)
  const at = Date.parse(after.scheduledFor)
  if (changed && (!Number.isFinite(at) || at < now.getTime() - GRACE_MS)) {
    return { path: 'scheduledFor', message: ISSUE_MESSAGES.past }
  }
  return null
}

/** Whether a saved change asks N4 to (re)plan the send: newly scheduled, or its time moved. */
export function issueNeedsSend(before: IssueState | null, after: IssueState | null): boolean {
  if (!after || after.status !== 'scheduled' || !after.scheduledFor) return false
  if (!before || before.status !== 'scheduled') return true
  return !sameTime(before.scheduledFor, after.scheduledFor)
}
