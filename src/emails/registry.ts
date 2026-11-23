import type { AutomationId } from '@/lib/automations/catalogue'
import type { Flags } from '@/lib/settings/flags'
import type { Channel, MessageKind, SenderKey } from '@/lib/messaging/types'

/**
 * Every message template of Release 1 (docs/06, "Message templates needed for launch"; docs/19 §7),
 * keyed, with what each may and may not carry. The core reads this before it renders anything:
 * the sender and reply-to, the kind (and so the consent check), whether a counselling booking's
 * message must carry the scope statement and the crisis numbers, whether a price may appear, and
 * which footer link it needs. The words are the builders' (written to src/brand/VOICE.md and
 * checked with /copy-check), the rules are here. Pure, free of `server-only`.
 */

/**
 * Price (D-21, D-24): `never`; `whenPublic`, only while `prices_public` is on; `ownPayment`, the
 * amount the person paid, is asked to pay by a link staff sent, or gets back (a receipt, a payment
 * link, a refund), which they see whatever the flag says (proposed, docs/19 §10).
 */
export type PriceRule = 'never' | 'whenPublic' | 'ownPayment'

/**
 * The footer link (docs/08 §3: a withdraw link in every message; docs/13 §5: one-click unsubscribe
 * on everything promotional): `withdraw`, the page listing the person's consents; `unsubscribe`,
 * with the List-Unsubscribe headers (RFC 8058); `none` for internal mail.
 */
export type FooterLink = 'withdraw' | 'unsubscribe' | 'none'

export type TemplateSpec = {
  key: string
  automations: readonly AutomationId[]
  channels: readonly Channel[]
  sender: SenderKey
  kind: MessageKind
  /** A counselling booking's message carries the scope statement and the crisis numbers. */
  counsellingScope: boolean
  /** No offer, bridge, story or cross-sell in any Release 1 message (docs/06, counselling guardrail). */
  offers: false
  price: PriceRule
  footer: FooterLink
  /** Who writes it (docs/19 §9). */
  builder: 'A' | 'B' | 'C'
}

export const TEMPLATES = [
  // ---- Bookings (builder B) ----
  t('booking-confirmed', ['B2'], ['email', 'whatsapp'], 'bookings', 'transactional', {
    counsellingScope: true,
    price: 'whenPublic',
  }),
  t('booking-receipt', ['B3'], ['email'], 'bookings', 'transactional', { price: 'ownPayment' }),
  t('consent-receipt', ['B3a'], ['email'], 'bookings', 'transactional', {}),
  t('reminder-24h', ['B5'], ['whatsapp', 'email'], 'bookings', 'transactional', {
    counsellingScope: true,
  }),
  t('reminder-short', ['B6'], ['whatsapp'], 'bookings', 'transactional', { counsellingScope: true }),
  t('booking-rescheduled', ['B7'], ['email', 'whatsapp'], 'bookings', 'transactional', {
    counsellingScope: true,
  }),
  t('booking-cancelled', ['B7'], ['email', 'whatsapp'], 'bookings', 'transactional', {}),
  t('refund-processed', ['B7'], ['email'], 'bookings', 'transactional', { price: 'ownPayment' }),
  t('booking-change-staff', ['B7', 'B10'], ['email'], 'platform', 'internal', { footer: 'none' }),
  t('feedback-request', ['B8'], ['email', 'whatsapp'], 'bookings', 'transactional', {}),
  t('no-show', ['B9'], ['email'], 'bookings', 'transactional', {}),
  t('slot-lost', ['B10'], ['email', 'whatsapp'], 'bookings', 'transactional', {
    price: 'ownPayment',
  }),
  t('time-request-received', ['B12'], ['email', 'whatsapp'], 'bookings', 'transactional', {}),
  t('payment-link', ['B13'], ['email', 'whatsapp'], 'bookings', 'operator', {
    price: 'ownPayment',
  }),
  t('payment-link-reminder', ['B13'], ['email'], 'bookings', 'operator', {
    price: 'ownPayment',
  }),
  // ---- Pipeline (builder C, waits on M4) ----
  t('team-map-ack', ['P1'], ['email'], 'hello', 'transactional', {}, 'C'),
  t('partnership-ack', ['P7'], ['email'], 'hello', 'transactional', {}, 'C'),
  t('proposal-sent', ['P5'], ['email'], 'hello', 'transactional', {}, 'C'),
  // ---- Newsletter (builder C) ----
  t('newsletter-confirm', ['N1'], ['email'], 'journal', 'transactional', { footer: 'none' }, 'C'),
  t('newsletter-welcome', ['N2'], ['email'], 'journal', 'promotional', { footer: 'unsubscribe' }, 'C'),
  t('newsletter-issue', ['N4'], ['email'], 'journal', 'promotional', { footer: 'unsubscribe' }, 'C'),
  // ---- Privacy, reviews and certificates (builder C) ----
  t('data-request-ack', ['O4'], ['email'], 'hello', 'transactional', {}, 'C'),
  t('complaint-ack', ['O7'], ['email'], 'hello', 'transactional', {}, 'C'),
  t('privacy-deadline', ['O4', 'O7'], ['email'], 'platform', 'internal', { footer: 'none' }, 'C'),
  t('review-consent-request', ['V1'], ['email'], 'hello', 'operator', {}, 'C'),
  t('review-consent-reminder', ['V1'], ['email'], 'hello', 'operator', {}, 'C'),
  t('review-withdrawal-confirmed', ['V2'], ['email'], 'hello', 'transactional', {}, 'C'),
  t('certificate-issued', ['C5'], ['email'], 'hello', 'transactional', {}, 'C'),
  // ---- Internal (builders A and C) ----
  t('daily-digest', ['O1'], ['email'], 'platform', 'internal', { footer: 'none' }, 'C'),
  t('weekly-report', ['O2', 'O10'], ['email'], 'platform', 'internal', { footer: 'none' }, 'C'),
  t('incident-alert', ['O8'], ['email'], 'platform', 'internal', { footer: 'none' }, 'C'),
  t('backup-alert', ['O6'], ['email'], 'platform', 'internal', { footer: 'none' }, 'C'),
  t('failure-alert', ['O3'], ['email'], 'platform', 'internal', { footer: 'none' }, 'A'),
] as const satisfies readonly TemplateSpec[]

export type TemplateKey = (typeof TEMPLATES)[number]['key']

export const TEMPLATE_KEYS = TEMPLATES.map((spec) => spec.key) as TemplateKey[]

export function templateSpec(key: TemplateKey): TemplateSpec {
  return TEMPLATES.find((spec) => spec.key === key) as TemplateSpec
}

/** Whether a template may show a price now (D-21, D-24). */
export function priceAllowed(key: TemplateKey, flags: Pick<Flags, 'pricesPublic'>): boolean {
  const rule = templateSpec(key).price
  return rule === 'ownPayment' || (rule === 'whenPublic' && flags.pricesPublic)
}

/**
 * WhatsApp utility templates must name the person's own booking (docs/06, Engine rules); only
 * these keys are submitted to Meta for Release 1 (docs/06's list of eight).
 */
export const WHATSAPP_TEMPLATE_KEYS = [
  'booking-confirmed',
  'reminder-24h',
  'reminder-short',
  'booking-rescheduled',
  'booking-cancelled',
  'feedback-request',
  'time-request-received',
  'payment-link',
] as const satisfies readonly TemplateKey[]

function t<K extends string, A extends AutomationId>(
  key: K,
  automations: readonly A[],
  channels: readonly Channel[],
  sender: SenderKey,
  kind: MessageKind,
  options: { counsellingScope?: boolean; price?: PriceRule; footer?: FooterLink },
  builder: 'A' | 'B' | 'C' = 'B',
) {
  return {
    key,
    automations,
    channels,
    sender,
    kind,
    counsellingScope: options.counsellingScope ?? false,
    offers: false as const,
    price: options.price ?? 'never',
    footer: options.footer ?? (kind === 'promotional' ? 'unsubscribe' : 'withdraw'),
    builder,
  }
}
