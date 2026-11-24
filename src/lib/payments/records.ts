import type { PayloadRequest, Where } from 'payload'

import { toFlags, type Flags } from '@/lib/settings/flags'
import type { Booking, Payment, Refund } from '@/payload-types'

import type { PaymentFacts, RefundFacts } from './eventPlan'

/**
 * Reads and writes of the payments module's own records, always on the request (its
 * transaction) with access overridden: the payments module is the server that writes them
 * (src/access/policy.ts: payments, gateway events and refunds are written by no role). Every
 * read is at depth 0, so a relation is an id and nothing personal comes along. The collections'
 * hooks use these too, so the module stays free of `server-only`: the Payload CLI loads it
 * (src/lib/env.ts says why). It holds no secret and calls no gateway.
 */

const SERVER = { overrideAccess: true, depth: 0 } as const

async function findOne<T>(
  req: PayloadRequest,
  collection: 'payments' | 'refunds',
  where: Where,
): Promise<T | null> {
  const { docs } = await req.payload.find({
    collection,
    where,
    limit: 1,
    pagination: false,
    req,
    ...SERVER,
  })
  return (docs[0] as T | undefined) ?? null
}

export function paymentById(req: PayloadRequest, id: number): Promise<Payment | null> {
  return req.payload
    .findByID({ collection: 'payments', id, req, disableErrors: true, ...SERVER })
    .then((doc) => doc ?? null)
}

export function paymentWhere(req: PayloadRequest, where: Where): Promise<Payment | null> {
  return findOne<Payment>(req, 'payments', where)
}

export function refundById(req: PayloadRequest, id: number): Promise<Refund | null> {
  return req.payload
    .findByID({ collection: 'refunds', id, req, disableErrors: true, ...SERVER })
    .then((doc) => doc ?? null)
}

export function refundWhere(req: PayloadRequest, where: Where): Promise<Refund | null> {
  return findOne<Refund>(req, 'refunds', where)
}

export function bookingById(req: PayloadRequest, id: number): Promise<Booking | null> {
  return req.payload
    .findByID({ collection: 'bookings', id, req, disableErrors: true, ...SERVER })
    .then((doc) => doc ?? null)
}

export function updatePayment(
  req: PayloadRequest,
  id: number,
  data: Partial<Payment>,
): Promise<Payment> {
  return req.payload.update({ collection: 'payments', id, data, req, ...SERVER })
}

export function updateRefund(
  req: PayloadRequest,
  id: number,
  data: Partial<Refund>,
): Promise<Refund> {
  return req.payload.update({ collection: 'refunds', id, data, req, ...SERVER })
}

/** The booking's payment state, the one booking field the payments module moves (docs/16 §3). */
export function setBookingPaymentStatus(
  req: PayloadRequest,
  bookingId: number,
  paymentStatus: Booking['paymentStatus'],
): Promise<Booking> {
  return req.payload.update({
    collection: 'bookings',
    id: bookingId,
    data: { paymentStatus },
    req,
    ...SERVER,
  })
}

/** A relation's id, whether Payload returned the id or the document. */
export function idOf(value: number | { id: number } | null | undefined): number | null {
  if (value === null || value === undefined) return null
  return typeof value === 'number' ? value : value.id
}

export function paymentFacts(payment: Payment): PaymentFacts {
  return {
    status: payment.status,
    amountPaise: payment.amountPaise,
    currency: payment.currency,
    gatewayPaymentId: payment.gatewayPaymentId ?? null,
    refundedPaise: payment.refundedPaise ?? 0,
  }
}

export function refundFacts(refund: Refund): RefundFacts {
  return {
    status: refund.status,
    amountPaise: refund.amountPaise,
    gatewayRefundId: refund.gatewayRefundId ?? null,
  }
}

export type PaymentSettings = {
  flags: Flags
  /** Refunds at or below it are approved at once; null (unset) sends every refund to an owner. */
  refundApprovalThresholdPaise: number | null
}

/** The flags and the money rules, read on the server past the settings' owner-only rule. */
export async function readPaymentSettings(req: PayloadRequest): Promise<PaymentSettings> {
  const settings = await req.payload.findGlobal({
    slug: 'settings',
    select: { flags: true, money: true },
    req,
    ...SERVER,
  })
  const threshold = (settings as { money?: { refundApprovalThresholdPaise?: number | null } }).money
    ?.refundApprovalThresholdPaise
  return {
    flags: toFlags(settings),
    refundApprovalThresholdPaise:
      typeof threshold === 'number' && Number.isInteger(threshold) && threshold >= 0
        ? threshold
        : null,
  }
}
