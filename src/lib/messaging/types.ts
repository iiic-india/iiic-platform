/**
 * The words of the messaging core (docs/19 §3): channels, kinds, statuses and the reasons a
 * message is not sent. Pure, free of `server-only`: the collections (src/collections/Messages.ts)
 * build their options from these lists, and the Payload CLI loads the collections.
 */

/** The channels the platform sends on in Release 1 (SMS waits on D-08). */
export const CHANNELS = [
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
] as const
export type Channel = (typeof CHANNELS)[number]['value']

/**
 * Why a message may be sent (docs/06, Engine rules: Consent; docs/08 §3):
 * - `transactional`: about something the person booked or asked for (confirmations, reminders,
 *   receipts, acknowledgements); goes to anyone who booked or asked;
 * - `promotional`: needs the matching consent in force (`marketingEmail`, `marketingWhatsapp`)
 *   and is never sent to someone under 18;
 * - `operator`: sent by a staff action about the person's own record (V1's consent request, B13's
 *   payment link), once, with the action audited;
 * - `internal`: to staff (digests, reports, alerts), never to a client.
 */
export const MESSAGE_KINDS = [
  { value: 'transactional', label: 'Transactional' },
  { value: 'promotional', label: 'Promotional' },
  { value: 'operator', label: 'Sent by staff' },
  { value: 'internal', label: 'Internal' },
] as const
export type MessageKind = (typeof MESSAGE_KINDS)[number]['value']

/**
 * A message's life (docs/04 `message_log` status, widened; docs/19 §3). `queued` waits for its
 * time (`sendAt`); `sending` is claimed by one runner; the provider then reports `delivered`,
 * `read`, `bounced` or `complained`. `unknown` is a send whose answer never came back (the
 * function died after the provider took it): never sent again on its own. The final states are
 * failed, skipped, cancelled, bounced, complained and unknown; staff may queue a failed or unknown
 * one again from the log.
 */
export const MESSAGE_STATUSES = [
  { value: 'queued', label: 'Queued' },
  { value: 'sending', label: 'Sending' },
  { value: 'sent', label: 'Sent' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'read', label: 'Read' },
  { value: 'failed', label: 'Failed' },
  { value: 'bounced', label: 'Bounced' },
  { value: 'complained', label: 'Marked as spam' },
  { value: 'skipped', label: 'Not sent' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'unknown', label: 'Outcome unknown' },
] as const
export type MessageStatus = (typeof MESSAGE_STATUSES)[number]['value']

/** Why a message was not sent, or not on its first channel: codes, never details. */
export const SKIP_REASONS = [
  { value: 'paused', label: 'The automation is paused' },
  { value: 'no-address', label: 'No address for this channel' },
  { value: 'suppressed', label: 'The address bounced, complained or asked to stop' },
  { value: 'no-consent', label: 'No consent in force for this purpose' },
  { value: 'under-18', label: 'Nothing promotional to anyone under 18' },
  { value: 'not-configured', label: 'The channel is not set up here' },
  { value: 'template-not-approved', label: 'The WhatsApp template is not approved' },
  { value: 'window-closed', label: 'No open WhatsApp conversation' },
  { value: 'too-late', label: 'Its time had passed' },
  { value: 'quiet-hours-late', label: 'Quiet hours would delay it past its use' },
  { value: 'stale', label: 'What it was about changed' },
  { value: 'price-hidden', label: 'It would show a price while prices are hidden' },
] as const
export type SkipReason = (typeof SKIP_REASONS)[number]['value']

/**
 * The sending identities (docs/13 §1, §3): who a message is from and where replies go. The
 * addresses are built from the mail domain (src/lib/messaging/senders.ts).
 */
export const SENDER_KEYS = ['bookings', 'hello', 'platform', 'journal'] as const
export type SenderKey = (typeof SENDER_KEYS)[number]

/**
 * What a message is about: a record by collection and id, never its content. Collections of M4
 * and M5 are named already, so their automations need no change here when they arrive.
 */
export const SUBJECT_COLLECTIONS = [
  'bookings',
  'payments',
  'refunds',
  'invoices',
  'testimonials',
  'consents',
  'people',
  'subscribers',
  'newsletter-issues',
  'messages',
  'suppressions',
  'users',
  // M4 (docs/04): the pipeline.
  'leads',
  'proposals',
  // M5 (docs/04): certificates and privacy.
  'certificates',
  'data-requests',
  'incidents',
] as const
export type SubjectCollection = (typeof SUBJECT_COLLECTIONS)[number]
export type Subject = { collection: SubjectCollection; id: number }

/**
 * Who receives it: a person (clients), a newsletter subscriber who may not be a person yet, or
 * a staff account (internal messages). The address is read when the message is sent, never
 * copied into the log.
 */
export type Recipient =
  | { kind: 'person'; id: number }
  | { kind: 'subscriber'; id: number }
  | { kind: 'staff'; id: number }

/** Suppression reasons (src/collections/Suppressions.ts; docs/13 §6, §7). */
export const SUPPRESSION_REASONS = [
  { value: 'hardBounce', label: 'Hard bounce' },
  { value: 'complaint', label: 'Marked as spam' },
  { value: 'whatsappStop', label: 'Asked to stop on WhatsApp' },
  { value: 'manual', label: 'Recorded by staff' },
] as const
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number]['value']
