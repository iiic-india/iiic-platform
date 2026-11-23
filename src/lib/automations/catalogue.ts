import type { AutomationEventName } from './events'

/**
 * Every Release 1 automation of docs/06, as data (docs/19 §5): what starts it, when, on which
 * channels, why it may reach the person, the task that runs it and who builds it. The listeners
 * (src/lib/automations/listeners.ts), the schedules (schedules.ts), the automations collection's
 * rows and the tests all read this one table, so an automation is added or moved here and nowhere
 * else. Pure, free of `server-only`.
 */

/** The channels of docs/06: E email, W WhatsApp, A admin (Today, digest), C calendar, D document. */
export type CatalogueChannel = 'email' | 'whatsapp' | 'admin' | 'calendar' | 'document'

/**
 * Why a message may reach the person (src/lib/messaging/types.ts `MessageKind`), or `none` for
 * an automation that sends nothing.
 */
export type Basis = 'transactional' | 'promotional' | 'operator' | 'internal' | 'none'

/** Who builds it: M3 (already built), or M6's builders A, B and C (docs/19 §9). */
export type Owner = 'M3' | 'A' | 'B' | 'C'

export type Automation = {
  id: string
  title: string
  /** The events whose jobs start it (src/lib/automations/events.ts). */
  on?: readonly AutomationEventName[]
  /** The timing in docs/06's words. */
  timing: string
  channels: readonly CatalogueChannel[]
  basis: Basis
  owner: Owner
  /** The Payload task that runs it, named by its automation ID (CLAUDE.md, Conventions). */
  task?: string
  /** What must exist before it can run end to end (another milestone's events or pages). */
  waitsOn?: string
}

export const AUTOMATIONS = [
  // ---- Bookings (B) ----
  {
    id: 'B1',
    title: 'Hold the slot at checkout',
    timing: 'At once',
    channels: [],
    basis: 'none',
    owner: 'M3',
  },
  {
    id: 'B2',
    title: 'Booking confirmation',
    on: ['booking.confirmed'],
    timing: 'At once',
    channels: ['email', 'whatsapp', 'calendar', 'admin'],
    basis: 'transactional',
    owner: 'B',
    task: 'B2-confirmation',
  },
  {
    id: 'B3',
    title: 'Invoice or receipt by email',
    on: ['invoice.issued'],
    timing: 'At once, once Zoho Books has issued it',
    channels: ['document', 'email'],
    basis: 'transactional',
    owner: 'B',
    task: 'B3-receipt',
    waitsOn: 'M3 documents emitting invoice.issued (one line at the join)',
  },
  {
    id: 'B3a',
    title: 'Written consent receipt for a counselling booking',
    on: ['booking.confirmed'],
    timing: 'With B2',
    channels: ['email'],
    basis: 'transactional',
    owner: 'B',
    task: 'B3a-consent-receipt',
  },
  {
    id: 'B4',
    title: 'Release a hold that expired unpaid',
    timing: 'At hold expiry (every minute)',
    channels: [],
    basis: 'none',
    owner: 'M3',
    task: 'B4-expire-holds',
  },
  {
    id: 'B5',
    title: 'Reminder 24 hours before',
    on: ['booking.confirmed', 'booking.rescheduled', 'booking.cancelled'],
    timing: '24 h before; skipped if booked less than 24 h ahead',
    channels: ['whatsapp', 'email'],
    basis: 'transactional',
    owner: 'B',
    task: 'B5-reminder-24h',
  },
  {
    id: 'B6',
    title: 'Short reminder before the session',
    on: ['booking.confirmed', 'booking.rescheduled', 'booking.cancelled'],
    timing:
      '2 h before (online: 30 min, with the link); dropped if quiet hours push it past the start',
    channels: ['whatsapp'],
    basis: 'transactional',
    owner: 'B',
    task: 'B6-reminder-2h',
  },
  {
    id: 'B7',
    title: 'Rescheduled, cancelled or refunded: both sides told',
    on: ['booking.rescheduled', 'booking.cancelled', 'refund.processed'],
    timing: 'At once',
    channels: ['email', 'whatsapp', 'calendar', 'admin'],
    basis: 'transactional',
    owner: 'B',
    task: 'B7-change-notice',
  },
  {
    id: 'B8',
    title: 'Feedback request naming the session',
    on: ['booking.completed'],
    timing: '2 h after the session is marked completed',
    channels: ['email'],
    basis: 'transactional',
    owner: 'B',
    task: 'B8-feedback-request',
    waitsOn: 'booking.completed from attendance marking, and the feedback page (M5, Proof)',
  },
  {
    id: 'B9',
    title: 'No-show: a gentle message with a link to rebook',
    on: ['booking.noShow'],
    timing: '1 h after the session is marked no-show',
    channels: ['email'],
    basis: 'transactional',
    owner: 'B',
    task: 'B9-no-show',
    waitsOn: 'booking.noShow from attendance marking',
  },
  {
    id: 'B10',
    title: 'Slot lost at confirmation: refund and nearest free times',
    on: ['booking.slotLost'],
    timing: 'At once',
    channels: ['email', 'whatsapp', 'admin'],
    basis: 'transactional',
    owner: 'B',
    task: 'B10-slot-lost',
  },
  {
    id: 'B11',
    title: 'Reconcile gateway payments with bookings',
    timing: 'Daily 23:00 IST',
    channels: ['admin'],
    basis: 'none',
    owner: 'M3',
    task: 'B11-reconcile',
  },
  {
    id: 'B12',
    title: 'Time request acknowledged',
    on: ['booking.requested'],
    timing: 'At once; on Today until handled, flagged at 24 h',
    channels: ['email', 'whatsapp', 'admin'],
    basis: 'transactional',
    owner: 'B',
    task: 'B12-time-request-ack',
  },
  {
    id: 'B13',
    title: 'Payment link, and one reminder before the session',
    on: ['payment.linkSent', 'booking.cancelled'],
    timing: 'At once; one reminder before the session while unpaid',
    channels: ['email', 'whatsapp'],
    basis: 'operator',
    owner: 'B',
    task: 'B13-payment-link',
  },
  {
    id: 'B14',
    title: 'Refresh busy times from Google Calendar',
    timing: 'On change notification, and every 15 minutes',
    channels: [],
    basis: 'none',
    owner: 'M3',
    task: 'B14-refresh-busy-times',
  },
  // ---- Pipeline (P): M4's leads and proposals ----
  {
    id: 'P1',
    title: 'Team Map request: acknowledgement, lead and task',
    on: ['lead.created'],
    timing: 'At once; task due in 2 working days',
    channels: ['email', 'admin'],
    basis: 'transactional',
    owner: 'C',
    task: 'P1-team-map-ack',
    waitsOn: 'M4 (leads, lead.created)',
  },
  {
    id: 'P2',
    title: 'Proposal call booked: lead moved to Contacted',
    on: ['booking.confirmed'],
    timing: 'At once',
    channels: ['admin'],
    basis: 'none',
    owner: 'C',
    task: 'P2-call-booked',
    waitsOn: 'M4 (leads)',
  },
  {
    id: 'P3',
    title: 'Lead untouched in New',
    timing: '24 h amber, 48 h red (hourly check)',
    channels: ['admin'],
    basis: 'none',
    owner: 'C',
    task: 'P3-P4-lead-ages',
    waitsOn: 'M4 (leads, activities)',
  },
  {
    id: 'P4',
    title: 'Active lead with no activity: stale',
    timing: '7 days (hourly check, with P3)',
    channels: ['admin'],
    basis: 'none',
    owner: 'C',
    task: 'P3-P4-lead-ages',
    waitsOn: 'M4 (leads, activities)',
  },
  {
    id: 'P5',
    title: 'Proposal sent: version, tracked link, follow-up task',
    on: ['proposal.sent'],
    timing: 'At once; task in 3 working days',
    channels: ['email', 'admin'],
    basis: 'transactional',
    owner: 'C',
    task: 'P5-proposal-sent',
    waitsOn: 'M4 (proposals, proposal.sent)',
  },
  {
    id: 'P6',
    title: 'Proposal unanswered: draft follow-up for the operator',
    timing: '5 working days (daily check)',
    channels: ['admin'],
    basis: 'none',
    owner: 'C',
    task: 'P6-proposal-follow-up',
    waitsOn: 'M4 (proposals)',
  },
  {
    id: 'P7',
    title: 'Partnership enquiry acknowledged',
    on: ['lead.created'],
    timing: 'At once',
    channels: ['email', 'admin'],
    basis: 'transactional',
    owner: 'C',
    task: 'P7-partnership-ack',
    waitsOn: 'M4 (leads, lead.created)',
  },
  // ---- Newsletter (N, D-10) ----
  {
    id: 'N1',
    title: 'Double opt-in email',
    on: ['newsletter.signedUp'],
    timing: 'At once',
    channels: ['email'],
    basis: 'transactional',
    owner: 'C',
    task: 'N1-confirm-signup',
  },
  {
    id: 'N2',
    title: 'Confirmed: consent logged, welcome email',
    on: ['newsletter.confirmed'],
    timing: 'At once',
    channels: ['email'],
    basis: 'promotional',
    owner: 'C',
    task: 'N2-welcome',
  },
  {
    id: 'N3',
    title: 'Unsubscribe or complaint: off the list, withdrawal logged',
    on: ['consent.withdrawn', 'message.suppressed'],
    timing: 'At once',
    channels: [],
    basis: 'none',
    owner: 'C',
    task: 'N3-unsubscribe',
  },
  {
    id: 'N4',
    title: 'Monthly issue to confirmed subscribers',
    on: ['newsletter.issueScheduled'],
    timing: 'When an editor schedules it',
    channels: ['email'],
    basis: 'promotional',
    owner: 'C',
    task: 'N4-send-issue',
  },
  // ---- Operations (O) ----
  {
    id: 'O1',
    title: 'Daily digest',
    timing: '08:30 IST',
    channels: ['email'],
    basis: 'internal',
    owner: 'C',
    task: 'O1-daily-digest',
  },
  {
    id: 'O2',
    title: 'Weekly report',
    timing: 'Monday 09:00 IST',
    channels: ['email'],
    basis: 'internal',
    owner: 'C',
    task: 'O2-weekly-report',
  },
  {
    id: 'O3',
    title: 'Message or webhook failure',
    on: ['message.failed', 'automation.failed'],
    timing: 'At once; an owner emailed if three fail within an hour',
    channels: ['admin', 'email'],
    basis: 'internal',
    owner: 'A',
    task: 'O3-failure-alert',
  },
  {
    id: 'O4',
    title: 'Data request: acknowledgement and deadline reminders',
    on: ['dataRequest.received'],
    timing: 'At once and at 50% and 80% of the deadline',
    channels: ['email', 'admin'],
    basis: 'transactional',
    owner: 'C',
    task: 'O4-data-request',
    waitsOn: 'M5 (data requests, dataRequest.received)',
  },
  {
    id: 'O5',
    title: 'Retention',
    timing: 'Nightly',
    channels: [],
    basis: 'none',
    owner: 'C',
    task: 'O5-retention',
  },
  {
    id: 'O6',
    title: 'Backup check',
    timing: 'Daily',
    channels: ['admin'],
    basis: 'internal',
    owner: 'C',
    task: 'O6-backup-check',
    waitsOn: 'A read-only Supabase management token (missing input)',
  },
  {
    id: 'O7',
    title: 'Complaint or grievance: acknowledgement with a copy, reminders',
    on: ['dataRequest.received'],
    timing: 'At once, then at 24 h and before each deadline',
    channels: ['email', 'admin'],
    basis: 'transactional',
    owner: 'C',
    task: 'O7-complaint',
    waitsOn: 'M5 (data requests of type complaint or grievance)',
  },
  {
    id: 'O8',
    title: 'Incident timers',
    on: ['incident.opened'],
    timing: 'At once, 4 h, 6 h, 48 h, 72 h',
    channels: ['admin', 'email'],
    basis: 'internal',
    owner: 'C',
    task: 'O8-incident-timers',
    waitsOn: 'M5 (incidents, incident.opened)',
  },
  {
    id: 'O9',
    title: 'Hard bounce or complaint: address marked, sends stopped',
    on: ['message.suppressed'],
    timing: 'At once',
    channels: ['admin'],
    basis: 'none',
    owner: 'C',
    task: 'O9-bounce-complaint',
  },
  {
    id: 'O10',
    title: 'Weekly additions: 404s, empty searches, delivery, WhatsApp quality, costs',
    timing: 'Monday 09:00 IST, inside O2',
    channels: ['email'],
    basis: 'internal',
    owner: 'C',
    task: 'O2-weekly-report',
  },
  // ---- Reviews (V) and certificates (C) ----
  {
    id: 'V1',
    title: 'Consent request for a review, and one reminder',
    on: ['review.consentRequested'],
    timing: 'At once; one reminder after 5 days without a reply',
    channels: ['email', 'whatsapp'],
    basis: 'operator',
    owner: 'C',
    task: 'V1-review-consent-request',
  },
  {
    id: 'V2',
    title: 'Consent to publish withdrawn: confirmation to the person',
    on: ['consent.withdrawn'],
    timing: 'At once (the unpublishing itself is M2’s ledger hook)',
    channels: ['email', 'admin'],
    basis: 'transactional',
    owner: 'C',
    task: 'V2-withdrawal-confirmation',
  },
  {
    id: 'C5',
    title: 'Certificate issued: PDF, verification and LinkedIn links',
    on: ['certificate.issued'],
    timing: 'At once',
    channels: ['email', 'document'],
    basis: 'transactional',
    owner: 'C',
    task: 'C5-certificate-email',
    waitsOn: 'M5 (certificates, certificate.issued)',
  },
] as const satisfies readonly Automation[]

export type AutomationId = (typeof AUTOMATIONS)[number]['id']

export const AUTOMATION_IDS = AUTOMATIONS.map((automation) => automation.id) as AutomationId[]

/** The messaging core's own tasks, which are not automations of docs/06 (builder A). */
export const CORE_TASKS = {
  /** Every minute: sends what is due, retries, moves stale sends to `unknown` (docs/19 §2). */
  dispatch: 'messages-dispatch',
} as const

export function automation(id: AutomationId): Automation {
  return AUTOMATIONS.find((entry) => entry.id === id) as Automation
}
