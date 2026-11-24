import type { PayloadRequest } from 'payload'

import type { TemplateKey } from '@/emails/registry'
import type { AutomationId } from '@/lib/automations/catalogue'
import type { Result } from '@/lib/result'

import type {
  Channel,
  MessageStatus,
  Recipient,
  SkipReason,
  Subject,
  SuppressionReason,
} from './types'

/**
 * The messaging core's contracts (docs/19 §3). Builder A implements them in `src/lib/messaging/`
 * (`deliver.ts`, `dispatch.ts`, `suppress.ts`, `channelsFor.ts`, `resend.ts`, `aisensy.ts`,
 * `links.ts`), `server-only`; builders B and C only call them. Every function takes the request,
 * so it runs in the caller's transaction where it writes, and returns a typed Result.
 */

/** What an automation asks the core to send. No body and no address: both are read at send time. */
export type PlannedMessage = {
  automation: AutomationId
  template: TemplateKey
  /** The first channel to try; `fallback` when it cannot carry it (WhatsApp → email). */
  channel: Channel
  fallback?: Channel
  recipient: Recipient
  subject: Subject
  /** Distinguishes two messages of one automation about one subject (e.g. `reminder`). */
  variant?: string
  /** When it is due; now for "at once". Quiet hours are applied by the core, not the caller. */
  sendAt: Date
  /** Useless from this moment (a reminder: its session's start). */
  sendBefore?: Date | null
  /** WhatsApp only inside a conversation the person opened in the last 24 hours (V1). */
  requiresOpenWindow?: boolean
}

export type PlanError =
  { code: 'unknown-template' } | { code: 'channel-not-allowed' } | { code: 'recipient-missing' }

/**
 * What only the caller holds for the first try (src/emails/types.ts, `transient`): never written
 * to the row, the job queue or a log; a later try goes without it.
 */
/**
 * `transient`: values given to the first try only, never stored. `queueOnly`: record the row and
 * leave the sending to the dispatcher, even when it is due now (a run that plans many, as N4 does,
 * must not send them one by one inside its own job).
 */
export type DeliverOptions = { transient?: Readonly<Record<string, string>>; queueOnly?: boolean }

/**
 * Records the message (one row in `messages`, key from `messageKey`) and, when it is due now,
 * tries it at once; a key already recorded returns that row and sends nothing (fires once).
 * The attempt happens after the row's claim has committed (docs/19 §3: claim, commit, send).
 */
export type Deliver = (
  req: PayloadRequest,
  planned: PlannedMessage,
  options?: DeliverOptions,
) => Promise<Result<{ messageId: number; created: boolean; status: MessageStatus }, PlanError>>

/**
 * Cancels the queued messages about a subject (all of them, or those of some automations):
 * a reschedule cancels the old booking's reminders before the new booking's are planned, a
 * cancellation cancels them all, a payment cancels the payment link's reminder. Returns how many.
 */
export type CancelQueued = (
  req: PayloadRequest,
  scope: { subject: Subject; automations?: readonly AutomationId[] },
) => Promise<number>

/** One run of `messages-dispatch`: what it sent, deferred, skipped, failed and found stale. */
export type DispatchSummary = {
  sent: number
  deferred: number
  skipped: number
  failed: number
  retried: number
  unknown: number
}
/**
 * How long one dispatch may keep taking new messages: past it, the run ends after the message in
 * hand and the next minute takes the rest. `clock` is passed in so the tests need not wait.
 */
export type DispatchBudget = { ms: number; clock?: () => number }

export type Dispatch = (
  req: PayloadRequest,
  now: Date,
  limit: number,
  budget?: DispatchBudget,
) => Promise<DispatchSummary>

/** A provider's report about a message, from a verified webhook (docs/19 §4). */
export type ProviderReport = {
  provider: 'resend' | 'aisensy'
  providerMessageId: string
  status: Extract<MessageStatus, 'delivered' | 'read' | 'bounced' | 'complained' | 'failed'>
  at: Date
  /** For bounces: Resend's bounce type; only `Permanent` suppresses the address. */
  bounce?: 'permanent' | 'transient'
  /**
   * For a bounce or a complaint: the address the provider tried, which is what is suppressed (the
   * person's address may have changed since). Used for the suppression only, never logged.
   */
  address?: string
}

/** Applies a report: moves the message forward only (src/lib/messaging/states.ts), suppresses. */
export type ApplyReport = (
  req: PayloadRequest,
  report: ProviderReport,
) => Promise<Result<{ messageId: number; moved: boolean }, { code: 'unknown-message' }>>

/** Adds an address to the suppression list (unique per channel and address) and emits O9's event. */
export type Suppress = (
  req: PayloadRequest,
  entry: {
    channel: Channel
    address: string
    reason: SuppressionReason
    personId?: number
    source: 'resend' | 'whatsapp' | 'staff'
  },
) => Promise<{ suppressionId: number; created: boolean }>

/** The outcome codes a message can end with, for the log and Today. */
export type MessageOutcome = { status: MessageStatus; reason?: SkipReason; error?: string }

/**
 * The message's unique key: `<automation>:<collection>:<id>[:<variant>]:<channel>`. The fallback
 * on email gets a key of its own, so it is sent once too.
 */
export function messageKey(input: {
  automation: AutomationId
  subject: Subject
  variant?: string
  channel: Channel
}): string {
  const variant = input.variant ? `:${input.variant}` : ''
  return `${input.automation}:${input.subject.collection}:${input.subject.id}${variant}:${input.channel}`
}

/**
 * Signed links in messages (docs/19 §7): the withdraw and unsubscribe page, the newsletter's
 * confirmation. Builder A signs them with `jose` (HS256) under a key derived from PAYLOAD_SECRET
 * for this purpose alone; nothing is stored for a withdraw link, a confirmation keeps its hash.
 */
export type LinkPurpose = 'withdraw' | 'unsubscribe' | 'confirmSubscription'
export type SignLink = (input: {
  purpose: LinkPurpose
  subjectId: number
  expiresInDays: number
}) => Promise<string>
export type VerifyLink = (
  purpose: LinkPurpose,
  token: string,
) => Promise<Result<{ subjectId: number }, { code: 'invalid' | 'expired' }>>
