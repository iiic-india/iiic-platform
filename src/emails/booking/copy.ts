import type { TemplateKey } from '@/emails/registry'
import type { PriceShown } from '@/emails/types'
import { CRISIS_HEADING, CRISIS_LINES, SCOPE_STATEMENT } from '@/lib/counselling/scope'
import { CONTACT } from '@/lib/site/contact'

import type {
  CancelledData,
  ConfirmedData,
  ConsentReceiptData,
  PaymentLinkData,
  ReceiptData,
  RefundData,
  RescheduledData,
  SessionData,
  SlotLostData,
  StaffChangeData,
  TimeRequestData,
} from './data'
import { longDay, rupees, rupeesExact, shortDay, timeSpan } from './format'

/**
 * Every word of the booking messages, en-IN, in one place (CLAUDE.md, Conventions), written to
 * src/brand/VOICE.md: the subject says what the message is, one purpose and one action, no
 * urgency, no exclamation marks, nothing about a session but its time, place and how to change
 * it, and no offer of anything (docs/06, counselling guardrail).
 *
 * Where the words come from (CLAUDE.md #1): `kit` lines are the brand kit's own
 * (src/brand/templates/email/booking-confirmation.html, VOICE.md's examples); `candidate` lines
 * are drafts awaiting IIIC's approval (I-41) or the lawyer's (I-22), until an approved entry in
 * Admin → Messages → Templates replaces them. A fact nobody has supplied is a `[[TODO: …]]`
 * placeholder, which blocks the send in production (docs/19 §7).
 */
export type CopyStatus = { status: 'kit' | 'candidate'; awaits?: 'I-41' | 'I-22' }

export const BOOKING_COPY_STATUS = {
  // The eyebrow, heading, first line, labels and reschedule line are the kit's; the subject is new.
  'booking-confirmed': { status: 'candidate', awaits: 'I-41' },
  'booking-receipt': { status: 'candidate', awaits: 'I-41' },
  'consent-receipt': { status: 'candidate', awaits: 'I-22' },
  'reminder-24h': { status: 'candidate', awaits: 'I-41' },
  'reminder-short': { status: 'candidate', awaits: 'I-41' },
  'booking-rescheduled': { status: 'candidate', awaits: 'I-41' },
  'booking-cancelled': { status: 'candidate', awaits: 'I-41' },
  'refund-processed': { status: 'candidate', awaits: 'I-41' },
  'booking-change-staff': { status: 'candidate', awaits: 'I-41' },
  'feedback-request': { status: 'candidate', awaits: 'I-41' },
  'no-show': { status: 'candidate', awaits: 'I-41' },
  'slot-lost': { status: 'candidate', awaits: 'I-41' },
  'time-request-received': { status: 'candidate', awaits: 'I-41' },
  'payment-link': { status: 'candidate', awaits: 'I-41' },
  'payment-link-reminder': { status: 'candidate', awaits: 'I-41' },
} as const satisfies Partial<Record<TemplateKey, CopyStatus>>

export type BookingTemplateKey = keyof typeof BOOKING_COPY_STATUS

/** The labels of the details ticket (the kit's: What, When, Where, Booking ID, Paid). */
export const LABELS = {
  what: 'What',
  when: 'When',
  where: 'Where',
  link: 'Link',
  reference: 'Booking ID',
  paid: 'Paid',
  amount: 'Amount',
  number: 'Number',
  issued: 'Issued',
  refunded: 'Refunded',
  days: 'Days you gave',
  was: 'Was',
  now: 'Now',
  linkWorks: 'Link works until',
} as const

/** The place as the person needs it: the office's address, or the meeting's kind. */
export function placeOf(data: Pick<SessionData, 'format'>): string {
  return data.format === 'online' ? 'Online' : `IIIC, ${CONTACT.address}`
}

/** When: Friday, 6 November 2026 · 3 PM – 3:45 PM (the kit's "{{date}} · {{slot}}"). */
export function whenOf(data: Pick<SessionData, 'startsAt' | 'endsAt'>): string {
  return `${longDay(data.startsAt)} · ${timeSpan(data.startsAt, data.endsAt)}`
}

/** How to change a booking (the kit's line). */
export const RESCHEDULE_LINE = `Need to reschedule? Reply to this email or call ${CONTACT.phone}.`

/** The button that opens an online session's link. */
export const JOIN_BUTTON = 'Join the session'

/** The button that opens the booking's manage page (the kit's, booking-confirmation.html). */
export const MANAGE_BUTTON = 'Manage your booking'

const at = (instant: Date) => `${shortDay(instant)} at ${timeSpan(instant)}`

export const COPY = {
  'booking-confirmed': {
    subject: (d: ConfirmedData) => `Booking confirmed: ${at(d.startsAt)}`,
    preheader: (d: ConfirmedData) =>
      `${d.serviceName} on ${longDay(d.startsAt)} at ${timeSpan(d.startsAt)}. Booking ID ${d.reference}.`,
    eyebrow: 'Booking confirmed',
    heading: (d: ConfirmedData) => `See you on ${shortDay(d.startsAt)}, ${d.firstName}.`,
    lead: (d: ConfirmedData) => `Your ${d.serviceName} is booked. The details are below.`,
    paid: (paise: number) => rupees(paise),
  },
  'reminder-24h': {
    subject: (d: SessionData) => `Your ${d.serviceName} on ${at(d.startsAt)}`,
    preheader: (d: SessionData) => `${placeOf(d)}. Booking ID ${d.reference}.`,
    eyebrow: 'Reminder',
    heading: (d: SessionData) =>
      `${d.firstName}, your ${d.serviceName} is on ${shortDay(d.startsAt)}.`,
    lead: (d: SessionData) =>
      d.format === 'online'
        ? `It starts at ${timeSpan(d.startsAt)}, online.${d.meetingUrl ? ' The link is below.' : ''}`
        : `It starts at ${timeSpan(d.startsAt)}, at the IIIC office.`,
  },
  'booking-rescheduled': {
    subject: (d: RescheduledData) => `Your booking has moved to ${at(d.startsAt)}`,
    preheader: (d: RescheduledData) => `Booking ID ${d.reference}. ${placeOf(d)}.`,
    eyebrow: 'Booking moved',
    heading: (d: RescheduledData) => `${d.firstName}, your new time is ${at(d.startsAt)}.`,
    lead: (d: RescheduledData) =>
      `Your ${d.serviceName} has moved from ${at(d.fromStartsAt)}. The new details are below.`,
  },
  'booking-cancelled': {
    subject: (d: CancelledData) => `Your booking on ${shortDay(d.startsAt)} is cancelled`,
    preheader: (d: CancelledData) => `Booking ID ${d.reference}.`,
    eyebrow: 'Booking cancelled',
    heading: (d: CancelledData) => `${d.firstName}, your booking is cancelled.`,
    lead: (d: CancelledData) =>
      d.by === 'client'
        ? `You cancelled your ${d.serviceName} on ${at(d.startsAt)}.`
        : `We have had to cancel your ${d.serviceName} on ${at(d.startsAt)}. We are sorry for the change.`,
    refund: 'If a refund is due, we will write to you again when it has been made.',
    rebook: `To book another time, reply to this email or call ${CONTACT.phone}.`,
  },
  'time-request-received': {
    subject: () => 'We have your request for a time',
    preheader: (d: TimeRequestData) => `Booking ID ${d.reference}.`,
    eyebrow: 'Request received',
    heading: (d: TimeRequestData) => `Thank you, ${d.firstName}.`,
    lead: (d: TimeRequestData) =>
      `We have your request for a ${d.serviceName}. Someone at IIIC will reply with a time, or with a question if none of the days you gave is free.`,
    note: 'Nothing is booked until we confirm a time with you.',
    change: `To change your request, reply to this email or call ${CONTACT.phone}.`,
  },
  'consent-receipt': {
    subject: () => 'What you agreed to when you booked',
    preheader: (d: ConsentReceiptData) => `Your record for booking ${d.reference}.`,
    eyebrow: 'Your consent',
    heading: (d: ConsentReceiptData) => `${d.firstName}, this is your written record.`,
    lead: (d: ConsentReceiptData) =>
      `When you booked your ${d.serviceName} for ${longDay(d.startsAt)}, you agreed to the following. Each line names the notice you saw and its version.`,
    item: (c: ConsentReceiptData['consents'][number]) =>
      `${c.purpose}: notice version ${c.version}, agreed on ${longDay(c.grantedAt)}.`,
    withdraw:
      'You can withdraw any of these at any time: reply to this email, or use the link at the foot of it.',
  },
  'booking-receipt': {
    subject: (d: ReceiptData) => `Your ${DOCUMENT[d.document].toLowerCase()} ${d.number}`,
    // The amount only while prices are public (D-21): the receipt says the same without it.
    preheader: (d: ReceiptData, shown: PriceShown) =>
      shown.priceAllowed
        ? `For booking ${d.reference}: ${rupeesExact(d.totalPaise)}.`
        : `For booking ${d.reference}.`,
    eyebrow: (d: ReceiptData) => DOCUMENT[d.document],
    heading: (d: ReceiptData) =>
      `${d.firstName}, here is your ${DOCUMENT[d.document].toLowerCase()}.`,
    lead: (d: ReceiptData) => `It is for your payment for booking ${d.reference}.`,
    amount: (paise: number) => rupeesExact(paise),
    questions: `Need the PDF, or have a question about it? Reply to this email or call ${CONTACT.phone}.`,
  },
  'refund-processed': {
    subject: (d: RefundData, shown: PriceShown) =>
      shown.priceAllowed
        ? `Refund of ${rupees(d.amountPaise)} made for booking ${d.reference}`
        : `Refund made for booking ${d.reference}`,
    preheader: () => 'It goes back to the account you paid from.',
    eyebrow: 'Refund made',
    heading: (d: RefundData) => `${d.firstName}, your refund has been made.`,
    lead: (d: RefundData, shown: PriceShown) =>
      shown.priceAllowed
        ? `We have refunded ${rupees(d.amountPaise)} to the account you paid from.`
        : 'We have refunded your payment to the account you paid from.',
    questions: `Questions about the refund? Reply to this email or call ${CONTACT.phone}.`,
  },
  'slot-lost': {
    subject: () => 'Your payment is being refunded: the time was taken',
    preheader: (d: SlotLostData, shown: PriceShown) =>
      shown.priceAllowed
        ? `${rupees(d.amountPaise)}, back to the account you paid from.`
        : 'Your payment goes back to the account you paid from.',
    eyebrow: 'Not booked',
    heading: (d: SlotLostData) =>
      `${d.firstName}, that time was taken before your payment arrived.`,
    lead: (d: SlotLostData) =>
      d.startsAt
        ? `Someone else confirmed ${at(d.startsAt)} before your payment reached us, so your ${d.serviceName} could not be booked.`
        : `Someone else confirmed the time you chose before your payment reached us, so your ${d.serviceName} could not be booked.`,
    refund: (d: SlotLostData, shown: PriceShown) =>
      shown.priceAllowed
        ? `We are refunding your payment of ${rupees(d.amountPaise)} in full, to the account you paid from.`
        : 'We are refunding your payment in full, to the account you paid from.',
    button: 'Choose another time',
  },
  'no-show': {
    subject: (d: SessionData) => `Your ${d.serviceName} on ${shortDay(d.startsAt)}`,
    preheader: () => 'If you would like another time, you can choose one.',
    eyebrow: 'Another time',
    heading: (d: SessionData) => `${d.firstName}, we did not see you on ${shortDay(d.startsAt)}.`,
    lead: (d: SessionData) =>
      `Your ${d.serviceName} was booked for ${timeSpan(d.startsAt)}. If something came up, you can choose another time.`,
    button: 'Choose another time',
  },
  'feedback-request': {
    subject: (d: SessionData) => `Your ${d.serviceName} on ${shortDay(d.startsAt)}`,
    preheader: () => 'One question: a rating from 1 to 5.',
    eyebrow: 'Feedback',
    heading: (d: SessionData) => `${d.firstName}, how was your ${d.serviceName}?`,
    lead: (d: SessionData) =>
      `We would like to know how your ${d.serviceName} on ${longDay(d.startsAt)} went. There is one question: a rating from 1 to 5.`,
    button: 'Rate your session',
    // The feedback page and its links are M5's: until they exist this stands where the button
    // goes, and the placeholder blocks the send in production (docs/19 §10).
    missingLink: '[[TODO: the link to the feedback page for this booking, I-17]]',
  },
  'payment-link': {
    subject: (d: PaymentLinkData) => `Payment for your booking on ${shortDay(d.startsAt)}`,
    preheader: (d: PaymentLinkData) => `${rupees(d.amountPaise)} for booking ${d.reference}.`,
    eyebrow: 'Payment',
    heading: (d: PaymentLinkData) => `${d.firstName}, here is the link to pay.`,
    lead: (d: PaymentLinkData) =>
      `It is for your ${d.serviceName} on ${at(d.startsAt)}. The amount is ${rupees(d.amountPaise)}.`,
    button: (d: PaymentLinkData) => `Pay ${rupees(d.amountPaise)}`,
    questions: `Questions about the payment? Reply to this email or call ${CONTACT.phone}.`,
  },
  'payment-link-reminder': {
    subject: (d: PaymentLinkData) => `Payment for your booking on ${shortDay(d.startsAt)}`,
    preheader: (d: PaymentLinkData) => `${rupees(d.amountPaise)} for booking ${d.reference}.`,
    eyebrow: 'Payment',
    heading: (d: PaymentLinkData) => `${d.firstName}, your booking is not paid yet.`,
    lead: (d: PaymentLinkData) =>
      `Your ${d.serviceName} is on ${at(d.startsAt)}. The link to pay ${rupees(d.amountPaise)} is below.`,
    button: (d: PaymentLinkData) => `Pay ${rupees(d.amountPaise)}`,
    questions: `Questions about the payment? Reply to this email or call ${CONTACT.phone}.`,
  },
  'booking-change-staff': {
    subject: (d: StaffChangeData) => `${STAFF_CHANGE[d.change]}: ${d.reference}`,
    preheader: (d: StaffChangeData) => `${d.serviceName}. Open it in the admin for the details.`,
    eyebrow: (d: StaffChangeData) => STAFF_CHANGE[d.change],
    heading: (d: StaffChangeData) => `${STAFF_CHANGE[d.change]}: ${d.reference}`,
    lead: (d: StaffChangeData) => {
      if (d.change === 'rescheduled') return `${d.serviceName} has a new time.`
      if (d.change === 'slotLost') {
        return `${d.serviceName}: the payment arrived after the time was taken. The platform has asked for a full refund.`
      }
      return d.by === 'iiic'
        ? `${d.serviceName}, cancelled by the office.`
        : `${d.serviceName}, cancelled by the client.`
    },
    button: 'Open the booking',
  },
} as const

export const DOCUMENT: Record<ReceiptData['document'], string> = {
  taxInvoice: 'Tax invoice',
  receiptVoucher: 'Receipt',
  refundVoucher: 'Refund voucher',
  creditNote: 'Credit note',
}

export const STAFF_CHANGE: Record<StaffChangeData['change'], string> = {
  rescheduled: 'Booking moved',
  cancelled: 'Booking cancelled',
  slotLost: 'Slot lost at payment',
}

/**
 * The scope and the crisis numbers on one line, for a counselling booking's WhatsApp confirmation
 * and reminders (docs/06, counselling guardrail), in the words of src/lib/counselling/scope.ts.
 * A WhatsApp variable may not hold a line break, so it is one line.
 */
export const WHATSAPP_SCOPE_LINE = [
  SCOPE_STATEMENT[0],
  SCOPE_STATEMENT[1],
  `${CRISIS_HEADING}: ${CRISIS_LINES.map(
    (line) => `${line.label} ${line.numbers.join(' or ')}${line.note ? ` (${line.note})` : ''}`,
  ).join('; ')}.`,
].join(' ')

/**
 * The closing variable of the five templates about a booking's time (confirmed, the reminders, rescheduled, cancelled): the booking's reference, and
 * for a counselling booking the scope and crisis line after it. One approved text serves both,
 * and a variable is never empty (Meta refuses an empty one).
 */
export function whatsappClosing(d: Pick<SessionData, 'reference' | 'counselling'>): string {
  const reference = `Booking ID ${d.reference}.`
  return d.counselling ? `${reference} ${WHATSAPP_SCOPE_LINE}` : reference
}

/** Where to go: an online booking's link, else the place. */
const whereOf = (d: SessionData) =>
  d.format === 'online' && d.meetingUrl ? d.meetingUrl : placeOf(d)

/**
 * The WhatsApp templates' variables, in the order the approved texts number them
 * (docs/content/whatsapp-templates.md, submitted to Meta). Each names the person's own booking.
 */
export const WHATSAPP_PARAMS = {
  'booking-confirmed': (d: SessionData) => [
    d.firstName,
    d.serviceName,
    longDay(d.startsAt),
    timeSpan(d.startsAt),
    whereOf(d),
    whatsappClosing(d),
  ],
  'reminder-24h': (d: SessionData) => [
    d.firstName,
    d.serviceName,
    longDay(d.startsAt),
    timeSpan(d.startsAt),
    whereOf(d),
    whatsappClosing(d),
  ],
  'reminder-short': (d: SessionData) => [
    d.firstName,
    d.serviceName,
    timeSpan(d.startsAt),
    whereOf(d),
    whatsappClosing(d),
  ],
  'booking-rescheduled': (d: RescheduledData) => [
    d.firstName,
    d.serviceName,
    longDay(d.startsAt),
    timeSpan(d.startsAt),
    whereOf(d),
    whatsappClosing(d),
  ],
  'booking-cancelled': (d: CancelledData) => [
    d.firstName,
    d.serviceName,
    longDay(d.startsAt),
    timeSpan(d.startsAt),
    whatsappClosing(d),
  ],
  // 'feedback-request' gets its WhatsApp variables with M5's feedback link (docs/19 §10).
  'time-request-received': (d: TimeRequestData) => [d.firstName, d.serviceName, d.reference],
  'payment-link': (d: PaymentLinkData) => [
    d.firstName,
    d.serviceName,
    longDay(d.startsAt),
    rupees(d.amountPaise),
    d.linkUrl,
  ],
} as const
