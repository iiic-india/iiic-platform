import { type CollectionBeforeChangeHook, ValidationError } from 'payload'

import { IST } from '@/lib/time/ist'

import { incidentClocks } from './breachClocks'
import { deadlinesFor } from './deadlines'
import { refusedMove, type RequestState } from './requestMoves'
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

/**
 * A privacy request: recorded as received, with its two clocks set from its kind and the time it
 * reached IIIC (src/lib/privacy/deadlines.ts); the clocks are worked out again only when one of
 * those two is corrected, and the audit log names that change. Every change of state is checked
 * against the moves (src/lib/privacy/requestMoves.ts), and the times of acknowledgement,
 * verification and closing are filled in when the move is made without one.
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

  if (operation === 'create') draft.status = 'received'

  const received = instant(merged.receivedAt)
  const clocksMove =
    operation === 'create' ||
    draft.type !== before.type ||
    !sameInstant(merged.receivedAt, before.receivedAt)
  if (received && typeof merged.type === 'string' && clocksMove) {
    const { acknowledgeBy, resolveBy } = deadlinesFor(merged.type as RequestType, received)
    draft.acknowledgeBy = acknowledgeBy.toISOString()
    draft.acknowledgeBy_tz = IST
    draft.resolveBy = resolveBy.toISOString()
    draft.resolveBy_tz = IST
  }

  if (operation !== 'update') return draft
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
  if (refusal) {
    throw new ValidationError({
      collection: 'data-requests',
      errors: [{ path: 'status', message: refusal }],
    })
  }
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
