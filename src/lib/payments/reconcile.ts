import 'server-only'

import { TZDate } from '@date-fns/tz'
import type { PayloadRequest } from 'payload'


import { IST } from '@/lib/time/ist'
import type { Payment } from '@/payload-types'

import type { PaymentsDeps } from './deps'
import type { GatewayPayment } from './gateway'
import { CAPTURED_STATES } from './moves'
import type { ReconcileDay } from './operations'
import { bookingById, idOf, paymentWhere } from './records'
import { claimGatewayEvent, freshRequest, inTransaction } from './store'

/**
 * The daily reconciliation, B11 (docs/06; docs/16 §5): the gateway's payments of a window set
 * against the platform's. Each mismatch is stored once as a flagged event of source
 * `reconciliation` (its id names the gateway payment and the finding, so a second run over the
 * same day adds nothing) and raises `reconciliation.mismatch` for Today. It acts on nothing:
 * money that does not match is the office's to look at.
 *
 * Findings: a capture the platform has no payment for (`unknown-capture`); one the platform has
 * not recorded as captured (`missed-capture`); an amount that differs (`amount-mismatch`); a
 * captured payment whose booking is not marked paid (`booking-not-paid`); a payment the gateway
 * shows as refunded that the platform does not (`refund-outside-platform`, a refund made in the
 * dashboard). A partial refund made in the dashboard is not visible in the gateway's list of
 * payments, which carries no refunded amount (proposed: add it to GatewayPayment).
 */

export type Finding =
  | 'unknown-capture'
  | 'missed-capture'
  | 'amount-mismatch'
  | 'booking-not-paid'
  | 'refund-outside-platform'

const PAID_STATES: readonly string[] = ['paid', 'partRefunded', 'refunded']

/** The window of one day in India, as YYYY-MM-DD: from its midnight to the next (CLAUDE.md #8). */
export function istDayWindow(day: string): { from: Date; to: Date } {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number]
  const from = new TZDate(year, month - 1, date, IST)
  const to = new TZDate(year, month - 1, date + 1, IST)
  return { from: new Date(from.getTime()), to: new Date(to.getTime()) }
}

/** What, if anything, is wrong between the gateway's payment and the platform's. */
export function findingFor(
  found: GatewayPayment,
  ours: Pick<Payment, 'status' | 'amountPaise'> | null,
  bookingPaymentStatus: string | null,
): Finding | null {
  if (found.status !== 'captured' && found.status !== 'refunded') return null
  if (!ours) return 'unknown-capture'
  if (!CAPTURED_STATES.includes(ours.status)) return 'missed-capture'
  if (ours.amountPaise !== found.amountPaise) return 'amount-mismatch'
  if (found.status === 'refunded' && ours.status !== 'refunded') return 'refund-outside-platform'
  if (bookingPaymentStatus !== null && !PAID_STATES.includes(bookingPaymentStatus)) {
    return 'booking-not-paid'
  }
  return null
}

async function oursFor(req: PayloadRequest, found: GatewayPayment): Promise<Payment | null> {
  return (
    (await paymentWhere(req, { gatewayPaymentId: { equals: found.paymentId } })) ??
    (found.orderId ? await paymentWhere(req, { gatewayOrderId: { equals: found.orderId } }) : null)
  )
}

export function makeReconcileDay(deps: PaymentsDeps): ReconcileDay {
  return async (req, window) => {
    const gateway = deps.gateway()
    if (!gateway.ok) return { checked: 0, flagged: 0 }
    const listed = await gateway.value.listPayments(window)
    // No list, no reconciliation: the job fails and is retried (docs/06, Engine rules).
    if (!listed.ok)
      throw new Error(`The gateway's payments could not be listed (${listed.error.code}).`)

    let flagged = 0
    for (const found of listed.value) {
      const flag = await freshRequest(req.payload)
      const added = await inTransaction(flag, async () => {
        const ours = await oursFor(flag, found)
        const bookingId = ours ? idOf(ours.booking) : null
        const booking = bookingId === null ? null : await bookingById(flag, bookingId)
        const finding = findingFor(found, ours, booking?.paymentStatus ?? null)
        if (!finding) return false
        const eventRowId = await claimGatewayEvent(
          flag,
          {
            eventId: `reconcile:${found.paymentId}:${finding}`,
            type: `reconciliation.${finding}`,
            gatewayOrderId: found.orderId,
            gatewayPaymentId: found.paymentId,
            gatewayPaymentLinkId: null,
            gatewayRefundId: null,
            amountPaise: found.amountPaise,
            currency: null,
            method: found.method,
            errorCode: null,
            refundReceipt: null,
          },
          'reconciliation',
          deps.now(),
        )
        if (eventRowId === null) return false
        await flag.payload.update({
          collection: 'gateway-events',
          id: eventRowId,
          data: { outcome: 'flagged', note: finding, payment: ours?.id ?? null },
          overrideAccess: true,
          depth: 0,
          req: flag,
        })
        await deps.emit(flag, { name: 'reconciliation.mismatch', gatewayEventId: eventRowId })
        return true
      })
      if (added) flagged += 1
    }
    req.payload.logger.info(
      `B11 reconciliation: ${listed.value.length} payments checked, ${flagged} flagged.`,
    )
    return { checked: listed.value.length, flagged }
  }
}
