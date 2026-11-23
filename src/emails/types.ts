import type { PayloadRequest } from 'payload'
import type { ReactElement } from 'react'
import type { z } from 'zod'

import type { Recipient, Subject } from '@/lib/messaging/types'
import type { Result } from '@/lib/result'

import type { FrameFooter } from './components/Frame'
import type { TemplateKey } from './registry'

/**
 * The contract every template implements (docs/19 §7). A template's data is read when the message
 * is sent (`load`), from the records the message is about, never stored with the message; it is
 * validated with the template's schema before anything is rendered. The words live in the
 * template's file (one place per locale, `en-IN`), written to src/brand/VOICE.md; an approved
 * override from Admin → Messages → Templates replaces the subject, preheader and body lines.
 */

/** What every email gets from the core: the site, the hosted images, the footer. */
export type EmailContext = {
  siteUrl: string
  assetUrl: string
  footer: FrameFooter
  /** Whether a price may be shown (src/emails/registry.ts `priceAllowed`). */
  priceAllowed: boolean
}

export type EmailTemplate<Data> = {
  key: TemplateKey
  schema: z.ZodType<Data>
  subject: (data: Data) => string
  preheader: (data: Data) => string
  /** The email as React Email elements inside the Frame (src/emails/components/Frame.tsx). */
  element: (data: Data, context: EmailContext) => ReactElement
}

/** A WhatsApp template's variables, in the order the approved template numbers them. */
export type WhatsAppTemplate<Data> = {
  key: TemplateKey
  schema: z.ZodType<Data>
  params: (data: Data) => string[]
}

export type LoadError =
  /** What the message was about has changed (a booking moved or cancelled): not sent. */
  | { code: 'stale' }
  | { code: 'not-found' }

/**
 * Reads a template's data for one message at send time: the booking, the person's first name,
 * the manage link. Answers `stale` when the subject no longer matches what was planned, so a
 * reminder for a moved booking is never sent even if its cancellation was missed.
 */
export type LoadTemplateData<Data> = (
  req: PayloadRequest,
  message: { subject: Subject; recipient: Recipient; sendBefore?: Date | null },
) => Promise<Result<Data, LoadError>>

/** One template's implementation, as builders B and C register it (src/emails/index.ts). */
export type TemplateImplementation<Data = unknown> = {
  load: LoadTemplateData<Data>
  email?: EmailTemplate<Data>
  whatsapp?: WhatsAppTemplate<Data>
}

export type TemplateImplementations = Partial<Record<TemplateKey, TemplateImplementation<never>>>

/** A rendered email: always a plain-text part (docs/13 §5). */
export type RenderedEmail = { subject: string; preheader: string; html: string; text: string }
