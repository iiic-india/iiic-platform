import 'server-only'

import type { PayloadRequest } from 'payload'

import { emit } from '@/lib/booking/emit'
import { cancellationRefundKey } from '@/lib/office/refundPlan'
import { readPaymentSettings } from '@/lib/payments/records'
import {
  MIN_REFUND_PAISE,
  refundablePaise,
  refundableState,
  statusOnRequest,
} from '@/lib/payments/refundRules'
import { lockRow } from '@/lib/payments/store'
import type { Booking } from '@/payload-types'

/**
 * The refund a client's own cancellation gives (docs/03 F4; D-16; docs/05, Money), asked for in
 * the cancellation's transaction once the booking module has worked out the amount under the
 * service's rule. It follows the office's rules for a request (docs/16 §5): approved at once at
 * or below the threshold in Settings, else waiting for an owner (with no threshold, every refund
 * waits); never more than the payment can still give back; taken from the latest payment first,
 * with the office's key (`cancel:<booking>:<payment>`, src/lib/office/refundPlan.ts), so a
 * repeated request finds the first and either side's cancellation keys its refunds alike. Nobody signed in asked for it, so `requestedBy` stays empty, as for
 * the platform's own refunds. The money goes back through the gateway to the original method,
 * sent by the caller after the transaction commits (the payments module's `sendRefunds`).
 *
 * The payments module's RequestRefund takes `staff` (a signed-in office) or `platform` (B10,
 * approved at once); a client's cancellation is neither, so this asks with the same rules
 * (src/lib/payments/refundRules.ts). Folding it into RequestRefund as `by: 'client'` is proposed.
 */

const SERVER = { overrideAccess: true, depth: 0 } as const

const idOf = (value: unknown): number | null =>
  typeof value === 'number'
    ? value
    : value && typeof value === 'object' && 'id' in value
      ? Number((value as { id: unknown }).id)
      : null

/** The booking and the bookings it replaced: a reschedule keeps the payment on the first. */
async function chainOf(req: PayloadRequest, booking: Booking): Promise<number[]> {
  const chain = [booking.id]
  let from = idOf(booking.rescheduledFrom)
  while (from !== null && !chain.includes(from) && chain.length < 50) {
    chain.push(from)
    const previous = await req.payload.findByID({
      collection: 'bookings',
      id: from,
      req,
      disableErrors: true,
      ...SERVER,
    })
    from = previous ? idOf(previous.rescheduledFrom) : null
  }
  return chain
}

export type ClientRefund = {
  refundIds: number[]
  toSend: number[]
  awaitingOwner: boolean
  /** What the refunds asked for add up to: never more than the payments can still give back. */
  requestedPaise: number
}

const CAPTURED = ['captured', 'partRefunded'] as const

/**
 * What the payments of a booking's chain can still give back: less what went back and what open
 * refunds hold. The manage page offers a cancellation online only when its refund fits in this,
 * as the cancellation itself does (docs/16 §5: a request never promises more).
 */
export async function refundableOnChain(req: PayloadRequest, booking: Booking): Promise<number> {
  const { docs } = await req.payload.find({
    collection: 'payments',
    where: {
      and: [{ booking: { in: await chainOf(req, booking) } }, { status: { in: [...CAPTURED] } }],
    },
    pagination: false,
    req,
    ...SERVER,
  })
  let total = 0
  for (const payment of docs) total += await refundablePaise(req, payment)
  return total
}

export async function requestClientRefund(
  req: PayloadRequest,
  input: { booking: Booking; amountPaise: number },
): Promise<ClientRefund> {
  const result: ClientRefund = {
    refundIds: [],
    toSend: [],
    awaitingOwner: false,
    requestedPaise: 0,
  }
  if (!Number.isInteger(input.amountPaise) || input.amountPaise < MIN_REFUND_PAISE) return result
  const chain = await chainOf(req, input.booking)
  const { docs: payments } = await req.payload.find({
    collection: 'payments',
    where: {
      and: [{ booking: { in: chain } }, { status: { in: ['captured', 'partRefunded'] } }],
    },
    sort: '-createdAt',
    pagination: false,
    req,
    ...SERVER,
  })
  const { refundApprovalThresholdPaise } = await readPaymentSettings(req)
  let left = input.amountPaise
  for (const found of payments) {
    if (left < MIN_REFUND_PAISE) break
    const key = cancellationRefundKey(input.booking.id, found.id)
    const { docs: existing } = await req.payload.find({
      collection: 'refunds',
      where: { idempotencyKey: { equals: key } },
      limit: 1,
      req,
      ...SERVER,
    })
    if (existing[0]) {
      result.refundIds.push(existing[0].id)
      result.requestedPaise += existing[0].amountPaise
      left -= existing[0].amountPaise
      continue
    }
    if (!(await lockRow(req, 'payments', found.id))) continue
    const payment = await req.payload.findByID({
      collection: 'payments',
      id: found.id,
      req,
      ...SERVER,
    })
    if (!refundableState(payment).ok) continue
    const amountPaise = Math.min(left, await refundablePaise(req, payment))
    if (amountPaise < MIN_REFUND_PAISE) continue
    const status = statusOnRequest({
      by: 'staff',
      amountPaise,
      thresholdPaise: refundApprovalThresholdPaise,
    })
    const refund = await req.payload.create({
      collection: 'refunds',
      data: {
        payment: payment.id,
        booking: idOf(payment.booking),
        status,
        amountPaise,
        reason: 'cancelledByClient',
        requestedBy: null,
        approvedBy: null,
        decidedAt: status === 'approved' ? new Date().toISOString() : null,
        idempotencyKey: key,
      },
      req,
      ...SERVER,
    })
    result.refundIds.push(refund.id)
    result.requestedPaise += amountPaise
    left -= amountPaise
    if (status === 'approved') result.toSend.push(refund.id)
    else {
      result.awaitingOwner = true
      await emit(req, { name: 'refund.awaitingApproval', refundId: refund.id })
    }
  }
  return result
}
