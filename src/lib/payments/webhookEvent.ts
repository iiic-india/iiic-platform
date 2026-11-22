import { z } from 'zod'

import { err, ok, type Result } from '@/lib/result'

import type { VerifiedGatewayEvent } from './operations'

/**
 * Razorpay's webhook body, read with Zod after its signature has been checked on the raw body
 * (docs/16 §5; docs/08 §9). Only the fields the platform needs leave the parser: ids, the amount,
 * the currency, the method, the error code and, for a refund, our own receipt. Zod drops every
 * other key, so the payer's name, email, phone, card, VPA, address and notes never go further,
 * and nothing here is logged.
 */

/** The event as the payments module reads it: the contract's fields, plus two it checks. */
export type ParsedGatewayEvent = VerifiedGatewayEvent & {
  /** The currency the gateway reports; anything but the payment's own is flagged. */
  currency: string | null
  /** A refund's receipt: the platform's idempotency key, which finds a refund sent but not yet recorded. */
  refundReceipt: string | null
}

export type EventParseError =
  { code: 'bad-body' } | { code: 'bad-event-id' } | { code: 'unsupported-event' }

const TAKEN = [
  'payment.authorized',
  'payment.captured',
  'payment.failed',
  'order.paid',
  'refund.processed',
  'refund.failed',
  'payment_link.paid',
  'payment_link.expired',
  'payment_link.cancelled',
] as const satisfies readonly VerifiedGatewayEvent['type'][]

const EventId = z.string().min(1).max(100)
const GatewayId = z.string().min(1).max(64)
const Amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const Currency = z.string().min(3).max(3)
const Short = z.string().max(64)

const PaymentEntity = z.object({
  id: GatewayId,
  order_id: GatewayId.nullish(),
  amount: Amount,
  currency: Currency,
  method: z.string().max(30).nullish(),
  error_code: Short.nullish(),
})

const OrderEntity = z.object({ id: GatewayId, amount: Amount, currency: Currency })

const RefundEntity = z.object({
  id: GatewayId,
  payment_id: GatewayId,
  amount: Amount,
  currency: Currency,
  receipt: Short.nullish(),
})

const LinkEntity = z.object({ id: GatewayId, amount: Amount, currency: Currency })

const entity = <T extends z.ZodType>(schema: T) => z.object({ entity: schema })

const Envelope = z.object({
  event: z.string().max(60),
  payload: z.object({
    payment: entity(PaymentEntity).optional(),
    order: entity(OrderEntity).optional(),
    refund: entity(RefundEntity).optional(),
    payment_link: entity(LinkEntity).optional(),
  }),
})

type Envelope = z.infer<typeof Envelope>

const isTaken = (type: string): type is (typeof TAKEN)[number] =>
  (TAKEN as readonly string[]).includes(type)

const NONE = {
  gatewayOrderId: null,
  gatewayPaymentId: null,
  gatewayPaymentLinkId: null,
  gatewayRefundId: null,
  amountPaise: null,
  currency: null,
  method: null,
  errorCode: null,
  refundReceipt: null,
}

/** The event's fields from its payload, or null when the entity it needs is missing. */
function fieldsOf(
  type: (typeof TAKEN)[number],
  payload: Envelope['payload'],
): Omit<ParsedGatewayEvent, 'eventId' | 'type'> | null {
  const payment = payload.payment?.entity
  const fromPayment = payment && {
    gatewayPaymentId: payment.id,
    gatewayOrderId: payment.order_id ?? null,
    amountPaise: payment.amount,
    currency: payment.currency,
    method: payment.method ?? null,
    errorCode: payment.error_code ?? null,
  }
  switch (type) {
    case 'payment.authorized':
    case 'payment.captured':
    case 'payment.failed':
      return fromPayment ? { ...NONE, ...fromPayment } : null
    case 'order.paid': {
      const order = payload.order?.entity
      if (!order || !fromPayment) return null
      return { ...NONE, ...fromPayment, gatewayOrderId: order.id }
    }
    case 'refund.processed':
    case 'refund.failed': {
      const refund = payload.refund?.entity
      if (!refund) return null
      return {
        ...NONE,
        gatewayRefundId: refund.id,
        gatewayPaymentId: refund.payment_id,
        amountPaise: refund.amount,
        currency: refund.currency,
        refundReceipt: refund.receipt ?? null,
      }
    }
    case 'payment_link.paid': {
      const link = payload.payment_link?.entity
      if (!link || !fromPayment) return null
      return {
        ...NONE,
        ...fromPayment,
        gatewayOrderId: payload.order?.entity.id ?? fromPayment.gatewayOrderId,
        gatewayPaymentLinkId: link.id,
      }
    }
    case 'payment_link.expired':
    case 'payment_link.cancelled': {
      const link = payload.payment_link?.entity
      return link ? { ...NONE, gatewayPaymentLinkId: link.id, currency: link.currency } : null
    }
  }
}

/** Reads a verified webhook body. Call it only after the signature check has passed. */
export function parseRazorpayEvent(
  rawBody: string,
  eventId: string,
): Result<ParsedGatewayEvent, EventParseError> {
  if (!EventId.safeParse(eventId).success) return err({ code: 'bad-event-id' })
  let json: unknown
  try {
    json = JSON.parse(rawBody)
  } catch {
    return err({ code: 'bad-body' })
  }
  const type = (json as { event?: unknown } | null)?.event
  if (typeof type === 'string' && !isTaken(type)) return err({ code: 'unsupported-event' })
  const envelope = Envelope.safeParse(json)
  if (!envelope.success || !isTaken(envelope.data.event)) return err({ code: 'bad-body' })
  const fields = fieldsOf(envelope.data.event, envelope.data.payload)
  if (!fields) return err({ code: 'bad-body' })
  return ok({ eventId, type: envelope.data.event, ...fields })
}
