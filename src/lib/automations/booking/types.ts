import type { CancelQueued, PlannedMessage } from '@/lib/messaging/operations'
import type { QuietHours } from '@/lib/settings/quietHours'
import type { Booking } from '@/payload-types'

/**
 * What the B-series planners decide from (docs/19 §5, §6): a booking as it stands when its event's
 * job runs, read once by `snapshot.ts`, never a name, an address, a note or anything said in a
 * session. Pure, free of `server-only`, so the planners are tested without a database.
 */
export type BookingSnapshot = {
  id: number
  status: Booking['status']
  paymentStatus: Booking['paymentStatus']
  startsAt: Date | null
  confirmedAt: Date | null
  format: 'online' | 'office' | null
  /** The service is a counselling one: its messages carry the scope and offer nothing. */
  counselling: boolean
  /**
   * Who is told: the person who booked (a parent or guardian for someone under 18), else the
   * client. Their address is read by the core when the message is sent.
   */
  recipientId: number
  /** The person asked for email: nothing goes by WhatsApp (docs/06, Engine rules). */
  prefersEmail: boolean
  /** How many consents were recorded with the booking (the B3a receipt lists them). */
  consents: number
  /** The practitioner's own staff account, told of a change (B7, B10), when one is linked. */
  staffId: number | null
}

/** The run's clock and the quiet hours in force (Settings → Platform settings). */
export type PlanContext = { now: Date; quiet: QuietHours }

export type CancelScope = Parameters<CancelQueued>[1]

/** What one job asks of the core: cancellations first, then the messages to record. */
export type Plan = { cancel: CancelScope[]; deliver: PlannedMessage[] }

export const EMPTY_PLAN: Plan = { cancel: [], deliver: [] }
