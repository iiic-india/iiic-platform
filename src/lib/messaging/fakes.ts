import { err, ok, type Result } from '@/lib/result'

import type {
  EmailSender,
  OutgoingEmail,
  OutgoingWhatsApp,
  SendError,
  SendErrorCode,
  Sent,
  WhatsAppSender,
} from './channels'
import { isRetryable } from './channels'

/**
 * In-memory senders for tests and local development (`MESSAGING_TRANSPORT=fake`), as the fake
 * gateway and the fake calendar are for M3. They keep what they were given, answer with ids of
 * their own, honour the idempotency key as Resend does (the same key returns the first answer and
 * sends nothing), and can be told to fail the next sends.
 */

class Script {
  private failures: SendErrorCode[] = []

  failNext(...codes: SendErrorCode[]): void {
    this.failures.push(...codes)
  }

  take(): SendError | null {
    const code = this.failures.shift()
    return code ? { code, retryable: isRetryable(code) } : null
  }
}

export class FakeEmailSender implements EmailSender {
  readonly provider = 'fake' as const
  readonly sent: (OutgoingEmail & { providerMessageId: string })[] = []
  private readonly byKey = new Map<string, Sent>()
  private readonly script = new Script()

  failNext(...codes: SendErrorCode[]): void {
    this.script.failNext(...codes)
  }

  async send(message: OutgoingEmail): Promise<Result<Sent, SendError>> {
    const earlier = this.byKey.get(message.idempotencyKey)
    if (earlier) return ok(earlier)
    const failure = this.script.take()
    if (failure) return err(failure)
    const answer = { providerMessageId: `fake-email-${this.sent.length + 1}` }
    this.byKey.set(message.idempotencyKey, answer)
    this.sent.push({ ...message, ...answer })
    return ok(answer)
  }
}

export class FakeWhatsAppSender implements WhatsAppSender {
  readonly provider = 'fake' as const
  readonly sent: (OutgoingWhatsApp & { providerMessageId: string })[] = []
  private readonly script = new Script()

  failNext(...codes: SendErrorCode[]): void {
    this.script.failNext(...codes)
  }

  async sendTemplate(message: OutgoingWhatsApp): Promise<Result<Sent, SendError>> {
    const failure = this.script.take()
    if (failure) return err(failure)
    const answer = { providerMessageId: `fake-whatsapp-${this.sent.length + 1}` }
    this.sent.push({ ...message, ...answer })
    return ok(answer)
  }
}

/** A channel that is not set up: every send answers `not-configured` (no keys, a preview). */
export const NOT_CONFIGURED_EMAIL: EmailSender = {
  provider: 'resend',
  send: async () => err({ code: 'not-configured', retryable: false }),
}

export const NOT_CONFIGURED_WHATSAPP: WhatsAppSender = {
  provider: 'aisensy',
  sendTemplate: async () => err({ code: 'not-configured', retryable: false }),
}
