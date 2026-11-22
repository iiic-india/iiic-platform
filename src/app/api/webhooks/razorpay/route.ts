import { createLocalReq, getPayload } from 'payload'

import { env } from '@/lib/env'
import { gatewayFor } from '@/lib/payments/gatewayFor'
import { handleRazorpayWebhook } from '@/lib/payments/webhookHandler'
import { payments } from '@/lib/payments/wiring'
import config from '@payload-config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }

/** Razorpay's webhook bodies are a few kilobytes; anything far larger is not one. */
const MAX_BODY_BYTES = 64 * 1024

/** The raw body as sent, or null when it is larger than a webhook's can be. */
async function readRawBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BODY_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * POST /api/webhooks/razorpay (docs/16 §5): Razorpay's events. No sign-in: the caller is
 * Razorpay, proved by the signature over the raw body, which is checked before anything else
 * (docs/08 §9). Each event is processed once by its id; see src/lib/payments/webhookHandler.ts
 * for every answer. Nothing from the body is logged or echoed.
 */
export async function POST(request: Request) {
  const rawBody = await readRawBody(request)
  if (rawBody === null) {
    return Response.json({ received: false, error: 'too-large' }, { status: 413, headers: HEADERS })
  }
  const payload = await getPayload({ config })
  const operations = payments()
  const answer = await handleRazorpayWebhook(
    {
      rawBody,
      signature: request.headers.get('x-razorpay-signature'),
      eventId: request.headers.get('x-razorpay-event-id'),
    },
    {
      gateway: gatewayFor(env()),
      process: async (event) =>
        operations.processGatewayEvent(await createLocalReq({}, payload), event, 'webhook'),
      afterCommit: (refundIds) => operations.sendRefunds(payload, refundIds),
      log: {
        info: (message) => payload.logger.info(message),
        error: (message) => payload.logger.error(message),
      },
    },
  )
  return Response.json(answer.body, { status: answer.status, headers: HEADERS })
}
