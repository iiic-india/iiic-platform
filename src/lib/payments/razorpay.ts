import 'server-only'

import Razorpay from 'razorpay'
import { validatePaymentVerification } from 'razorpay/dist/utils/razorpay-utils'
import { z } from 'zod'

import { err, ok, type Result } from '@/lib/result'

import type {
  CreateOrder,
  CreatePaymentLink,
  CreateRefund,
  GatewayError,
  GatewayOrder,
  GatewayPayment,
  GatewayPaymentLink,
  GatewayRefund,
  GatewayRefundFound,
  PaymentGateway,
} from './gateway'

/**
 * The payment gateway on Razorpay (D-12; docs/07; docs/16 §5), through its official Node SDK
 * (`razorpay`, pinned). Every answer is read with Zod before the platform trusts it, and only
 * ids, amounts, states, the method and error codes are kept: nothing about the payer. Signatures
 * are checked with the SDK's own functions on the raw text, never by a hand-made comparison. A
 * failure becomes a GatewayError by its kind; the gateway's own message is never logged, because
 * it can quote the payer.
 *
 * Automatic capture is Razorpay's account setting (Dashboard → Payment capture), not a field of
 * the order: it must be on, or payments stay `authorized` until Razorpay releases them.
 */

/** The SDK's parts this gateway calls; a test hands in a stand-in with the same shape. */
export type RazorpayClient = Pick<Razorpay, 'orders' | 'payments' | 'paymentLink'>

export type RazorpayKeys = { keyId: string; keySecret: string; webhookSecret: string }

const GatewayId = z.string().min(1).max(64)
const Amount = z.number().int().nonnegative()

const OrderAnswer = z.object({ id: GatewayId, amount: Amount, status: z.string().max(20) })

const PaymentAnswer = z.object({
  id: GatewayId,
  order_id: GatewayId.nullish(),
  amount: Amount,
  status: z.enum(['created', 'authorized', 'captured', 'refunded', 'failed']),
  method: z.string().max(30).nullish(),
  error_code: z.string().max(64).nullish(),
  created_at: z.number().int().nonnegative(),
})

const LinkAnswer = z.object({ id: GatewayId, short_url: z.url(), status: z.string().max(20) })

const RefundAnswer = z.object({
  id: GatewayId,
  payment_id: GatewayId,
  amount: Amount,
  status: z.enum(['pending', 'processed', 'failed']),
})

const PaymentList = z.object({ items: z.array(PaymentAnswer) })
const RefundList = z.object({
  items: z.array(RefundAnswer.extend({ receipt: z.string().max(100).nullable().optional() })),
})

/** Razorpay's largest page of a list. */
const PAGE = 100
/** A day of IIIC's payments fits many times over; past this the list is cut, and says so. */
const MAX_PAGES = 50

const SIGNATURE = /^[0-9a-f]{64}$/

const seconds = (instant: Date) => Math.floor(instant.getTime() / 1000)

/** A failure by its kind (docs/16 §5), from the SDK's normalised error or a network fault. */
export function toGatewayError(error: unknown): GatewayError {
  const status = Number((error as { statusCode?: unknown } | null)?.statusCode)
  if (status === 404) return { code: 'not-found' }
  if (status >= 400 && status < 500) {
    const code = (error as { error?: { code?: unknown } }).error?.code
    return {
      code: 'refused',
      gatewayCode: typeof code === 'string' && code ? code.slice(0, 64) : 'UNKNOWN',
    }
  }
  // 5xx, a timeout, a dropped connection or an answer the SDK could not read.
  return { code: 'unavailable' }
}

function toPayment(answer: z.infer<typeof PaymentAnswer>): GatewayPayment {
  return {
    paymentId: answer.id,
    orderId: answer.order_id ?? null,
    amountPaise: answer.amount,
    status: answer.status,
    method: answer.method ?? null,
    errorCode: answer.error_code ?? null,
    createdAt: new Date(answer.created_at * 1000),
  }
}

/** Calls the gateway and reads its answer, or returns the failure's kind. */
async function call<S extends z.ZodType, T>(
  request: () => Promise<unknown>,
  schema: S,
  read: (answer: z.infer<S>) => T,
): Promise<Result<T, GatewayError>> {
  let answer: unknown
  try {
    answer = await request()
  } catch (error) {
    return err(toGatewayError(error))
  }
  const parsed = schema.safeParse(answer)
  return parsed.success ? ok(read(parsed.data)) : err({ code: 'unavailable' })
}

export class RazorpayGateway implements PaymentGateway {
  readonly name = 'razorpay' as const
  readonly testMode: boolean
  readonly publicKeyId: string
  private readonly client: RazorpayClient

  constructor(
    private readonly keys: RazorpayKeys,
    client?: RazorpayClient,
  ) {
    this.publicKeyId = keys.keyId
    this.testMode = keys.keyId.startsWith('rzp_test_')
    this.client = client ?? new Razorpay({ key_id: keys.keyId, key_secret: keys.keySecret })
  }

  createOrder(order: CreateOrder): Promise<Result<GatewayOrder, GatewayError>> {
    return call(
      () =>
        this.client.orders.create({
          amount: order.amountPaise,
          currency: 'INR',
          receipt: order.receipt,
          notes: order.notes,
        }),
      OrderAnswer,
      (answer) => ({ orderId: answer.id, amountPaise: answer.amount, status: answer.status }),
    )
  }

  fetchOrderPayments(orderId: string): Promise<Result<GatewayPayment[], GatewayError>> {
    return call(
      () => this.client.orders.fetchPayments(orderId),
      PaymentList,
      (answer) => answer.items.map(toPayment),
    )
  }

  createPaymentLink(link: CreatePaymentLink): Promise<Result<GatewayPaymentLink, GatewayError>> {
    return call(
      () =>
        this.client.paymentLink.create({
          amount: link.amountPaise,
          currency: 'INR',
          accept_partial: false,
          // Razorpay keeps reference ids unique, so a retried request cannot make a second link.
          reference_id: link.receipt,
          description: link.description,
          ...(link.expiresAt ? { expire_by: seconds(link.expiresAt) } : {}),
          // No contact details go to the gateway: the platform's own message carries the link.
          customer: {},
          notify: { sms: false, email: false },
          reminder_enable: false,
        }),
      LinkAnswer,
      (answer) => ({ linkId: answer.id, shortUrl: answer.short_url, status: answer.status }),
    )
  }

  async cancelPaymentLink(linkId: string): Promise<Result<void, GatewayError>> {
    const result = await call(
      () => this.client.paymentLink.cancel(linkId),
      z.object({ id: GatewayId }),
      () => undefined,
    )
    return result
  }

  refund(refund: CreateRefund): Promise<Result<GatewayRefund, GatewayError>> {
    return call(
      () =>
        this.client.payments.refund(refund.paymentId, {
          amount: refund.amountPaise,
          speed: 'normal',
          receipt: refund.receipt,
        }),
      RefundAnswer,
      (answer) => ({
        refundId: answer.id,
        paymentId: answer.payment_id,
        amountPaise: answer.amount,
        status: answer.status,
      }),
    )
  }

  fetchRefunds(paymentId: string): Promise<Result<GatewayRefundFound[], GatewayError>> {
    return call(
      () => this.client.payments.fetchMultipleRefund(paymentId, { count: PAGE }),
      RefundList,
      (answer) =>
        answer.items.map((item) => ({
          refundId: item.id,
          paymentId: item.payment_id,
          amountPaise: item.amount,
          status: item.status,
          receipt: item.receipt ?? null,
        })),
    )
  }

  async listPayments(window: {
    from: Date
    to: Date
  }): Promise<Result<GatewayPayment[], GatewayError>> {
    const payments: GatewayPayment[] = []
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result = await call(
        () =>
          this.client.payments.all({
            from: seconds(window.from),
            // Razorpay's `to` is inclusive; the window's end is not.
            to: seconds(window.to) - 1,
            count: PAGE,
            skip: page * PAGE,
          }),
        PaymentList,
        (answer) => answer.items.map(toPayment),
      )
      if (!result.ok) return result
      payments.push(...result.value)
      if (result.value.length < PAGE) return ok(payments)
    }
    // More than MAX_PAGES pages: report what could not be read rather than a partial day.
    return err({ code: 'unavailable' })
  }

  verifyWebhook(rawBody: string, signature: string): boolean {
    if (!SIGNATURE.test(signature)) return false
    try {
      return Razorpay.validateWebhookSignature(rawBody, signature, this.keys.webhookSecret)
    } catch {
      return false
    }
  }

  verifyCheckout(input: { orderId: string; paymentId: string; signature: string }): boolean {
    if (!SIGNATURE.test(input.signature)) return false
    try {
      return validatePaymentVerification(
        { order_id: input.orderId, payment_id: input.paymentId },
        input.signature,
        this.keys.keySecret,
      )
    } catch {
      return false
    }
  }
}
