import 'server-only'

import type { PayloadRequest } from 'payload'

import type { Booking } from '@/payload-types'

import type { InvoiceSnapshot, PaymentSnapshot, RefundSnapshot } from './plan'
import type { BookingSnapshot } from './types'

/**
 * Reads what the planners decide from (docs/19 §5), under the server's access and in the job's
 * request: states, times, ids and the person's channel preference, never a name, an address or a
 * note. Each answers null for a record that is gone, which plans nothing.
 */

type Ref = number | { id: number } | null | undefined

const idOf = (ref: Ref): number | null =>
  ref === null || ref === undefined ? null : typeof ref === 'number' ? ref : ref.id

const dateOf = (value: string | null | undefined): Date | null => (value ? new Date(value) : null)

async function byId<T>(
  req: PayloadRequest,
  collection: 'bookings' | 'payments' | 'refunds' | 'invoices' | 'services' | 'people',
  id: number,
): Promise<T | null> {
  const doc = await req.payload.findByID({
    collection,
    id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
  return (doc as T | null) ?? null
}

export async function bookingSnapshot(
  req: PayloadRequest,
  bookingId: number,
): Promise<BookingSnapshot | null> {
  const booking = await byId<Booking>(req, 'bookings', bookingId)
  if (!booking) return null
  const recipientId = idOf(booking.bookedBy) ?? idOf(booking.person)
  if (recipientId === null) return null
  const serviceId = idOf(booking.service)
  const service = serviceId
    ? await byId<{ register?: string }>(req, 'services', serviceId)
    : null
  const recipient = await byId<{ preferredChannel?: string | null }>(req, 'people', recipientId)
  const practitionerId = idOf(booking.practitioner)
  const practitioner = practitionerId
    ? await req.payload.findByID({
        collection: 'practitioners',
        id: practitionerId,
        depth: 0,
        disableErrors: true,
        overrideAccess: true,
        req,
      })
    : null
  return {
    id: booking.id,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    startsAt: dateOf(booking.startsAt),
    confirmedAt: dateOf(booking.confirmedAt),
    format: booking.format ?? null,
    counselling: service?.register === 'counselling',
    recipientId,
    prefersEmail: recipient?.preferredChannel === 'email',
    staffId: idOf(practitioner?.staff),
  }
}

export async function paymentSnapshot(
  req: PayloadRequest,
  paymentId: number,
): Promise<(PaymentSnapshot & { bookingId: number | null }) | null> {
  const payment = await byId<{
    id: number
    kind: string
    status: string
    amountPaise: number
    booking: Ref
  }>(req, 'payments', paymentId)
  if (!payment) return null
  return {
    id: payment.id,
    kind: payment.kind,
    status: payment.status,
    amountPaise: payment.amountPaise,
    bookingId: idOf(payment.booking),
  }
}

/** The booking's payment links, newest last, for cancelling their queued messages (B13). */
export async function paymentLinkIds(req: PayloadRequest, bookingId: number): Promise<number[]> {
  const { docs } = await req.payload.find({
    collection: 'payments',
    where: { and: [{ booking: { equals: bookingId } }, { kind: { equals: 'paymentLink' } }] },
    sort: 'createdAt',
    pagination: false,
    depth: 0,
    select: {},
    overrideAccess: true,
    req,
  })
  return docs.map((doc) => doc.id)
}

export async function refundSnapshot(
  req: PayloadRequest,
  refundId: number,
): Promise<(RefundSnapshot & { bookingId: number | null }) | null> {
  const refund = await byId<{ id: number; status: string; booking?: Ref; payment: Ref }>(
    req,
    'refunds',
    refundId,
  )
  if (!refund) return null
  let bookingId = idOf(refund.booking)
  if (bookingId === null) {
    const paymentId = idOf(refund.payment)
    const payment = paymentId ? await paymentSnapshot(req, paymentId) : null
    bookingId = payment?.bookingId ?? null
  }
  return { id: refund.id, status: refund.status, bookingId }
}

export async function invoiceSnapshot(
  req: PayloadRequest,
  invoiceId: number,
): Promise<(InvoiceSnapshot & { bookingId: number | null }) | null> {
  const invoice = await byId<{ id: number; status: string; booking?: Ref }>(
    req,
    'invoices',
    invoiceId,
  )
  if (!invoice) return null
  return { id: invoice.id, status: invoice.status, bookingId: idOf(invoice.booking) }
}
