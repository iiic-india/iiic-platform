import 'server-only'

import type { Result } from '@/lib/result'

import type { GatewayError, PaymentGateway } from './gateway'
import type { PaymentError } from './operations'
import type { ProcessedEvent } from './webhook'
import { parseRazorpayEvent, type ParsedGatewayEvent } from './webhookEvent'

/**
 * Razorpay's webhook, from the raw body to the answer (docs/16 §5; docs/08 §9), apart from Next.js
 * so every answer is tested: the signature is checked on the raw body before anything is read;
 * then the event id and the body; then the event is processed once. Razorpay retries anything but
 * a 2xx for 24 hours, so: a replay, a duplicate and an event the platform does not take are 200;
 * a processing failure is 500 (the transaction rolled back, the claim with it); a bad signature
 * is 401 and a body that cannot be read 400. The answer never echoes the body, and the log holds
 * the outcome only.
 */

export type WebhookInput = { rawBody: string; signature: string | null; eventId: string | null }

export type WebhookAnswer = {
  status: 200 | 400 | 401 | 500 | 503
  body: { received: boolean; outcome?: string; error?: string }
}

export type WebhookDeps = {
  gateway: Result<PaymentGateway, GatewayError>
  process: (event: ParsedGatewayEvent) => Promise<Result<ProcessedEvent, PaymentError>>
  /** Runs after the event's transaction has committed: the refunds it approved go out (B10). */
  afterCommit: (refundIds: number[]) => Promise<void>
  log: { info: (message: string) => void; error: (message: string) => void }
}

const refuse = (status: WebhookAnswer['status'], error: string): WebhookAnswer => ({
  status,
  body: { received: false, error },
})

export async function handleRazorpayWebhook(
  input: WebhookInput,
  deps: WebhookDeps,
): Promise<WebhookAnswer> {
  if (!deps.gateway.ok) return refuse(503, 'payments-not-configured')
  if (!input.signature || !deps.gateway.value.verifyWebhook(input.rawBody, input.signature)) {
    return refuse(401, 'bad-signature')
  }
  const parsed = parseRazorpayEvent(input.rawBody, input.eventId ?? '')
  if (!parsed.ok) {
    if (parsed.error.code === 'unsupported-event') {
      return { status: 200, body: { received: true, outcome: 'ignored' } }
    }
    return refuse(400, parsed.error.code)
  }
  let processed: Result<ProcessedEvent, PaymentError>
  try {
    processed = await deps.process(parsed.value)
  } catch (error) {
    deps.log.error(
      `Razorpay webhook ${parsed.value.type} failed (${error instanceof Error ? error.name : 'unknown error'}); Razorpay will retry.`,
    )
    return refuse(500, 'processing-failed')
  }
  if (!processed.ok) {
    deps.log.error(`Razorpay webhook ${parsed.value.type} failed (${processed.error.code}).`)
    return refuse(500, 'processing-failed')
  }
  try {
    await deps.afterCommit(processed.value.refundsToSend)
  } catch {
    // The refunds stay approved; the poll sends them (src/lib/payments/poll.ts).
  }
  return { status: 200, body: { received: true, outcome: processed.value.outcome } }
}
