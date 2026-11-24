import { type CollectionBeforeChangeHook, ValidationError } from 'payload'

import { IST } from '@/lib/time/ist'

import { incidentClocks } from './breachClocks'
import { deadlinesFor } from './deadlines'
import { MOVE_MESSAGES, refusedMove, type RequestState } from './requestMoves'
import type { RequestType } from './requests'

/**
 * The privacy collections' own rules on every save (docs/18 §5), attached by
 * src/plugins/notesAndPrivacy.ts. Not `server-only`: the Payload config loads them outside
 * Next.js too (migrations, type generation). None reads a secret.
 */

/** Set by the owner's Confirm erasure (src/lib/privacy/erasure.ts), the one way an erasure closes. */
export const ERASURE_CONTEXT = 'privacyErasure'

type Data = Record<string, unknown>

const instant = (value: unknown): Date | null => {
  if (typeof value !== 'string' && !(value instanceof Date)) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const sameInstant = (a: unknown, b: unknown) => instant(a)?.getTime() === instant(b)?.getTime()

const group = (value: unknown): Data =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Data) : {}

const refuse = (path: string, message: string, collection = 'data-requests'): never => {
  throw new ValidationError({ collection, errors: [{ path, message }] })
}

/**
 * How far ahead of the server's clock a typed time may be (a slow device's clock). The time a
 * request was received, or an incident noticed, sets deadlines that no role may write, so it can
 * never lie in the future: a time ahead would push those deadlines back.
 */
export const AHEAD_LEEWAY_MS = 5 * 60 * 1000

export const TIME_AHEAD = 'Enter a time that has already passed: the deadlines are counted from it.'

const ahead = (value: unknown) => {
  const at = instant(value)
  return at !== null && at.getTime() > Date.now() + AHEAD_LEEWAY_MS
}

/**
 * A privacy request: recorded as received, with its two clocks set from its kind and the time it
 * reached IIIC (src/lib/privacy/deadlines.ts). The clocks never move (docs/18 §5), so the kind and
 * the time received are fixed once recorded. Every change of state is checked against the moves
 * (src/lib/privacy/requestMoves.ts), and the times of acknowledgement and closing are filled in
 * when the move is made without one.
 */
export const requestRules: CollectionBeforeChangeHook = ({
  context,
  data,
  operation,
  originalDoc,
}) => {
  if (!data) return data
  const draft = data as Data
  const before = (originalDoc ?? {}) as Data
  const merged = { ...before, ...draft }
  const now = new Date().toISOString()

  if (operation === 'create') {
    draft.status = 'received'
    if (ahead(draft.receivedAt)) refuse('receivedAt', TIME_AHEAD)
    const received = instant(draft.receivedAt)
    if (received && typeof draft.type === 'string') {
      const { acknowledgeBy, resolveBy } = deadlinesFor(draft.type as RequestType, received)
      draft.acknowledgeBy = acknowledgeBy.toISOString()
      draft.acknowledgeBy_tz = IST
      draft.resolveBy = resolveBy.toISOString()
      draft.resolveBy_tz = IST
    }
    return draft
  }

  if (operation !== 'update') return draft
  if (merged.type !== before.type) refuse('type', MOVE_MESSAGES.fixed)
  if (!sameInstant(merged.receivedAt, before.receivedAt)) refuse('receivedAt', MOVE_MESSAGES.fixed)
  const to = merged.status
  if (to === before.status) return draft
  const resolution = { ...group(before.resolution), ...group(draft.resolution) }
  if (to === 'acknowledged' && !merged.acknowledgedAt) {
    draft.acknowledgedAt = now
    draft.acknowledgedAt_tz = IST
  }
  const refusal = refusedMove(before as RequestState, { ...merged, resolution } as RequestState, {
    byErasure: context?.[ERASURE_CONTEXT] === true,
  })
  if (refusal) refuse('status', refusal)
  if (to === 'closed' && !resolution.closedAt) {
    draft.resolution = { ...resolution, closedAt: now, closedAt_tz: IST }
  }
  return draft
}

/**
 * An incident: its two deadlines, CERT-In's 6 hours and the Board's 72, set from the time it was
 * detected, and worked out again only when that time is corrected (docs/18 §5).
 */
export const incidentRules: CollectionBeforeChangeHook = ({ data, operation, originalDoc }) => {
  if (!data) return data
  const draft = data as Data
  const before = (originalDoc ?? {}) as Data
  const detected = instant(draft.detectedAt ?? before.detectedAt)
  const moved =
    operation === 'create' || !sameInstant(draft.detectedAt ?? before.detectedAt, before.detectedAt)
  if (!detected || !moved) return draft
  if (ahead(detected)) refuse('detectedAt', TIME_AHEAD, 'incidents')
  const { certInBy, boardBy } = incidentClocks(detected)
  draft.certIn = {
    ...group(before.certIn),
    ...group(draft.certIn),
    dueAt: certInBy.toISOString(),
    dueAt_tz: IST,
  }
  draft.board = {
    ...group(before.board),
    ...group(draft.board),
    dueAt: boardBy.toISOString(),
    dueAt_tz: IST,
  }
  return draft
}
