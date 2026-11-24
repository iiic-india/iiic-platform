import 'server-only'

import { Forbidden, type PayloadRequest } from 'payload'

import { hasRole } from '@/access/roles'
import { err, ok, type Result } from '@/lib/result'
import type { Payment } from '@/payload-types'

import type { PaymentsDeps } from './deps'
import { CAPTURED_STATES } from './moves'
import type { PaymentError, SendPaymentLink } from './operations'
import { bookingById, idOf, setBookingPaymentStatus, updatePayment } from './records'
import { inTransaction, lockRow } from './store'

/**
 * Payment links (D-24, B13; docs/16 §5): staff send one for a confirmed booking with a price,
 * never for a free service. Its amount is the booking's own total, stated to the client before
 * they pay; it is the one place a price reaches a client while prices_public is off (D-24). The
 * gateway's own SMS and email are off: the platform's message carries the link (M6), on
 * `payment.linkSent`. One open link per booking: sending again cancels the old one first.
 *
 * A reschedule leaves the payment on the first booking of its chain (docs/16 §6), so a link
 * counts for the whole chain: none is sent when a booking of the chain is paid, sending one
 * cancels any open link of the chain, and a cancellation or a reschedule closes the chain's
 * open links before it commits (`closeOpenLinks`), so no link is left to pay for a booking that
 * moved or ended.
 */

/** Razorpay refuses a link that expires sooner than this after it is made. */
const MIN_LINK_LIFETIME_MS = 16 * 60 * 1000

const PAID: readonly string[] = ['paid', 'partRefunded', 'refunded']

/** A booking and the bookings it replaced, newest first. */
async function chainOf(req: PayloadRequest, bookingId: number): Promise<number[]> {
  const chain = [bookingId]
  let from = idOf((await bookingById(req, bookingId))?.rescheduledFrom)
  while (from !== null && !chain.includes(from) && chain.length < 50) {
    chain.push(from)
    from = idOf((await bookingById(req, from))?.rescheduledFrom)
  }
  return chain
}

function paymentsOn(req: PayloadRequest, chain: number[]): Promise<Payment[]> {
  return req.payload
    .find({
      collection: 'payments',
      where: { booking: { in: chain } },
      sort: 'createdAt',
      pagination: false,
      depth: 0,
      overrideAccess: true,
      req,
    })
    .then(({ docs }) => docs)
}

/** Cancels the open links among `found` at the gateway, then here. */
async function cancelLinks(
  req: PayloadRequest,
  deps: PaymentsDeps,
  found: Payment[],
): Promise<Result<void, PaymentError>> {
  const open = found.filter((p) => p.kind === 'paymentLink' && p.status === 'created')
  if (!open.length) return ok(undefined)
  const gateway = deps.gateway()
  if (!gateway.ok) return gateway
  for (const link of open) {
    if (!link.gatewayPaymentLinkId) continue
    const cancelled = await gateway.value.cancelPaymentLink(link.gatewayPaymentLinkId)
    // A link already paid cannot be cancelled: its own event settles the booking.
    if (!cancelled.ok) return cancelled
    await updatePayment(req, link.id, { status: 'cancelled' })
  }
  return ok(undefined)
}

/**
 * Closes the open payment links of a booking's chain, in the caller's transaction, for a
 * cancellation or a reschedule (given the booking that remains, the new one for a reschedule).
 * A chain booking left `linkSent` goes back to `unpaid`. A gateway that does not answer, or a
 * link paid meanwhile, refuses: the caller's change is undone, and tried again later.
 */
export function makeCloseOpenLinks(deps: PaymentsDeps) {
  return (req: PayloadRequest, bookingId: number): Promise<Result<void, PaymentError>> =>
    inTransaction(req, async () => {
      const chain = await chainOf(req, bookingId)
      const closed = await cancelLinks(req, deps, await paymentsOn(req, chain))
      if (!closed.ok) return closed
      for (const id of chain) {
        if ((await bookingById(req, id))?.paymentStatus === 'linkSent') {
          await setBookingPaymentStatus(req, id, 'unpaid')
        }
      }
      return ok(undefined)
    })
}

export function makeSendPaymentLink(deps: PaymentsDeps): SendPaymentLink {
  return async (req, input) => {
    // Staff only (D-24): the office or an owner, whatever called this.
    if (!hasRole(req.user, 'owner', 'operator')) throw new Forbidden(req.t)
    const gateway = deps.gateway()
    if (!gateway.ok) return gateway
    if (
      input.expiresAt &&
      input.expiresAt.getTime() - deps.now().getTime() < MIN_LINK_LIFETIME_MS
    ) {
      return err({ code: 'refused', gatewayCode: 'EXPIRY_TOO_SOON' })
    }

    return inTransaction(req, async () => {
      if (!(await lockRow(req, 'bookings', input.bookingId))) return err({ code: 'not-found' })
      const booking = await bookingById(req, input.bookingId)
      if (!booking) return err({ code: 'not-found' })
      if (booking.status !== 'confirmed') {
        return err({ code: 'bad-move', from: booking.status, to: 'linkSent' })
      }
      const total = booking.price?.totalPaise ?? 0
      if (total <= 0) return err({ code: 'free-service' })
      if (PAID.includes(booking.paymentStatus)) {
        return err({ code: 'bad-move', from: booking.paymentStatus, to: 'linkSent' })
      }

      // The whole chain of reschedules: a payment taken on an earlier booking pays for this one.
      const onChain = await paymentsOn(req, await chainOf(req, booking.id))
      const captured = onChain.find((payment) => CAPTURED_STATES.includes(payment.status))
      if (captured) return err({ code: 'bad-move', from: captured.status, to: 'linkSent' })
      const closed = await cancelLinks(req, deps, onChain)
      if (!closed.ok) return closed

      const own = onChain.filter((p) => p.kind === 'paymentLink' && idOf(p.booking) === booking.id)
      const receipt = `booking:${booking.id}:link:${own.length + 1}`
      const link = await gateway.value.createPaymentLink({
        amountPaise: total,
        receipt,
        // Only the reference, which is never enough to read a booking (docs/16 §2).
        description: `Booking ${booking.reference}`,
        expiresAt: input.expiresAt,
        notify: false,
      })
      if (!link.ok) return link
      const now = deps.now().toISOString()
      const payment = await req.payload.create({
        collection: 'payments',
        data: {
          booking: booking.id,
          kind: 'paymentLink',
          gateway: 'razorpay',
          status: 'created',
          amountPaise: total,
          currency: 'INR',
          refundedPaise: 0,
          receipt,
          gatewayPaymentLinkId: link.value.linkId,
          // B13's message carries it (M6, docs/19 §7).
          linkUrl: link.value.shortUrl,
          linkSentAt: now,
          expiresAt: input.expiresAt?.toISOString() ?? null,
        },
        overrideAccess: true,
        depth: 0,
        req,
      })
      await setBookingPaymentStatus(req, booking.id, 'linkSent')
      await deps.emit(req, {
        name: 'payment.linkSent',
        paymentId: payment.id,
        bookingId: booking.id,
      })
      return ok({ payment, shortUrl: link.value.shortUrl })
    })
  }
}
