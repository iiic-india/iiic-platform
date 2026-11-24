import {
  APIError,
  type CollectionBeforeChangeHook,
  type CollectionBeforeValidateHook,
  type PayloadRequest,
} from 'payload'

import { ownerWithCode } from '@/access/policy'
import type { GatewayEvent, Payment, PriceHistory, Refund } from '@/payload-types'

import { paymentMove, refundMove } from './moves'
import { idOf, paymentById, readPaymentSettings } from './records'
import {
  refundableState,
  refundablePaise,
  refundAmountAllowed,
  staffRefundKey,
  statusOnRequest,
} from './refundRules'

/**
 * The payments collections' own checks (docs/16 §3, §5), which hold whoever writes: the payments
 * module on the server, or staff through the admin and the REST API where the access rules let
 * them (only refunds). A move a state machine does not list is refused; what records the money
 * never changes once written. The collections' hooks load this module, so it stays free of
 * `server-only`: the Payload CLI loads it too (src/lib/env.ts says why).
 */

const refuse = (message: string): never => {
  throw new APIError(message, 400, undefined, true)
}

/** Whether a write came from outside the server's own code: the admin, REST or GraphQL. */
const fromOutside = (req: PayloadRequest) => req.payloadAPI !== 'local'

/** A stored value as it compares: a relation by its id, a date by its instant, empty as null. */
function comparable(value: unknown): unknown {
  if (value === undefined || value === null) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object' && 'id' in value) return (value as { id: unknown }).id
  return value
}

function keepFields<T extends object>(
  data: Partial<T>,
  originalDoc: T | undefined,
  fields: readonly (keyof T & string)[],
  what: string,
): void {
  if (!originalDoc) return
  for (const field of fields) {
    if (!(field in data)) continue
    if (comparable(originalDoc[field]) !== comparable(data[field])) {
      refuse(`${what}: “${field}” cannot change once it is written.`)
    }
  }
}

/** Payments: only the moves in PAYMENT_MOVES, and the money they record stays as it was. */
export const paymentRules: CollectionBeforeChangeHook<Payment> = ({
  data,
  originalDoc,
  operation,
}) => {
  if (operation !== 'update' || !originalDoc) return data
  keepFields(
    data,
    originalDoc,
    [
      'booking',
      'kind',
      'gateway',
      'amountPaise',
      'currency',
      'receipt',
      'gatewayOrderId',
      'gatewayPaymentLinkId',
    ],
    'A payment',
  )
  if (data.status && data.status !== originalDoc.status) {
    const move = paymentMove(originalDoc.status, data.status)
    if (!move.ok) refuse(`A payment cannot move from ${originalDoc.status} to ${data.status}.`)
  }
  // The captured payment's id is the money's record: never replaced once captured.
  if (
    ['captured', 'partRefunded', 'refunded'].includes(originalDoc.status) &&
    'gatewayPaymentId' in data &&
    (data.gatewayPaymentId ?? null) !== (originalDoc.gatewayPaymentId ?? null)
  ) {
    refuse('A captured payment’s gateway payment cannot change.')
  }
  const amount = data.amountPaise ?? originalDoc.amountPaise
  if ((data.refundedPaise ?? 0) > amount) refuse('A payment cannot be refunded past its amount.')
  return data
}

/** Gateway events: the record of what came stays as it came; only the outcome is written after. */
export const gatewayEventRules: CollectionBeforeChangeHook<GatewayEvent> = ({
  data,
  originalDoc,
  operation,
}) => {
  if (operation !== 'update' || !originalDoc) return data
  keepFields(
    data,
    originalDoc,
    [
      'gateway',
      'eventId',
      'type',
      'source',
      'gatewayOrderId',
      'gatewayPaymentLinkId',
      'gatewayPaymentId',
      'gatewayRefundId',
      'amountPaise',
      'receivedAt',
    ],
    'A gateway event',
  )
  return data
}

/** Price history: a row's price never changes; it is only closed, once, after it opened. */
export const priceHistoryRules: CollectionBeforeChangeHook<PriceHistory> = ({
  data,
  originalDoc,
  operation,
}) => {
  const from = data.validFrom ?? originalDoc?.validFrom
  if (from && data.validTo && new Date(data.validTo) <= new Date(from)) {
    refuse('A price ends after it starts.')
  }
  if (operation !== 'update' || !originalDoc) return data
  keepFields(
    data,
    originalDoc,
    ['service', 'serviceOption', 'pricePaise', 'gstInclusive', 'gstRateBasisPoints', 'validFrom'],
    'A past price',
  )
  if (originalDoc.validTo && (data.validTo ?? null) !== originalDoc.validTo) {
    refuse('A price that has ended stays ended.')
  }
  return data
}

/**
 * A refund asked for through the admin or the API starts as the office's request: the platform
 * sets its key, who asked, and its state; the rest of the request is checked before it is saved.
 */
export const refundRequestDefaults: CollectionBeforeValidateHook<Refund> = ({
  data,
  operation,
  req,
}) => {
  if (operation !== 'create' || !fromOutside(req) || !data) return data
  return {
    ...data,
    status: 'requested',
    requestedBy: idOf(req.user as { id: number } | null),
    approvedBy: null,
    decidedAt: null,
    gatewayRefundId: null,
    processedAt: null,
    failureCode: null,
    idempotencyKey: staffRefundKey(),
  }
}

async function checkRequest(req: PayloadRequest, data: Partial<Refund>): Promise<Partial<Refund>> {
  const paymentId = idOf(data.payment as number | { id: number } | null | undefined)
  const payment = paymentId === null ? null : await paymentById(req, paymentId)
  if (!payment) return refuse('Choose the payment to refund.')
  const state = refundableState(payment)
  if (!state.ok) refuse('Only a captured payment, not yet refunded in full, can be refunded.')
  if (!refundAmountAllowed(data.amountPaise))
    refuse('A refund is at least ₹1 (100 paise), in whole paise.')
  const refundable = await refundablePaise(req, payment)
  if ((data.amountPaise as number) > refundable) {
    refuse(`At most ${refundable} paise can be refunded on this payment.`)
  }
  const { refundApprovalThresholdPaise } = await readPaymentSettings(req)
  const status = statusOnRequest({
    by: 'staff',
    amountPaise: data.amountPaise as number,
    thresholdPaise: refundApprovalThresholdPaise,
  })
  return {
    ...data,
    booking: idOf(payment.booking),
    status,
    ...(status === 'approved'
      ? { approvedBy: data.requestedBy ?? null, decidedAt: new Date().toISOString() }
      : {}),
  }
}

async function checkDecision(
  req: PayloadRequest,
  data: Partial<Refund>,
  originalDoc: Refund,
): Promise<Partial<Refund>> {
  const to = data.status as Refund['status']
  if (originalDoc.status !== 'awaitingApproval' || (to !== 'approved' && to !== 'declined')) {
    return refuse(
      'Through the admin a refund can only be approved or declined while it waits for an owner.',
    )
  }
  if (!ownerWithCode({ req }))
    refuse('Only an owner, with their two-factor code, decides a refund.')
  if (to === 'approved') {
    const paymentId = idOf(originalDoc.payment)
    const payment = paymentId === null ? null : await paymentById(req, paymentId)
    if (!payment || !refundableState(payment).ok) refuse('That payment can no longer be refunded.')
    const refundable = await refundablePaise(req, payment as Payment, originalDoc.id)
    if (originalDoc.amountPaise > refundable)
      refuse(`At most ${refundable} paise can be refunded on this payment.`)
  }
  return {
    ...data,
    approvedBy: idOf(req.user as { id: number } | null),
    decidedAt: new Date().toISOString(),
  }
}

/**
 * Refunds: the request's checks and the threshold for the office's own requests; an owner's
 * decision for a refund above it; the refund's state machine and its money for every writer.
 * Approval through the admin does not reach the gateway from here (a hook runs before its
 * transaction commits): the poll sends approved refunds (src/lib/payments/poll.ts).
 */
export const refundRules: CollectionBeforeChangeHook<Refund> = async ({
  data,
  originalDoc,
  operation,
  req,
}) => {
  if (operation === 'create') {
    if (fromOutside(req)) return checkRequest(req, data)
    if (!['requested', 'approved', 'awaitingApproval'].includes(data.status ?? 'requested')) {
      refuse('A refund starts as requested, approved or waiting for an owner.')
    }
    return data
  }
  if (!originalDoc) return data
  keepFields(
    data,
    originalDoc,
    ['payment', 'booking', 'amountPaise', 'reason', 'idempotencyKey', 'requestedBy'],
    'A refund',
  )
  if (
    originalDoc.gatewayRefundId &&
    (data.gatewayRefundId ?? null) !== originalDoc.gatewayRefundId
  ) {
    refuse('A refund’s gateway id cannot change once it is written.')
  }
  if (!data.status || data.status === originalDoc.status) return data
  if (fromOutside(req)) return checkDecision(req, data, originalDoc)
  const move = refundMove(originalDoc.status, data.status)
  if (!move.ok) refuse(`A refund cannot move from ${originalDoc.status} to ${data.status}.`)
  return data
}
