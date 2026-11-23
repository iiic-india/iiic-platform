import type { Result } from '@/lib/result'

/**
 * One sender per channel behind an interface (docs/19 §3), so the core never knows which provider
 * carries a message and tests run on the fakes (src/lib/messaging/fakes.ts). Builder A writes the
 * real ones: Resend over its REST API (`resend.ts`) and AiSensy's campaign API (`aisensy.ts`),
 * each `server-only`, each answering `not-configured` while its settings are missing, so the app
 * builds, runs and tests without them.
 */

/** A rendered email, ready for the provider. Bodies are never logged or stored. */
export type OutgoingEmail = {
  /** `Name <address>`, from src/lib/messaging/senders.ts. */
  from: string
  to: string
  replyTo?: string
  subject: string
  html: string
  /** Always present (docs/13 §5, §6). */
  text: string
  /** List-Unsubscribe and List-Unsubscribe-Post on promotional mail (RFC 8058). */
  headers?: Record<string, string>
  /**
   * The message's dedupe key: sent as Resend's `Idempotency-Key`, so a retry within 24 hours
   * after an answer that never arrived is not sent twice.
   */
  idempotencyKey: string
  /** Resend's tags: the automation id and the template key, never anything personal. */
  tags: { name: string; value: string }[]
  /** `.ics` invites (M3's builder), PDFs by link rather than attached where possible. */
  attachments?: { filename: string; contentType: string; contentBase64: string }[]
}

/** A WhatsApp template message (docs/13 §7): approved templates only outside the 24 h window. */
export type OutgoingWhatsApp = {
  /** E.164 (CLAUDE.md #8). */
  to: string
  /** The provider's name for the approved template (or campaign) in `message-templates`. */
  templateName: string
  language: string
  /** The template's variables, in order. */
  params: string[]
  idempotencyKey: string
}

export type SendErrorCode =
  | 'not-configured'
  | 'invalid-recipient'
  | 'rejected'
  | 'rate-limited'
  | 'unavailable'

/** A provider's refusal, as a code; `retryable` decides between a retry and a final failure. */
export type SendError = { code: SendErrorCode; retryable: boolean }

export type Sent = { providerMessageId: string }

export interface EmailSender {
  readonly provider: 'resend' | 'fake'
  send(message: OutgoingEmail): Promise<Result<Sent, SendError>>
}

export interface WhatsAppSender {
  readonly provider: 'aisensy' | 'fake'
  sendTemplate(message: OutgoingWhatsApp): Promise<Result<Sent, SendError>>
}

export type Channels = { email: EmailSender; whatsapp: WhatsAppSender }

/** Which provider errors are worth another try (docs/06: three retries with backoff). */
export function isRetryable(code: SendErrorCode): boolean {
  return code === 'rate-limited' || code === 'unavailable'
}
