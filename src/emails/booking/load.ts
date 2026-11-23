import 'server-only'

import type { PayloadRequest } from 'payload'

import type { LoadError } from '@/emails/types'
import type { Recipient, Subject } from '@/lib/messaging/types'
import { purposeLabel } from '@/lib/privacy/purposes'
import { err, ok, type Result } from '@/lib/result'
import type { Booking, Payment } from '@/payload-types'

import type {
  CancelledData,
  ConfirmedData,
  ConsentReceiptData,
  FeedbackData,
  PaymentLinkData,
  ReceiptData,
  RefundData,
  RescheduledData,
  SessionData,
  SlotLostData,
  StaffChangeData,
  TimeRequestData,
} from './data'
import { firstNameOf } from './format'

/**
 * The booking templates' loaders (docs/19 §7): each reads its data when the message is sent, from
 * the records it is about, under the server's access, and answers `stale` when they no longer
 * match what was planned (a moved or cancelled booking, a paid link), so a reminder for a changed
 * booking is never sent even if its cancellation was missed (docs/19 §6, belt and braces). The
 * person's address is not read here: the core reads it when it sends.
 */

export type LoadInput = { subject: Subject; recipient: Recipient; sendBefore?: Date | null }
type Loaded<T> = Promise<Result<T, LoadError>>

type Ref = number | { id: number } | null | undefined
const idOf = (ref: Ref): number | null =>
  ref === null || ref === undefined ? null : typeof ref === 'number' ? ref : ref.id

const STALE = err({ code: 'stale' } as const)
const NOT_FOUND = err({ code: 'not-found' } as const)

const PAID: ReadonlySet<Booking['paymentStatus']> = new Set(['paid', 'partRefunded', 'refunded'])
const CANCELLED: ReadonlySet<Booking['status']> = new Set(['cancelledByClient', 'cancelledByIiic'])

async function bookingById(req: PayloadRequest, id: number | null): Promise<Booking | null> {
  if (id === null) return null
  return req.payload.findByID({
    collection: 'bookings',
    id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
}

async function paymentById(req: PayloadRequest, id: number | null): Promise<Payment | null> {
  if (id === null) return null
  return req.payload.findByID({
    collection: 'payments',
    id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
}

async function firstNameFor(req: PayloadRequest, recipient: Recipient): Promise<string | null> {
  if (recipient.kind !== 'person') return null
  const person = await req.payload.findByID({
    collection: 'people',
    id: recipient.id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
  return person?.fullName ? firstNameOf(person.fullName) : null
}

type ServiceFacts = { name: string; type: 'session' | 'call' | 'info'; counselling: boolean }

async function serviceOf(req: PayloadRequest, booking: Booking): Promise<ServiceFacts | null> {
  const id = idOf(booking.service)
  if (id === null) return null
  const service = await req.payload.findByID({
    collection: 'services',
    id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
  if (!service || service.type === 'seat') return null
  return { name: service.name, type: service.type, counselling: service.register === 'counselling' }
}

/** The online link: the booking's own Meet link, or its info session's join link. */
async function meetingUrlOf(req: PayloadRequest, booking: Booking): Promise<string | null> {
  if (booking.format !== 'online') return null
  if (booking.meetingUrl) return booking.meetingUrl
  const eventId = idOf(booking.event)
  if (eventId === null) return null
  const event = await req.payload.findByID({
    collection: 'events',
    id: eventId,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
  return event?.joinLink ?? null
}

/** The common part of a booking's message; null when a fact it needs is missing. */
async function sessionOf(
  req: PayloadRequest,
  booking: Booking,
  recipient: Recipient,
): Promise<SessionData | null> {
  const [firstName, service] = await Promise.all([
    firstNameFor(req, recipient),
    serviceOf(req, booking),
  ])
  if (!firstName || !service || !booking.startsAt) return null
  return {
    firstName,
    serviceName: service.name,
    serviceType: service.type,
    reference: booking.reference,
    counselling: service.counselling,
    startsAt: new Date(booking.startsAt),
    endsAt: booking.endsAt ? new Date(booking.endsAt) : null,
    format: booking.format ?? 'office',
    meetingUrl: await meetingUrlOf(req, booking),
  }
}

/** The booking a message is about, when its subject is a booking. */
async function subjectBooking(req: PayloadRequest, subject: Subject): Promise<Booking | null> {
  return subject.collection === 'bookings' ? bookingById(req, subject.id) : null
}

/** A reminder planned for one start is stale once the booking starts at another time. */
function movedSince(booking: Booking, sendBefore?: Date | null): boolean {
  if (!sendBefore || !booking.startsAt) return false
  return new Date(booking.startsAt).getTime() !== sendBefore.getTime()
}

function withStatus(
  load: (req: PayloadRequest, booking: Booking, input: LoadInput) => Loaded<SessionData>,
  statuses: readonly Booking['status'][],
) {
  return async (req: PayloadRequest, input: LoadInput): Loaded<SessionData> => {
    const booking = await subjectBooking(req, input.subject)
    if (!booking) return NOT_FOUND
    if (!statuses.includes(booking.status)) return STALE
    return load(req, booking, input)
  }
}

const plainSession = async (
  req: PayloadRequest,
  booking: Booking,
  input: LoadInput,
): Loaded<SessionData> => {
  const session = await sessionOf(req, booking, input.recipient)
  return session ? ok(session) : NOT_FOUND
}

// ---- One loader per template ----

export async function loadConfirmed(req: PayloadRequest, input: LoadInput): Loaded<ConfirmedData> {
  const booking = await subjectBooking(req, input.subject)
  if (!booking) return NOT_FOUND
  if (booking.status !== 'confirmed') return STALE
  const session = await sessionOf(req, booking, input.recipient)
  if (!session) return NOT_FOUND
  const paid = PAID.has(booking.paymentStatus) ? (booking.price?.totalPaise ?? null) : null
  return ok({ ...session, paidPaise: paid })
}

/** B5 and B6: the booking still confirmed, at the time the reminder was planned for. */
export async function loadReminder(req: PayloadRequest, input: LoadInput): Loaded<SessionData> {
  const booking = await subjectBooking(req, input.subject)
  if (!booking) return NOT_FOUND
  if (booking.status !== 'confirmed' || movedSince(booking, input.sendBefore)) return STALE
  return plainSession(req, booking, input)
}

export async function loadRescheduled(
  req: PayloadRequest,
  input: LoadInput,
): Loaded<RescheduledData> {
  const booking = await subjectBooking(req, input.subject)
  if (!booking) return NOT_FOUND
  if (booking.status !== 'confirmed') return STALE
  const from = await bookingById(req, idOf(booking.rescheduledFrom))
  if (!from?.startsAt) return NOT_FOUND
  const session = await sessionOf(req, booking, input.recipient)
  if (!session) return NOT_FOUND
  return ok({ ...session, fromStartsAt: new Date(from.startsAt) })
}

export async function loadCancelled(req: PayloadRequest, input: LoadInput): Loaded<CancelledData> {
  const booking = await subjectBooking(req, input.subject)
  if (!booking) return NOT_FOUND
  if (!CANCELLED.has(booking.status)) return STALE
  const session = await sessionOf(req, booking, input.recipient)
  if (!session) return NOT_FOUND
  return ok({ ...session, by: booking.status === 'cancelledByIiic' ? 'iiic' : 'client' })
}

/**
 * B8: a completed booking. The feedback page's link is M5's (`/feedback/[token]`); until its
 * tokens exist the link is null and the email carries a placeholder instead (docs/19 §10).
 */
export async function loadFeedback(req: PayloadRequest, input: LoadInput): Loaded<FeedbackData> {
  const booking = await subjectBooking(req, input.subject)
  if (!booking) return NOT_FOUND
  if (booking.status !== 'completed') return STALE
  const session = await sessionOf(req, booking, input.recipient)
  return session ? ok({ ...session, feedbackUrl: null }) : NOT_FOUND
}

export const loadNoShow = withStatus(plainSession, ['noShow'])

export async function loadTimeRequest(
  req: PayloadRequest,
  input: LoadInput,
): Loaded<TimeRequestData> {
  const booking = await subjectBooking(req, input.subject)
  if (!booking) return NOT_FOUND
  if (booking.status !== 'requested') return STALE
  const [firstName, service] = await Promise.all([
    firstNameFor(req, input.recipient),
    serviceOf(req, booking),
  ])
  if (!firstName || !service) return NOT_FOUND
  return ok({
    firstName,
    serviceName: service.name,
    reference: booking.reference,
    preferredDays: (booking.timeRequest?.preferredDays ?? []).map((entry) => entry.day),
  })
}

/** B3a: the consents recorded with the booking, each with its notice's version (docs/06 B3a). */
export async function loadConsentReceipt(
  req: PayloadRequest,
  input: LoadInput,
): Loaded<ConsentReceiptData> {
  const booking = await subjectBooking(req, input.subject)
  if (!booking) return NOT_FOUND
  if (booking.status !== 'confirmed' || !booking.startsAt) return STALE
  const ids = (booking.consents ?? []).map(idOf).filter((id): id is number => id !== null)
  const [firstName, service] = await Promise.all([
    firstNameFor(req, input.recipient),
    serviceOf(req, booking),
  ])
  if (!firstName || !service || !ids.length) return NOT_FOUND
  const { docs } = await req.payload.find({
    collection: 'consents',
    where: { and: [{ id: { in: ids } }, { withdraws: { exists: false } }] },
    sort: 'grantedAt',
    pagination: false,
    depth: 1,
    overrideAccess: true,
    req,
  })
  const consents = docs.flatMap((consent) => {
    const notice = consent.noticeVersion
    const version = typeof notice === 'object' && notice ? notice.version : null
    return version
      ? [
          {
            purpose: purposeLabel(consent.purpose),
            version,
            grantedAt: new Date(consent.grantedAt),
          },
        ]
      : []
  })
  if (!consents.length) return NOT_FOUND
  return ok({
    firstName,
    serviceName: service.name,
    reference: booking.reference,
    startsAt: new Date(booking.startsAt),
    consents,
  })
}

/** B3: the document Zoho Books issued, with its number and total. */
export async function loadReceipt(req: PayloadRequest, input: LoadInput): Loaded<ReceiptData> {
  if (input.subject.collection !== 'invoices') return NOT_FOUND
  const invoice = await req.payload.findByID({
    collection: 'invoices',
    id: input.subject.id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
  if (!invoice) return NOT_FOUND
  if (invoice.status !== 'issued') return STALE
  const booking = await bookingById(req, idOf(invoice.booking))
  const firstName = await firstNameFor(req, input.recipient)
  const total = invoice.totals?.totalPaise
  if (!booking || !firstName || !invoice.number || !invoice.issuedAt || typeof total !== 'number') {
    return NOT_FOUND
  }
  return ok({
    firstName,
    reference: booking.reference,
    document: invoice.kind,
    number: invoice.number,
    issuedAt: new Date(invoice.issuedAt),
    totalPaise: total,
  })
}

/** B7's refund notice: the person's own amount (D-24). */
export async function loadRefund(req: PayloadRequest, input: LoadInput): Loaded<RefundData> {
  if (input.subject.collection !== 'refunds') return NOT_FOUND
  const refund = await req.payload.findByID({
    collection: 'refunds',
    id: input.subject.id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
  if (!refund) return NOT_FOUND
  if (refund.status !== 'processed' || !refund.processedAt) return STALE
  const payment = await paymentById(req, idOf(refund.payment))
  const booking = await bookingById(req, idOf(refund.booking) ?? idOf(payment?.booking))
  const firstName = await firstNameFor(req, input.recipient)
  if (!booking || !firstName) return NOT_FOUND
  return ok({
    firstName,
    reference: booking.reference,
    amountPaise: refund.amountPaise,
    processedAt: new Date(refund.processedAt),
  })
}

/** B10: the payment that arrived after its time was taken, refunded in full. */
export async function loadSlotLost(req: PayloadRequest, input: LoadInput): Loaded<SlotLostData> {
  if (input.subject.collection !== 'payments') return NOT_FOUND
  const payment = await paymentById(req, input.subject.id)
  const booking = await bookingById(req, idOf(payment?.booking))
  if (!payment || !booking) return NOT_FOUND
  const [firstName, service] = await Promise.all([
    firstNameFor(req, input.recipient),
    serviceOf(req, booking),
  ])
  if (!firstName || !service) return NOT_FOUND
  return ok({
    firstName,
    serviceName: service.name,
    serviceType: service.type,
    startsAt: booking.startsAt ? new Date(booking.startsAt) : null,
    amountPaise: payment.amountPaise,
  })
}

/**
 * B13: the open link and its amount (D-24). Stale once the link is paid, cancelled or expired,
 * the booking no longer confirmed, or (the reminder) the session moved.
 */
export async function loadPaymentLink(
  req: PayloadRequest,
  input: LoadInput,
): Loaded<PaymentLinkData> {
  if (input.subject.collection !== 'payments') return NOT_FOUND
  const payment = await paymentById(req, input.subject.id)
  if (!payment || payment.kind !== 'paymentLink') return NOT_FOUND
  const booking = await bookingById(req, idOf(payment.booking))
  if (!booking) return NOT_FOUND
  if (
    payment.status !== 'created' ||
    booking.status !== 'confirmed' ||
    PAID.has(booking.paymentStatus) ||
    movedSince(booking, input.sendBefore)
  ) {
    return STALE
  }
  const [firstName, service] = await Promise.all([
    firstNameFor(req, input.recipient),
    serviceOf(req, booking),
  ])
  if (!firstName || !service || !booking.startsAt || !payment.linkUrl) return NOT_FOUND
  return ok({
    firstName,
    serviceName: service.name,
    reference: booking.reference,
    startsAt: new Date(booking.startsAt),
    amountPaise: payment.amountPaise,
    linkUrl: payment.linkUrl,
    expiresAt: payment.expiresAt ? new Date(payment.expiresAt) : null,
  })
}

/** B7 and B10 to the practitioner: what changed, by reference (docs/19 §9, proposed). */
export async function loadStaffChange(
  req: PayloadRequest,
  input: LoadInput,
): Loaded<StaffChangeData> {
  if (input.recipient.kind !== 'staff') return NOT_FOUND
  const slotLost = input.subject.collection === 'payments'
  const payment = slotLost ? await paymentById(req, input.subject.id) : null
  const booking = slotLost
    ? await bookingById(req, idOf(payment?.booking))
    : await subjectBooking(req, input.subject)
  if (!booking) return NOT_FOUND
  const service = await serviceOf(req, booking)
  if (!service) return NOT_FOUND
  const from = slotLost ? null : await bookingById(req, idOf(booking.rescheduledFrom))
  let change: StaffChangeData['change']
  if (slotLost) change = 'slotLost'
  else if (CANCELLED.has(booking.status)) change = 'cancelled'
  else if (booking.status === 'confirmed' && from) change = 'rescheduled'
  else return STALE
  return ok({
    change,
    bookingId: booking.id,
    reference: booking.reference,
    serviceName: service.name,
    startsAt: booking.startsAt ? new Date(booking.startsAt) : null,
    fromStartsAt: change === 'rescheduled' && from?.startsAt ? new Date(from.startsAt) : null,
    by: change === 'cancelled' ? (booking.status === 'cancelledByIiic' ? 'iiic' : 'client') : null,
  })
}
