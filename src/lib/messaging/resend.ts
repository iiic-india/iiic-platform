import 'server-only'

import { z } from 'zod'

import { err, ok, type Result } from '@/lib/result'

import type { EmailSender, OutgoingEmail, SendError, SendErrorCode, Sent } from './channels'
import { isRetryable } from './channels'

/**
 * Email through Resend's REST API (docs/07, docs/19 §3), with `fetch` and nothing else: one call
 * per message, the message's dedupe key as `Idempotency-Key` (a repeat within 24 hours returns the
 * first answer and sends nothing), tags with the automation id and the template key only. Open and
 * click tracking are settings of the sending domain in Resend, kept off on `notify.` (docs/13 §5).
 * A refusal is a code; neither the provider's message nor anything of the email is logged.
 */

const ENDPOINT = 'https://api.resend.com/emails'
const TIMEOUT_MS = 15_000

const answer = z.object({ id: z.string().min(1).max(128) })

type Fetch = typeof fetch

/** Resend's answer as one of the core's codes (docs/19 §3: retry only what may pass next time). */
export function resendErrorCode(status: number, name?: string): SendErrorCode {
  if (status === 429) return 'rate-limited'
  if (status >= 500) return 'unavailable'
  // Two calls with one key at once: the first is still being sent, so try again later.
  if (status === 409 && name === 'concurrent_idempotent_requests') return 'unavailable'
  if (status === 422 && name === 'validation_error') return 'invalid-recipient'
  return 'rejected'
}

const failure = (code: SendErrorCode): SendError => ({ code, retryable: isRetryable(code) })

/** Resend's tag values take letters, digits, underscores and dashes only. */
const tagValue = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 256)

export class ResendEmailSender implements EmailSender {
  readonly provider = 'resend' as const

  constructor(
    private readonly apiKey: string,
    private readonly fetcher: Fetch = fetch,
  ) {}

  async send(message: OutgoingEmail): Promise<Result<Sent, SendError>> {
    const body = {
      from: message.from,
      to: [message.to],
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.headers ? { headers: message.headers } : {}),
      tags: message.tags.map((tag) => ({ name: tagValue(tag.name), value: tagValue(tag.value) })),
      ...(message.attachments?.length
        ? {
            attachments: message.attachments.map((file) => ({
              filename: file.filename,
              content: file.contentBase64,
              content_type: file.contentType,
            })),
          }
        : {}),
    }
    let response: Response
    try {
      response = await this.fetcher(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': message.idempotencyKey.slice(0, 256),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch {
      return err(failure('unavailable'))
    }
    if (!response.ok) {
      const name = await response
        .json()
        .then((value: unknown) =>
          value && typeof value === 'object' && 'name' in value ? String(value.name) : undefined,
        )
        .catch(() => undefined)
      return err(failure(resendErrorCode(response.status, name)))
    }
    const parsed = answer.safeParse(await response.json().catch(() => null))
    // Resend took it but its answer is unreadable: a retry under the same key sends nothing new
    // and returns the first answer, with its id.
    if (!parsed.success) return err(failure('unavailable'))
    return ok({ providerMessageId: parsed.data.id })
  }
}
