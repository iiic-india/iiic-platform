import 'server-only'

import type { Payload } from 'payload'

import { makeOpenCheckout, makeVerifyReturnedPayment } from './checkout'
import type { PaymentsDeps } from './deps'
import { makeCloseOpenLinks, makeSendPaymentLink } from './links'
import { makePollPendingOrders } from './poll'
import { quotePrice } from './prices'
import { makeReconcileDay } from './reconcile'
import {
  makeDecideRefund,
  makeRequestRefund,
  makeSendRefund,
  makeSettleStuckRefund,
} from './refunds'
import { makeProcessGatewayEvent } from './webhook'

/**
 * The payments module's operations, joined to what they need (src/lib/payments/deps.ts): what
 * the booking flow, the admin's money actions, the webhook route and the jobs call. The app's
 * own instance is `payments()` in src/lib/payments/wiring.ts; tests build one on the fake gateway.
 *
 * - `quotePrice`: the price in force for an option, with its tax (step 1 and step 3).
 * - `openCheckout` and `checkoutParams`: the order for a held booking, and what the browser needs.
 * - `verifyReturnedPayment`: the server's check of the order when the browser comes back.
 * - `sendPaymentLink`: staff's link for a confirmed booking (D-24); `closeOpenLinks`, a
 *   booking chain's open links closed before a cancellation or a reschedule commits.
 * - `processGatewayEvent`: one verified event, once (the webhook route, the poll).
 * - `requestRefund`, `decideRefund`, `sendRefund`: refunds, under the Settings threshold.
 * - `pollPendingOrders`, `reconcileDay`: the B2 poll and B11, run as jobs.
 */
export function makePayments(deps: PaymentsDeps) {
  const processGatewayEvent = makeProcessGatewayEvent(deps)
  const sendRefund = makeSendRefund(deps)

  /** Sends refunds approved by work that has now committed; a failure is left for the poll. */
  async function sendRefunds(payload: Payload, refundIds: number[]): Promise<void> {
    for (const refundId of refundIds) {
      try {
        const sent = await sendRefund(payload, refundId)
        if (!sent.ok) payload.logger.warn(`Refund ${refundId} not sent (${sent.error.code}).`)
      } catch (error) {
        payload.logger.error(
          `Refund ${refundId} not sent (${error instanceof Error ? error.name : 'unknown error'}).`,
        )
      }
    }
  }

  return {
    quotePrice,
    openCheckout: makeOpenCheckout(deps),
    verifyReturnedPayment: makeVerifyReturnedPayment(deps, processGatewayEvent, sendRefunds),
    sendPaymentLink: makeSendPaymentLink(deps),
    closeOpenLinks: makeCloseOpenLinks(deps),
    processGatewayEvent,
    requestRefund: makeRequestRefund(deps),
    decideRefund: makeDecideRefund(deps),
    sendRefund,
    sendRefunds,
    pollPendingOrders: makePollPendingOrders(
      deps,
      processGatewayEvent,
      sendRefunds,
      makeSettleStuckRefund(deps),
    ),
    reconcileDay: makeReconcileDay(deps),
  }
}

export type Payments = ReturnType<typeof makePayments>
