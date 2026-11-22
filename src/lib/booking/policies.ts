import { differenceInMilliseconds, subHours } from 'date-fns'

import { BOOKING_MOVES, type BookingStatus } from './states'
import type {
  BookingRules,
  CanClientReschedule,
  ClientChange,
  RefundForCancellation,
  RefundStep,
  ResolveRules,
} from './types'

/**
 * The booking rules and the policies that read them (docs/16 §6; D-16; docs/03 F4), pure. No
 * rule is written here: notice, horizon, buffer and hold come from the service or the defaults
 * in Settings, and the reschedule window and the refund steps from the service, both empty until
 * IIIC settles D-16 (I-07). While they are empty, a client who has paid is sent to IIIC and
 * nothing is refunded automatically, except when IIIC cancels (in full) and the platform's own
 * refund of a slot lost in a race (B10, the payments module's).
 */

/** The rules without which no time is offered (the rest may stay unset). */
const REQUIRED = ['noticeHours', 'horizonDays', 'bufferMinutes', 'holdMinutes'] as const

type RuleValues = Partial<Record<keyof BookingRules, unknown>>

const wholeOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null

function refundStepsOf(value: unknown): RefundStep[] | null {
  if (!Array.isArray(value)) return null
  const steps = value.flatMap((entry: unknown) => {
    const step = entry as { hoursBefore?: unknown; refundPercent?: unknown } | null
    const hoursBefore = wholeOrNull(step?.hoursBefore)
    const refundPercent = wholeOrNull(step?.refundPercent)
    return hoursBefore === null || refundPercent === null || refundPercent > 100
      ? []
      : [{ hoursBefore, refundPercent }]
  })
  return steps.length ? steps.sort((a, b) => b.hoursBefore - a.hoursBefore) : null
}

export const resolveRules: ResolveRules = (service, defaults) => {
  const pick = (key: keyof BookingRules) =>
    wholeOrNull(service?.[key]) ?? wholeOrNull(defaults?.[key])
  const missing = REQUIRED.filter((key) => pick(key) === null)
  if (missing.length) return { ok: false, error: { code: 'rule-missing', rules: missing } }
  return {
    ok: true,
    value: {
      noticeHours: pick('noticeHours') as number,
      horizonDays: pick('horizonDays') as number,
      bufferMinutes: pick('bufferMinutes') as number,
      holdMinutes: pick('holdMinutes') as number,
      rescheduleWindowHours: pick('rescheduleWindowHours'),
      refundSteps:
        refundStepsOf(service?.refundSteps) ?? refundStepsOf(defaults?.refundSteps) ?? [],
    },
  }
}

/** A service's booking rules as the admin stores them (src/collections/Services.ts). */
export function rulesFromService(bookingRules: unknown): RuleValues {
  if (!bookingRules || typeof bookingRules !== 'object') return {}
  const { refunds, ...rest } = bookingRules as Record<string, unknown> & { refunds?: unknown }
  const own: Record<string, unknown> = {}
  for (const key of [...REQUIRED, 'rescheduleWindowHours'] as const) {
    if (key in rest) own[key] = rest[key]
  }
  if (Array.isArray(refunds)) {
    own.refundSteps = refunds.map((step: { hoursBefore?: unknown; refundPercent?: unknown }) => ({
      hoursBefore: step?.hoursBefore,
      refundPercent: step?.refundPercent,
    }))
  }
  return own
}

/** The booking defaults in Settings (src/globals/Settings.ts, Bookings and messages). */
export function rulesFromSettings(settings: unknown): RuleValues {
  const booking = (settings as { booking?: Record<string, unknown> | null } | null | undefined)
    ?.booking
  if (!booking || typeof booking !== 'object') return {}
  const own: Record<string, unknown> = {}
  for (const key of [...REQUIRED, 'rescheduleWindowHours'] as const) {
    if (key in booking) own[key] = booking[key]
  }
  return own
}

/** Whether the table of moves allows a booking to go from one state to another. */
export function canMove(from: string, to: string): boolean {
  const targets = (BOOKING_MOVES as Partial<Record<string, readonly BookingStatus[]>>)[from]
  return Boolean(targets?.includes(to as BookingStatus))
}

export const canClientReschedule: CanClientReschedule = ({
  now,
  startsAt,
  rescheduleWindowHours,
  status,
}) => {
  if (status !== 'confirmed') return { allowed: false, reason: 'not-active' }
  if (now >= startsAt) return { allowed: false, reason: 'started' }
  if (rescheduleWindowHours === null) return { allowed: false, reason: 'no-policy' }
  if (now > subHours(startsAt, rescheduleWindowHours)) {
    return { allowed: false, reason: 'outside-window' }
  }
  return { allowed: true }
}

/** The states a client may still leave by cancelling. */
const CLIENT_CANCELLABLE: readonly string[] = ['requested', 'held', 'pendingPayment', 'confirmed']

/**
 * Whether a client may cancel a booking themselves (F4): before it starts, and, once they have
 * paid, only under a refund rule (D-16): while none is set, they are sent to IIIC, who decide the
 * refund. Nothing paid means nothing to decide, so a free or unpaid booking can always be
 * cancelled before its start, which frees the time for someone else (proposed in docs/16 §6).
 */
export function canClientCancel(input: {
  now: Date
  startsAt: Date | null
  status: string
  paidPaise: number
  steps: readonly RefundStep[]
}): ClientChange {
  if (!CLIENT_CANCELLABLE.includes(input.status)) return { allowed: false, reason: 'not-active' }
  if (input.startsAt && input.now >= input.startsAt) return { allowed: false, reason: 'started' }
  if (input.paidPaise > 0 && input.steps.length === 0) {
    return { allowed: false, reason: 'no-policy' }
  }
  return { allowed: true }
}

function assertPaise(paise: number) {
  if (!Number.isInteger(paise) || paise < 0) {
    throw new RangeError('An amount is a whole, non-negative number of paise.')
  }
}

/** A share of an amount, rounded half up to the paise (docs/16 §10, for the CA to confirm). */
function share(paise: number, percent: number): number {
  return Math.floor((paise * percent + 50) / 100)
}

export const refundForCancellation: RefundForCancellation = ({
  now,
  startsAt,
  paidPaise,
  steps,
  by,
}) => {
  assertPaise(paidPaise)
  if (paidPaise === 0) return { refundPaise: 0, step: null }
  // IIIC's own cancellation refunds everything paid (docs/08 §4; D-16's symmetry).
  if (by === 'iiic') return { refundPaise: paidPaise, step: null }
  const noticeMs = differenceInMilliseconds(startsAt, now)
  if (noticeMs <= 0) return { refundPaise: 0, step: null }
  const met = [...steps]
    .sort((a, b) => b.hoursBefore - a.hoursBefore)
    .find((step) => noticeMs >= step.hoursBefore * 3_600_000)
  if (!met) return { refundPaise: 0, step: null }
  return { refundPaise: Math.min(paidPaise, share(paidPaise, met.refundPercent)), step: met }
}
