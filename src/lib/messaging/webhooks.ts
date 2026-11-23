import { z } from 'zod'

import { err, ok, type Result } from '@/lib/result'

import type { ProviderReport } from './operations'

/**
 * What the providers' webhooks may tell the platform, parsed with Zod after the signature has
 * been verified (docs/19 §4). Only the fields the platform acts on are read; the rest of the body
 * (addresses, subjects) is neither stored nor logged. Builder A writes the routes
 * (`/api/webhooks/resend`, `/api/webhooks/whatsapp`) around these.
 */

/** Resend's email events (signed with Svix: `svix-id`, `svix-timestamp`, `svix-signature`). */
const resendEvent = z.object({
  type: z.string().min(1).max(64),
  created_at: z.string().optional(),
  data: z
    .object({
      email_id: z.string().min(1).max(128).optional(),
      created_at: z.string().optional(),
      bounce: z.object({ type: z.string().max(64).optional() }).partial().optional(),
    })
    .loose(),
})

const RESEND_STATUS: Readonly<Record<string, ProviderReport['status']>> = {
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.failed': 'failed',
}

export type ParsedResendEvent =
  | { kind: 'report'; report: ProviderReport }
  | { kind: 'ignored'; type: string }

/**
 * A verified Resend event as a report on one message, or `ignored` for every other type (sent,
 * delayed, opened, clicked, contacts, domains): open tracking is off everywhere (docs/13 §5).
 */
export function parseResendEvent(body: unknown): Result<ParsedResendEvent, { code: 'unreadable' }> {
  const parsed = resendEvent.safeParse(body)
  if (!parsed.success) return err({ code: 'unreadable' })
  const { type, data, created_at } = parsed.data
  const status = RESEND_STATUS[type]
  if (!status) return ok({ kind: 'ignored', type })
  if (!data.email_id) return err({ code: 'unreadable' })
  const at = new Date(created_at ?? data.created_at ?? Number.NaN)
  const report: ProviderReport = {
    provider: 'resend',
    providerMessageId: data.email_id,
    status,
    at: Number.isNaN(at.getTime()) ? new Date() : at,
    ...(status === 'bounced'
      ? { bounce: data.bounce?.type === 'Permanent' ? 'permanent' : 'transient' }
      : {}),
  }
  return ok({ kind: 'report', report })
}

/**
 * What the WhatsApp provider tells the platform, once normalised (AiSensy's webhook format is to
 * be confirmed with the plan, docs/07; builder A writes the adapter): a status for a message the
 * platform sent, or a message the person sent, which opens the 24-hour window and may ask to stop.
 * The text of an inbound message is read for a stop request and never stored.
 */
export type WhatsAppNotice =
  | { kind: 'status'; report: ProviderReport }
  | { kind: 'inbound'; from: string; at: Date; stop: boolean }

/** The plain requests to stop that are honoured at once (docs/13 §7); anything else is a person's to read. */
const STOP_WORDS = new Set(['stop', 'unsubscribe', 'stop all', 'opt out', 'optout', 'cancel all'])

export function isStopRequest(text: string): boolean {
  const words = text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return STOP_WORDS.has(words)
}
