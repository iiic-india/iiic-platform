import 'server-only'

import type { Payload } from 'payload'

import { eventFromGatewayPayment } from './checkout'
import type { PaymentsDeps } from './deps'
import type { PollPendingOrders } from './operations'
import { freshRequest } from './store'
import type { ProcessGatewayEventWith } from './webhook'

/**
 * The order-status poll (docs/07; docs/16 §5), run as `B2-poll-pending-orders`: for a checkout
 * whose webhook never came, it asks the gateway for the order's payments and processes what it
 * finds as events of source `poll` (`poll:<gateway payment id>:captured`), each in a transaction
 * of its own, so a capture is acted on once whether the webhook, the return from checkout or
 * the poll reports it first. It also sends refunds left `approved` (a send interrupted, or one an
 * owner approved in the admin), which is how an approval reaches the gateway until the admin's
 * own action does (wave 2).
 *
 * The two windows are the engineering's, not IIIC's: a payment is left alone for its first
 * minutes, while its webhook is on the way, and not asked about after two days, by when
 * Razorpay has stopped retrying and B11's reconciliation has looked at it.
 */

const QUIET_MS = 5 * 60 * 1000
const GIVE_UP_MS = 48 * 60 * 60 * 1000
const BATCH = 100
/** An approved refund is left this long for the request that approved it to send it. */
const SEND_AFTER_MS = 2 * 60 * 1000

export function makePollPendingOrders(
  deps: PaymentsDeps,
  processGatewayEvent: ProcessGatewayEventWith,
  sendRefunds: (payload: Payload, refundIds: number[]) => Promise<void>,
): PollPendingOrders {
  return async (req, now) => {
    const gateway = deps.gateway()
    if (!gateway.ok) return { checked: 0 }
    const payload = req.payload
    const read = await freshRequest(payload)
    const { docs: pending } = await payload.find({
      collection: 'payments',
      where: {
        and: [
          { kind: { equals: 'checkout' } },
          { status: { in: ['created', 'authorized', 'failed'] } },
          { gatewayOrderId: { exists: true } },
          { createdAt: { less_than: new Date(now.getTime() - QUIET_MS).toISOString() } },
          { createdAt: { greater_than: new Date(now.getTime() - GIVE_UP_MS).toISOString() } },
        ],
      },
      sort: 'createdAt',
      limit: BATCH,
      depth: 0,
      overrideAccess: true,
      req: read,
    })

    for (const payment of pending) {
      if (!payment.gatewayOrderId) continue
      const found = await gateway.value.fetchOrderPayments(payment.gatewayOrderId)
      if (!found.ok) continue
      // A capture settles the order; failed attempts matter only while there is none.
      const captured = found.value.filter(
        (attempt) => attempt.status === 'captured' || attempt.status === 'refunded',
      )
      const kind = captured.length ? 'captured' : 'failed'
      const attempts = captured.length
        ? captured
        : found.value.filter((attempt) => attempt.status === 'failed')
      for (const attempt of attempts) {
        const processed = await processGatewayEvent(
          await freshRequest(payload),
          eventFromGatewayPayment(attempt, kind, 'poll'),
          'poll',
        )
        if (processed.ok) await sendRefunds(payload, processed.value.refundsToSend)
      }
    }

    const { docs: approved } = await payload.find({
      collection: 'refunds',
      where: {
        and: [
          { status: { equals: 'approved' } },
          { updatedAt: { less_than: new Date(now.getTime() - SEND_AFTER_MS).toISOString() } },
        ],
      },
      sort: 'updatedAt',
      limit: BATCH,
      depth: 0,
      overrideAccess: true,
      req: read,
    })
    await sendRefunds(
      payload,
      approved.map((refund) => refund.id),
    )
    return { checked: pending.length }
  }
}
