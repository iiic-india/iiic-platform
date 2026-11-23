import type { RequestStatus, RequestType } from './requests'

/**
 * The moves of a privacy request (docs/05, Privacy; docs/08 §3, §4; docs/18 §5), checked on every
 * save, from the Payload form or the privacy module alike (src/lib/privacy/hooks.ts). Pure.
 *
 * received → acknowledged → verified → preparing → closed with an outcome. An erasure goes from
 * preparing to an owner (awaitingOwner), who confirms it (src/lib/privacy/erasure.ts) or sends it
 * back; only that confirmation closes an erasure as done. A withdrawal or a correction may close
 * from verified. Any open request may close as refused (with the reason) or as withdrawn by the
 * person. A closed request stays closed.
 */

export type RequestState = {
  type: RequestType
  status: RequestStatus
  verifiedAt?: string | null
  verificationMethod?: string | null
  resolution?: { outcome?: string | null; note?: string | null } | null
}

/** The kinds that may close straight after the identity check. */
const CLOSE_FROM_VERIFIED: readonly RequestType[] = ['withdrawal', 'correction']

/** Where each state may go next, besides closing (checked below). */
const NEXT: Record<RequestStatus, readonly RequestStatus[]> = {
  received: ['acknowledged'],
  acknowledged: ['verified'],
  verified: ['preparing'],
  preparing: ['awaitingOwner'],
  awaitingOwner: ['preparing'],
  closed: [],
}

const LABEL: Record<RequestStatus, string> = {
  received: 'received',
  acknowledged: 'acknowledged',
  verified: 'identity verified',
  preparing: 'being prepared',
  awaitingOwner: 'waiting for an owner',
  closed: 'closed',
}

/** The words the form shows when a move is refused (src/brand/VOICE.md: errors say what to do). */
export const MOVE_MESSAGES = {
  closedStays: 'A closed request stays closed. Record a new request if the person asks again.',
  fixed:
    'The kind and the time received set the deadlines, so they cannot change once recorded. If one is wrong, close this request as refused with the note “Recorded in error” and record it again.',
  outcome: 'Choose how the request ended before you close it.',
  reason: 'Write what was done, or why not, before you close it with this outcome.',
  erasureByOwner:
    'An erasure is closed by an owner’s Confirm erasure, after they read what it deletes.',
  notReady: 'Prepare the request first, then close it.',
  verifyFirst: 'Record how the identity was checked before you mark it verified.',
  awaitingOwnerErasureOnly: 'Only an erasure waits for an owner.',
  move: (from: RequestStatus, to: RequestStatus) =>
    `A request cannot go from “${LABEL[from]}” to “${LABEL[to]}”.`,
} as const

/** Why the request may not make this move, or null when it may. */
export function refusedMove(
  before: RequestState,
  after: RequestState,
  { byErasure = false }: { byErasure?: boolean } = {},
): string | null {
  const from = before.status
  const to = after.status
  if (from === to) return null
  if (from === 'closed') return MOVE_MESSAGES.closedStays
  if (to === 'closed') {
    const outcome = after.resolution?.outcome
    if (!outcome) return MOVE_MESSAGES.outcome
    if ((outcome === 'refused' || outcome === 'partly') && !after.resolution?.note?.trim()) {
      return MOVE_MESSAGES.reason
    }
    if (outcome === 'refused' || outcome === 'withdrawn') return null
    if (after.type === 'erasure') {
      return byErasure && from === 'awaitingOwner' ? null : MOVE_MESSAGES.erasureByOwner
    }
    if (from === 'preparing') return null
    if (from === 'verified' && CLOSE_FROM_VERIFIED.includes(after.type)) return null
    return MOVE_MESSAGES.notReady
  }
  if (!NEXT[from].includes(to)) return MOVE_MESSAGES.move(from, to)
  if (to === 'verified' && !(after.verifiedAt && after.verificationMethod)) {
    return MOVE_MESSAGES.verifyFirst
  }
  if (to === 'awaitingOwner' && after.type !== 'erasure')
    return MOVE_MESSAGES.awaitingOwnerErasureOnly
  return null
}
