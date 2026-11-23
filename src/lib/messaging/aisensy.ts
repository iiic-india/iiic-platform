import 'server-only'

import { z } from 'zod'

import { err, ok, type Result } from '@/lib/result'

import type { OutgoingWhatsApp, SendError, SendErrorCode, Sent, WhatsAppSender } from './channels'
import { isRetryable } from './channels'

/**
 * WhatsApp through AiSensy's campaign API (D-06, docs/07, docs/19 §3): one call per message, to
 * one live API campaign, which names one approved template (`templateName` is the campaign's name
 * in AiSensy). AiSensy takes no idempotency key, so the core never resends a WhatsApp message
 * whose answer did not come back (it becomes `unknown`). AiSensy requires a contact name; the
 * platform sends a neutral one, so no client's name is stored with the provider. The answer's
 * format is to be confirmed with the plan (docs/19 §10); anything but a clear success is a code.
 */

const ENDPOINT = 'https://backend.aisensy.com/campaign/t1/api/v2'
const TIMEOUT_MS = 15_000

/** The contact name AiSensy requires; never a person's name. */
export const AISENSY_CONTACT_NAME = 'IIIC contact'

const answer = z
  .object({
    success: z.union([z.boolean(), z.string()]).optional(),
    submitted_message_id: z.string().min(1).max(128).optional(),
    messageId: z.string().min(1).max(128).optional(),
  })
  .loose()

type Fetch = typeof fetch

export function aisensyErrorCode(status: number): SendErrorCode {
  if (status === 429) return 'rate-limited'
  if (status >= 500) return 'unavailable'
  if (status === 400) return 'invalid-recipient'
  return 'rejected'
}

const failure = (code: SendErrorCode): SendError => ({ code, retryable: isRetryable(code) })

/** E.164 (`+919876543210`) as AiSensy's destination: the digits with the country code. */
export function destinationOf(e164: string): string | null {
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164.slice(1) : null
}

export class AiSensyWhatsAppSender implements WhatsAppSender {
  readonly provider = 'aisensy' as const

  constructor(
    private readonly apiKey: string,
    private readonly fetcher: Fetch = fetch,
  ) {}

  async sendTemplate(message: OutgoingWhatsApp): Promise<Result<Sent, SendError>> {
    const destination = destinationOf(message.to)
    if (!destination) return err(failure('invalid-recipient'))
    let response: Response
    try {
      response = await this.fetcher(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: this.apiKey,
          campaignName: message.templateName,
          destination,
          userName: AISENSY_CONTACT_NAME,
          templateParams: message.params,
          source: 'platform',
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch {
      // No answer: the request may have reached AiSensy, which takes no idempotency key, so it is
      // not retried; the core marks an unretryable `unavailable` as `unknown` (at most once).
      return err({ code: 'unavailable', retryable: false })
    }
    if (!response.ok) return err(failure(aisensyErrorCode(response.status)))
    const parsed = answer.safeParse(await response.json().catch(() => null))
    const id = parsed.success
      ? (parsed.data.submitted_message_id ?? parsed.data.messageId)
      : undefined
    const succeeded =
      parsed.success && parsed.data.success !== false && parsed.data.success !== 'false'
    if (!succeeded) return err(failure('rejected'))
    // Without an id from AiSensy, the message's own key stands in, so the row still has one.
    return ok({ providerMessageId: id ?? `aisensy:${message.idempotencyKey}`.slice(0, 128) })
  }
}
