import type { Weekday } from '@/fields/workingSpans'

/**
 * The booking module's vocabulary (docs/16-booking-and-payments-design.md §6). Times are instants
 * (`Date`, UTC inside); working hours and days are India time as the admin holds them
 * ('HH:MM', 'YYYY-MM-DD'). Turning one into the other goes through @date-fns/tz in Asia/Kolkata,
 * never through hand-made offsets (CLAUDE.md #8).
 */

/** A stretch of time, start included and end excluded: [start, end). */
export type Interval = { start: Date; end: Date }

/** A span of working time in one day, India time: '10:00' to '13:00'. */
export type ClockSpan = { start: string; end: string }

/** A calendar day in India: '2026-12-01'. */
export type IstDay = string

/** One practitioner's hours on a day of the week, from a first day until a last (docs/04). */
export type WeeklyHours = {
  weekday: Weekday
  spans: readonly ClockSpan[]
  validFrom: IstDay
  validTo?: IstDay | null
}

/** A day that differs: closed, or open at other hours (docs/04 `availability_exceptions`). */
export type DayException =
  | { day: IstDay; kind: 'closed' }
  | { day: IstDay; kind: 'customHours'; spans: readonly ClockSpan[] }

/**
 * The rules one booking runs by: the service's own where it sets one, else the default in
 * Settings (src/collections/Services.ts, src/globals/Settings.ts). A rule neither sets is
 * missing, and the flow refuses to offer times rather than guess one (CLAUDE.md #1).
 */
export type BookingRules = {
  noticeHours: number
  horizonDays: number
  bufferMinutes: number
  holdMinutes: number
  /** Free reschedule up to this many hours before the start; missing until D-16 (I-07). */
  rescheduleWindowHours: number | null
  /** Refund share by notice, most notice first; empty until D-16 (I-07). */
  refundSteps: readonly RefundStep[]
}

/** A cancellation at least `hoursBefore` the start is refunded `refundPercent` of what was paid. */
export type RefundStep = { hoursBefore: number; refundPercent: number }

/** Which rules a service and the settings leave unset. */
export type MissingRule = {
  code: 'rule-missing'
  rules: readonly (keyof Omit<BookingRules, 'rescheduleWindowHours' | 'refundSteps'>)[]
}

/** What the slot engine needs for one practitioner and one length (docs/03 F3, "Free times"). */
export type SlotQuery = {
  /** The moment the question is asked; notice and horizon count from it. */
  now: Date
  durationMinutes: number
  rules: Pick<BookingRules, 'noticeHours' | 'horizonDays' | 'bufferMinutes'>
  hours: readonly WeeklyHours[]
  exceptions: readonly DayException[]
  /**
   * Every time already taken: busy blocks from the practitioner's calendar and their bookings in
   * a slot-blocking state (SLOT_BLOCKING_STATUSES), each widened by nothing: the engine keeps the
   * buffer after a booking itself.
   */
  taken: readonly Interval[]
}

/** The bookable start times, by day in India, earliest first; days with none are left out. */
export type SlotDay = { day: IstDay; starts: readonly Date[] }

/**
 * The slot engine (pure; docs/16 §6): start times run from the start of each working span,
 * every `durationMinutes + bufferMinutes`, and a start is offered when [start, start + duration
 * + buffer) fits the span, lies between now + notice and the end of the horizon's last day, and
 * meets nothing in `taken`. The booking builder implements it in src/lib/booking/slots.ts.
 */
export type GenerateSlots = (query: SlotQuery) => readonly SlotDay[]

/**
 * Merges a service's own rules over the defaults in Settings (pure). The booking builder
 * implements it in src/lib/booking/policies.ts.
 */
export type ResolveRules = (
  service: Partial<Record<keyof BookingRules, unknown>> | null | undefined,
  defaults: Partial<Record<keyof BookingRules, unknown>> | null | undefined,
) => { ok: true; value: BookingRules } | { ok: false; error: MissingRule }

/** Whether a client may still move or cancel a booking themselves (F4; pure). */
export type ClientChange =
  | { allowed: true }
  | { allowed: false; reason: 'started' | 'outside-window' | 'no-policy' | 'not-active' }

export type CanClientReschedule = (input: {
  now: Date
  startsAt: Date
  rescheduleWindowHours: number | null
  status: string
}) => ClientChange

/**
 * The refund a cancellation earns under a service's steps (pure, integer paise): the step with
 * the most notice the cancellation meets; nothing when no step applies or none is set. A
 * cancellation by IIIC refunds in full (docs/08 §4, D-16's symmetry).
 */
export type RefundForCancellation = (input: {
  now: Date
  startsAt: Date
  paidPaise: number
  steps: readonly RefundStep[]
  by: 'client' | 'iiic'
}) => { refundPaise: number; step: RefundStep | null }
