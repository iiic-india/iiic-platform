import 'server-only'

import type { PayloadRequest } from 'payload'
import { z } from 'zod'

import { listSlots } from '@/lib/booking/api'
import { cancelBooking, rescheduleBooking } from '@/lib/booking/changes'
import { inTransaction, keepOk } from '@/lib/booking/guard'
import { loadRules, paidPaiseFor } from '@/lib/booking/load'
import type { BookingError } from '@/lib/booking/operations'
import {
  canClientCancel,
  canClientReschedule,
  refundForCancellation,
} from '@/lib/booking/policies'
import { refundableOnChain, requestClientRefund } from '@/lib/bookingFlow/clientRefund'
import { bookingsStoreHere } from '@/lib/bookingFlow/guards'
import { bookingInvite } from '@/lib/calendar/bookingInvite'
import { env } from '@/lib/env'
import { readPaymentSettings } from '@/lib/payments/records'
import { statusOnRequest } from '@/lib/payments/refundRules'
import { payments } from '@/lib/payments/wiring'
import { err, ok, type Result } from '@/lib/result'
import { CONTACT } from '@/lib/site/contact'
import type { Booking, Service } from '@/payload-types'

import type {
  AccountBooking,
  AccountSession,
  GetOwnBooking,
  ListOwnBookings,
  ManageOwnBooking,
  ManageOwnBookingError,
  ManageOwnBookingInput,
} from './contract'
import { findOwnBookings, ownPersonIds } from './scope'

/**
 * My IIIC's bookings (docs/20 §7.1, §7.2; docs/03 F4, F7): every booking whose client is one of
 * the account's records, upcoming and past, each as its confirmation shows it (the time in India,
 * the format, the place or link, the practitioner's public name, the status) and nothing more: no
 * price, no person's details, no note (D-21, CLAUDE.md #3). Reads go through the scope
 * (src/lib/accounts/scope.ts); another person's booking is answered as one that does not exist.
 *
 * Moving and cancelling follow the manage link's rules exactly (docs/16 §6; D-16): the booking
 * module's own `rescheduleBooking` and `cancelBooking` with `by: 'client'` and `asker: 'client'`
 * after the ownership check, as src/lib/booking/api.ts's token branch calls them, then what the
 * manage link's actions do around them (src/lib/bookingFlow/actions.ts): the open payment links
 * closed, the refund the service's rule gives asked for in the same transaction and sent once it
 * has committed. B7's messages, the calendar and the invite follow from the booking module's
 * events. No manage token is handed out here: the person is signed in, and the moved booking's
 * message then carries its own manage link (src/emails/booking/manageLink.ts). Nothing acts on a
 * preview deployment (D-102, D-108).
 */

/** A reference as the bookings collection holds it (IIIC-S-24117; twenty characters at most). */
const Reference = z.string().regex(/^[A-Za-z0-9-]{1,20}$/)

const ManageInput = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('reschedule'),
    reference: Reference,
    startsAt: z.iso.datetime({ offset: true }),
  }),
  z.strictObject({
    kind: z.literal('cancel'),
    reference: Reference,
    reason: z.string().trim().max(1000).optional(),
  }),
])

/** The states a client may still change: the booking is not over and not ended. */
const ACTIVE_STATUSES: readonly string[] = ['requested', 'held', 'pendingPayment', 'confirmed']

/**
 * The states a list leaves out: a booking that was moved (the booking it became is listed) and a
 * hold that ran out before it was paid (nothing was booked).
 */
const UNLISTED_STATUSES: readonly string[] = ['rescheduled', 'expired']

/** The fields of a booking My IIIC reads, and no others. */
const BOOKING_FIELDS = {
  reference: true,
  type: true,
  status: true,
  service: true,
  serviceOption: true,
  optionLabel: true,
  durationMinutes: true,
  practitioner: true,
  event: true,
  format: true,
  startsAt: true,
  endsAt: true,
  meetingUrl: true,
  rescheduledFrom: true,
} as const

type BookingRow = Pick<
  Booking,
  | 'id'
  | 'reference'
  | 'type'
  | 'status'
  | 'service'
  | 'serviceOption'
  | 'optionLabel'
  | 'durationMinutes'
  | 'practitioner'
  | 'event'
  | 'format'
  | 'startsAt'
  | 'endsAt'
  | 'meetingUrl'
  | 'rescheduledFrom'
>

type ServiceFacts = Pick<Service, 'id' | 'name' | 'register' | 'type' | 'bookingRules'>

/**
 * The refund a cancellation would give now, as the page may show it: the amount only while
 * prices are published (D-21, D-101), else only that there is one.
 */
export type RefundPreview =
  | { kind: 'nothing-paid' }
  | { kind: 'none' }
  | { kind: 'amount'; paise: number; awaitsOwner: boolean }
  | { kind: 'some'; awaitsOwner: boolean }

/** What a cancellation did about money, without the amount (the preview showed it). */
export type CancelOutcome = { refunded: boolean; awaitsOwner: boolean }

const idOf = (value: unknown): number | null =>
  typeof value === 'number'
    ? value
    : value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'number'
      ? (value as { id: number }).id
      : null

const instant = (value: string | null | undefined): Date | null => {
  if (!value) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

/** Whether a booking shows the counselling scope statement and crisis numbers (docs/08 §7). */
export function isCounselling(booking: Pick<AccountBooking, 'register'>): boolean {
  return booking.register === 'counselling'
}

function registerOf(row: BookingRow, service: ServiceFacts | null): AccountBooking['register'] {
  // A session is counselling whatever its service says: the scope statement errs on showing.
  if (row.type === 'session' || service?.register === 'counselling') return 'counselling'
  if (service?.register === 'consultancy' || row.type === 'call') return 'consultancy'
  if (service?.register === 'education' || row.type === 'info') return 'education'
  return 'default'
}

/** Whether a booking is still ahead (or under way), by its end, else its start. */
function isAhead(row: BookingRow, now: Date): boolean {
  if (!ACTIVE_STATUSES.includes(row.status)) return false
  const end = instant(row.endsAt) ?? instant(row.startsAt)
  // A time request has no time yet: it is ahead until IIIC agrees one.
  return end === null || end > now
}

/** What the services, practitioners and info sessions of some bookings say, read once. */
async function factsFor(req: PayloadRequest, rows: readonly BookingRow[]) {
  const ids = (pick: (row: BookingRow) => unknown) => [
    ...new Set(rows.map(pick).map(idOf).filter((id): id is number => id !== null)),
  ]
  const serviceIds = ids((row) => row.service)
  const practitionerIds = ids((row) => row.practitioner)
  const eventIds = ids((row) => (row.format === 'online' && !row.meetingUrl ? row.event : null))
  const [services, practitioners, events] = await Promise.all([
    serviceIds.length
      ? // scope: the services of the account's own bookings, by the ids those bookings name.
        req.payload.find({
          collection: 'services',
          where: { id: { in: serviceIds } },
          select: { name: true, register: true, type: true, bookingRules: true },
          depth: 0,
          pagination: false,
          overrideAccess: true,
          req,
        })
      : null,
    practitionerIds.length
      ? // scope: the practitioners of the account's own bookings; their public name only.
        req.payload.find({
          collection: 'practitioners',
          where: { id: { in: practitionerIds } },
          select: { publicName: true },
          depth: 0,
          pagination: false,
          overrideAccess: true,
          req,
        })
      : null,
    eventIds.length
      ? // scope: the info sessions of the account's own bookings; their join link only.
        req.payload.find({
          collection: 'events',
          where: { id: { in: eventIds } },
          select: { joinLink: true },
          depth: 0,
          pagination: false,
          overrideAccess: true,
          req,
        })
      : null,
  ])
  return {
    service: new Map((services?.docs ?? []).map((doc) => [doc.id, doc as ServiceFacts])),
    practitioner: new Map((practitioners?.docs ?? []).map((doc) => [doc.id, doc.publicName])),
    joinLink: new Map((events?.docs ?? []).map((doc) => [doc.id, doc.joinLink ?? null])),
  }
}

type Facts = Awaited<ReturnType<typeof factsFor>>

/**
 * What the client may do with a booking now, under its service's rules, as the manage link
 * answers it (src/lib/booking/api.ts `viewBooking`; src/app/(platform)/(booking)/b/[token]): a
 * reschedule within the window to a time the engine offers, for a booking with a practitioner and
 * an option; a cancellation within policy, offered online only when the payments can give back
 * the whole refund the rule promises (docs/16 §5).
 */
async function termsOf(
  req: PayloadRequest,
  row: BookingRow,
  service: ServiceFacts | null,
  now: Date,
): Promise<{ canReschedule: boolean; canCancel: boolean; refund: RefundPreview }> {
  const none = { canReschedule: false, canCancel: false, refund: { kind: 'nothing-paid' as const } }
  if (!service || !isAhead(row, now)) return none
  const booking = row as Booking
  const rules = await loadRules(req, service as Service)
  const startsAt = instant(row.startsAt)
  const canReschedule = Boolean(
    startsAt &&
    idOf(row.practitioner) !== null &&
    row.serviceOption &&
    rules.ok &&
    canClientReschedule({
      now,
      startsAt,
      rescheduleWindowHours: rules.value.rescheduleWindowHours,
      status: row.status,
    }).allowed,
  )
  const steps = rules.ok ? rules.value.refundSteps : []
  const paid = await paidPaiseFor(req, booking)
  let canCancel = canClientCancel({ now, startsAt, status: row.status, paidPaise: paid, steps })
    .allowed
  let refund: RefundPreview = { kind: 'nothing-paid' }
  if (canCancel && paid > 0) {
    const { refundPaise } = refundForCancellation({
      now,
      startsAt: startsAt ?? now,
      paidPaise: paid,
      steps,
      by: 'client',
    })
    if (refundPaise > (await refundableOnChain(req, booking))) canCancel = false
    if (refundPaise <= 0) refund = { kind: 'none' }
    else {
      const settings = await readPaymentSettings(req)
      const awaitsOwner =
        statusOnRequest({
          by: 'staff',
          amountPaise: refundPaise,
          thresholdPaise: settings.refundApprovalThresholdPaise,
        }) === 'awaitingApproval'
      refund = settings.flags.pricesPublic
        ? { kind: 'amount', paise: refundPaise, awaitsOwner }
        : { kind: 'some', awaitsOwner }
    }
  }
  return { canReschedule, canCancel, refund }
}

/**
 * Where the booking takes place, as its confirmation gives it (src/emails/booking/load.ts): an
 * online booking's link (its own Meet link, or its info session's join link) while it is
 * confirmed and ahead; the office's address for one at the office.
 */
function placeOf(row: BookingRow, facts: Facts, now: Date): string | null {
  if (row.format === 'office') return `IIIC, ${CONTACT.address}`
  if (row.format !== 'online' || row.status !== 'confirmed' || !isAhead(row, now)) return null
  if (row.meetingUrl) return row.meetingUrl
  const eventId = idOf(row.event)
  return eventId === null ? null : (facts.joinLink.get(eventId) ?? null)
}

async function describe(
  req: PayloadRequest,
  row: BookingRow,
  facts: Facts,
  now: Date,
): Promise<AccountBooking & { refund: RefundPreview }> {
  const serviceId = idOf(row.service)
  const service = serviceId === null ? null : (facts.service.get(serviceId) ?? null)
  const practitionerId = idOf(row.practitioner)
  const terms = await termsOf(req, row, service, now)
  return {
    id: row.id,
    reference: row.reference,
    serviceName: service?.name ?? '',
    register: registerOf(row, service),
    startsAt: instant(row.startsAt),
    endsAt: instant(row.endsAt),
    status: row.status,
    format: row.format ?? null,
    place: placeOf(row, facts, now),
    practitionerName:
      practitionerId === null ? null : (facts.practitioner.get(practitionerId) ?? null),
    canReschedule: terms.canReschedule,
    canCancel: terms.canCancel,
    refund: terms.refund,
  }
}

const strip = ({ refund: _refund, ...booking }: AccountBooking & { refund: RefundPreview }) =>
  booking as AccountBooking

/**
 * The account's bookings, upcoming (soonest first; a time request, which has no time yet, last)
 * or past (latest first). A booking that was moved, or a hold that ran out, is not listed.
 */
export const listOwnBookings: ListOwnBookings = async (req, account, when, now) => {
  const ids = await ownPersonIds(req, account)
  const rows = (await findOwnBookings(req, ids, {
    select: BOOKING_FIELDS,
    where: { status: { not_in: [...UNLISTED_STATUSES] } },
    sort: '-startsAt',
  })) as BookingRow[]
  const chosen = rows.filter((row) => (when === 'upcoming') === isAhead(row, now))
  const at = (row: BookingRow) => instant(row.startsAt)?.getTime() ?? Number.POSITIVE_INFINITY
  chosen.sort((a, b) => (when === 'upcoming' ? at(a) - at(b) : at(b) - at(a)))
  const facts = await factsFor(req, chosen)
  const described = []
  for (const row of chosen) described.push(strip(await describe(req, row, facts, now)))
  return described
}

/** One booking of the account's by its reference, or null for any other (D-127). */
async function ownRow(
  req: PayloadRequest,
  account: AccountSession,
  reference: string,
): Promise<BookingRow | null> {
  const parsed = Reference.safeParse(reference)
  if (!parsed.success) return null
  const ids = await ownPersonIds(req, account)
  const [row] = await findOwnBookings(req, ids, {
    select: BOOKING_FIELDS,
    where: { reference: { equals: parsed.data } },
    limit: 1,
  })
  return (row as BookingRow | undefined) ?? null
}

export const getOwnBooking: GetOwnBooking = async (req, account, reference, now) => {
  const row = await ownRow(req, account, reference)
  if (!row) return null
  return strip(await describe(req, row, await factsFor(req, [row]), now))
}

/**
 * A booking's page (docs/20 §7.2): the booking, what its confirmation names besides (the option
 * and its length), the refund a cancellation would give now, and the booking it became when it
 * was moved. Null for a booking that is not the account's.
 */
export async function ownBookingPage(
  req: PayloadRequest,
  account: AccountSession,
  reference: string,
  now: Date,
): Promise<{
  booking: AccountBooking
  optionLabel: string | null
  durationMinutes: number | null
  refund: RefundPreview
  movedTo: string | null
} | null> {
  const row = await ownRow(req, account, reference)
  if (!row) return null
  const described = await describe(req, row, await factsFor(req, [row]), now)
  let movedTo: string | null = null
  if (row.status === 'rescheduled') {
    const ids = await ownPersonIds(req, account)
    const [next] = await findOwnBookings(req, ids, {
      select: { reference: true },
      where: { rescheduledFrom: { equals: row.id } },
      limit: 1,
    })
    movedTo = next?.reference ?? null
  }
  return {
    booking: strip(described),
    optionLabel: row.optionLabel ?? null,
    durationMinutes: row.durationMinutes ?? null,
    refund: described.refund,
    movedTo,
  }
}

/**
 * The free times a booking of the account's may move to (M3's `listSlots`, as the manage link's
 * `manageTimesAction` asks it), only while the client may move it.
 */
export async function ownFreeTimes(
  req: PayloadRequest,
  account: AccountSession,
  reference: string,
  now: Date,
): Promise<
  Result<{ days: { day: string; starts: string[] }[] }, { code: 'not-found' | 'outside-policy' }>
> {
  const row = await ownRow(req, account, reference)
  if (!row) return err({ code: 'not-found' })
  const facts = await factsFor(req, [row])
  const serviceId = idOf(row.service)
  const terms = await termsOf(
    req,
    row,
    serviceId === null ? null : (facts.service.get(serviceId) ?? null),
    now,
  )
  const practitionerId = idOf(row.practitioner)
  if (!terms.canReschedule || serviceId === null || practitionerId === null || !row.serviceOption) {
    return err({ code: 'outside-policy' })
  }
  const listed = await listSlots(
    req,
    { serviceId, serviceOption: row.serviceOption, practitionerId },
    now,
  )
  return listed.ok ? ok(listed.value) : err({ code: 'outside-policy' })
}

/**
 * The booking's calendar invite (M3's `bookingInvite`, the one its confirmation carries), for a
 * confirmed booking of the account's with a time; null otherwise.
 */
export async function ownBookingInvite(
  req: PayloadRequest,
  account: AccountSession,
  reference: string,
  siteUrl: string,
): Promise<{ reference: string; ics: string } | null> {
  const row = await ownRow(req, account, reference)
  if (!row || row.status !== 'confirmed' || !row.startsAt) return null
  const invite = await bookingInvite(req, { bookingId: row.id, siteUrl })
  return invite.ok ? { reference: row.reference, ics: invite.value } : null
}

/** A booking module refusal, as My IIIC answers it. */
function fromBooking(error: BookingError | { code: 'refund-held' }): ManageOwnBookingError {
  switch (error.code) {
    case 'not-found':
      return { code: 'not-found' }
    case 'slot-taken':
    case 'outside-hours':
      return { code: 'slot-taken' }
    default:
      return { code: 'outside-policy' }
  }
}

/**
 * Moves or cancels a booking of the account's (docs/20 §7.2), with what the cancellation did
 * about money; `manageOwnBooking` is the contract's view of it.
 */
export async function changeOwnBooking(
  req: PayloadRequest,
  account: AccountSession,
  raw: ManageOwnBookingInput,
  now: Date,
): Promise<
  Result<{ booking: AccountBooking; cancelled: CancelOutcome | null }, ManageOwnBookingError>
> {
  if (!bookingsStoreHere(env())) return err({ code: 'closed-here' })
  const parsed = ManageInput.safeParse(raw)
  if (!parsed.success) return err({ code: 'invalid-input' })
  const input = parsed.data
  const row = await ownRow(req, account, input.reference)
  if (!row) return err({ code: 'not-found' })

  if (input.kind === 'reschedule') {
    const moved = await inTransaction(
      req,
      async (): Promise<Result<Booking, BookingError>> => {
        const done = await rescheduleBooking(req, {
          bookingId: row.id,
          startsAt: new Date(input.startsAt),
          by: 'client',
          now,
        })
        if (!done.ok) return done
        // The old booking's payment link would pay for a booking that moved (docs/16 §5).
        const closed = await payments().closeOpenLinks(req, done.value.id)
        if (!closed.ok) throw new Error('The open payment links could not be closed.')
        return done
      },
      keepOk,
    )
    if (!moved.ok) return err(fromBooking(moved.error))
    const booking = await getOwnBooking(req, account, moved.value.reference, now)
    if (!booking) throw new Error('The moved booking is not the account’s.')
    return ok({ booking, cancelled: null })
  }

  const cancelled = await inTransaction(
    req,
    async (): Promise<
      Result<
        { refundPaise: number; awaitsOwner: boolean; toSend: number[] },
        BookingError | { code: 'refund-held' }
      >
    > => {
      const done = await cancelBooking(req, {
        bookingId: row.id,
        by: 'client',
        reason: input.reason || undefined,
        asker: 'client',
        now,
      })
      if (!done.ok) return done
      // No payment link is left to pay for a booking that has ended (docs/16 §5).
      const closed = await payments().closeOpenLinks(req, row.id)
      if (!closed.ok) throw new Error('The open payment links could not be closed.')
      const refund = await requestClientRefund(req, {
        booking: done.value.booking,
        amountPaise: done.value.refundPaise,
      })
      // The rule's refund is what the client was shown: when the payments cannot give it all
      // back, nothing changes and the office takes it from here.
      if (refund.requestedPaise < done.value.refundPaise) return err({ code: 'refund-held' })
      return ok({
        refundPaise: done.value.refundPaise,
        awaitsOwner: refund.awaitingOwner,
        toSend: refund.toSend,
      })
    },
    keepOk,
  )
  if (!cancelled.ok) return err(fromBooking(cancelled.error))
  await payments().sendRefunds(req.payload, cancelled.value.toSend)
  const booking = await getOwnBooking(req, account, row.reference, now)
  if (!booking) throw new Error('The cancelled booking is not the account’s.')
  return ok({
    booking,
    cancelled: {
      refunded: cancelled.value.refundPaise > 0,
      awaitsOwner: cancelled.value.awaitsOwner,
    },
  })
}

export const manageOwnBooking: ManageOwnBooking = async (req, account, input, now) => {
  const changed = await changeOwnBooking(req, account, input, now)
  return changed.ok ? ok(changed.value.booking) : changed
}
