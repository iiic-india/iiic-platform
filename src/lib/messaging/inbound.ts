import 'server-only'

import { createHash, timingSafeEqual } from 'node:crypto'

import { Webhook } from 'svix'
import { z } from 'zod'

import type { Result } from '@/lib/result'

import type { ProviderReport } from './operations'
import { isStopRequest, parseResendEvent, type WhatsAppNotice } from './webhooks'

/**
 * The providers' webhooks (docs/19 §4), apart from their routes so each answer has a test with
 * fakes: the signature first, then the body, then the work. Nothing of a body is logged or
 * echoed, and an inbound WhatsApp message's text is read for a stop request and dropped.
 *
 * Answers: 503 while the secret is unset (the platform builds and runs without it), 413 for a
 * body larger than a webhook's, 401 for a bad or missing signature, 400 for a body that cannot be
 * read, 200 for what was taken or is not taken (unknown ids, other event types), 500 on a fault,
 * so the provider tries again.
 */

export type WebhookAnswer = { status: number; body: Record<string, unknown> }

const answer = (status: number, body: Record<string, unknown>): WebhookAnswer => ({ status, body })

type Applied = Result<{ messageId: number; moved: boolean }, { code: 'unknown-message' }>

// ---- Resend (signed with Svix) ----

export type ResendWebhookInput = {
  rawBody: string | null
  svixId: string | null
  svixTimestamp: string | null
  svixSignature: string | null
}

export type ResendWebhookDeps = {
  secret: string | undefined
  apply: (report: ProviderReport) => Promise<Applied>
}

/**
 * Verified with `svix` against `RESEND_WEBHOOK_SECRET`: the id, the timestamp (five minutes'
 * tolerance, which also refuses an old replay) and the signature over the raw body.
 */
export async function handleResendWebhook(
  input: ResendWebhookInput,
  deps: ResendWebhookDeps,
): Promise<WebhookAnswer> {
  if (!deps.secret) return answer(503, { received: false, error: 'not-configured' })
  if (input.rawBody === null) return answer(413, { received: false, error: 'too-large' })
  if (!input.svixId || !input.svixTimestamp || !input.svixSignature) {
    return answer(401, { received: false, error: 'bad-signature' })
  }
  try {
    // Throws on a bad signature or a timestamp outside the tolerance; returns nothing (svix 2).
    new Webhook(deps.secret).verify(input.rawBody, {
      'svix-id': input.svixId,
      'svix-timestamp': input.svixTimestamp,
      'svix-signature': input.svixSignature,
    })
  } catch {
    return answer(401, { received: false, error: 'bad-signature' })
  }
  let body: unknown
  try {
    body = JSON.parse(input.rawBody)
  } catch {
    return answer(400, { received: false, error: 'unreadable' })
  }
  const parsed = parseResendEvent(body)
  if (!parsed.ok) return answer(400, { received: false, error: 'unreadable' })
  if (parsed.value.kind === 'ignored') return answer(200, { received: true, taken: false })
  try {
    const applied = await deps.apply(parsed.value.report)
    return answer(200, { received: true, taken: true, matched: applied.ok })
  } catch {
    return answer(500, { received: false, error: 'fault' })
  }
}

// ---- WhatsApp (AiSensy) ----

/** The shared secret's header (docs/19 §4, §10: AiSensy's own signature if its plan signs). */
export const WHATSAPP_SECRET_HEADER = 'x-webhook-secret'

/** Constant-time comparison over SHA-256 digests, so neither length nor prefix leaks. */
export function sameSecret(presented: string | null, secret: string): boolean {
  if (!presented) return false
  const a = createHash('sha256').update(presented, 'utf8').digest()
  const b = createHash('sha256').update(secret, 'utf8').digest()
  return timingSafeEqual(a, b)
}

/**
 * The WhatsApp Cloud API's webhook body, which AiSensy forwards (its own format is to be
 * confirmed on the plan, docs/07 and docs/19 §10): statuses of messages the platform sent, and
 * messages people sent. Only what the platform acts on is read.
 */
const cloudStatus = z.object({
  id: z.string().min(1).max(128),
  status: z.string().max(32),
  timestamp: z.string().max(20).optional(),
})
const cloudMessage = z.object({
  id: z.string().min(1).max(128),
  from: z.string().regex(/^\+?[1-9]\d{7,14}$/),
  timestamp: z.string().max(20).optional(),
  type: z.string().max(32).optional(),
  text: z
    .object({ body: z.string().max(4096) })
    .partial()
    .optional(),
  button: z
    .object({ text: z.string().max(256) })
    .partial()
    .optional(),
})
const cloudBody = z.object({
  entry: z
    .array(
      z.object({
        changes: z
          .array(
            z.object({
              value: z
                .object({
                  statuses: z.array(cloudStatus).max(100).optional(),
                  messages: z.array(cloudMessage).max(100).optional(),
                })
                .loose(),
            }),
          )
          .max(100),
      }),
    )
    .max(100),
})

const CLOUD_STATUS: Readonly<Record<string, ProviderReport['status']>> = {
  delivered: 'delivered',
  read: 'read',
  failed: 'failed',
}

const fromSeconds = (value: string | undefined, fallback: Date): Date => {
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : fallback
}

/** The body as notices, each with the provider's message id; null when it cannot be read. */
export function parseWhatsAppBody(
  body: unknown,
  now: Date,
): { notices: WhatsAppNotice[]; ids: string[] } | null {
  const parsed = cloudBody.safeParse(body)
  if (!parsed.success) return null
  const notices: WhatsAppNotice[] = []
  const ids: string[] = []
  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      for (const status of change.value.statuses ?? []) {
        const mapped = CLOUD_STATUS[status.status]
        if (!mapped) continue
        notices.push({
          kind: 'status',
          report: {
            provider: 'aisensy',
            providerMessageId: status.id,
            status: mapped,
            at: fromSeconds(status.timestamp, now),
          },
        })
        ids.push(status.id)
      }
      for (const message of change.value.messages ?? []) {
        const text = message.text?.body ?? message.button?.text ?? ''
        notices.push({
          kind: 'inbound',
          from: message.from.startsWith('+') ? message.from : `+${message.from}`,
          at: fromSeconds(message.timestamp, now),
          stop: isStopRequest(text),
        })
        ids.push(message.id)
      }
    }
  }
  return { notices, ids }
}

export type WhatsAppWebhookDeps = {
  secret: string | undefined
  now: () => Date
  apply: (report: ProviderReport) => Promise<Applied>
  /** A message from the person: the 24-hour window opens; a stop is honoured the same day. */
  inbound: (
    notice: Extract<WhatsAppNotice, { kind: 'inbound' }>,
    messageId: string,
  ) => Promise<void>
}

export async function handleWhatsAppWebhook(
  input: { rawBody: string | null; secretHeader: string | null },
  deps: WhatsAppWebhookDeps,
): Promise<WebhookAnswer> {
  if (!deps.secret) return answer(503, { received: false, error: 'not-configured' })
  if (input.rawBody === null) return answer(413, { received: false, error: 'too-large' })
  if (!sameSecret(input.secretHeader, deps.secret)) {
    return answer(401, { received: false, error: 'bad-signature' })
  }
  let body: unknown
  try {
    body = JSON.parse(input.rawBody)
  } catch {
    return answer(400, { received: false, error: 'unreadable' })
  }
  const parsed = parseWhatsAppBody(body, deps.now())
  if (!parsed) return answer(400, { received: false, error: 'unreadable' })
  try {
    let taken = 0
    for (const [index, notice] of parsed.notices.entries()) {
      if (notice.kind === 'status') {
        const applied = await deps.apply(notice.report)
        if (applied.ok) taken += 1
      } else {
        await deps.inbound(notice, parsed.ids[index] as string)
        taken += 1
      }
    }
    return answer(200, { received: true, taken })
  } catch {
    return answer(500, { received: false, error: 'fault' })
  }
}
