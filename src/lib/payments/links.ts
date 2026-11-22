import 'server-only'

import { Forbidden } from 'payload'

import { hasRole } from '@/access/roles'
import { err, ok } from '@/lib/result'

import type { PaymentsDeps } from './deps'
import type { SendPaymentLink } from './operations'
import { bookingById, setBookingPaymentStatus, updatePayment } from './records'
import { inTransaction, lockRow } from './store'

/**
 * Payment links (D-24, B13; docs/16 §5): staff send one for a confirmed booking with a price,
 * never for a free service. Its amount is the booking's own total, stated to the client before
 * they pay; it is the one place a price reaches a client while prices_public is off (D-24). The
 * gateway's own SMS and email are off: the platform's message carries the link (M6), on
 * `payment.linkSent`. One open link per booking: sending again cancels the old one first.
 */

/** Razorpay refuses a link that expires sooner than this after it is made. */
const MIN_LINK_LIFETIME_MS = 16 * 60 * 1000

const PAID: readonly string[] = ['paid', 'partRefunded', 'refunded']

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

      const { docs: earlier } = await req.payload.find({
        collection: 'payments',
        where: { and: [{ booking: { equals: booking.id } }, { kind: { equals: 'paymentLink' } }] },
        pagination: false,
        depth: 0,
        overrideAccess: true,
        req,
      })
      for (const link of earlier) {
        if (link.status !== 'created' || !link.gatewayPaymentLinkId) continue
        const cancelled = await gateway.value.cancelPaymentLink(link.gatewayPaymentLinkId)
        // A link already paid cannot be cancelled: its own event settles the booking.
        if (!cancelled.ok) return cancelled
        await updatePayment(req, link.id, { status: 'cancelled' })
      }

      const receipt = `booking:${booking.id}:link:${earlier.length + 1}`
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
