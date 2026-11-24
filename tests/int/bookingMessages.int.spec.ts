import { sql } from '@payloadcms/db-postgres'
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Booking, Payment, Person, Practitioner, Service, User } from '@/payload-types'
import config from '@/payload.config'

import { removeQueuedJobs } from '../helpers/queuedJobs'

vi.mock('server-only', () => ({}))

const { err, ok } = await import('@/lib/result')
const { runBookingTask, CoreNotWired } = await import('@/lib/automations/booking/tasks')
const { FakeMessagingCore } = await import('@/lib/automations/booking/fakeCore')
const { emitterFor } = await import('@/lib/booking/emit')
const { AUTOMATION_LISTENERS } = await import('@/lib/automations/listeners')
const { atIst } = await import('@/lib/booking/slots')
const loaders = await import('@/emails/booking/load')

// The B-series against the real Postgres (docs/19 §11), with the messaging core's fake: an event
// queues each task once, a task run twice records each message once, reminders are due at their
// rule's time on the person's channel, a reschedule cancels the old booking's reminders and plans
// the new booking's, a cancellation cancels them, and the loaders answer `stale` for a booking
// that changed. Every name, time and address is obviously fake; the days are far ahead and no
// other test uses them; everything this file writes or queues is removed at the end.

let payload: Payload
const TAG = 'int.messages'
let service: Service
let person: Person
let emailOnly: Person
let practitioner: Practitioner
let staff: User
let keys = 0

/** Days no other test uses: 2099-06-01 is a Monday. */
const at = (day: string, clock: string) => atIst(day, clock)
const NOW = at('2099-05-25', '09:00')
const HOUR = 60 * 60 * 1000

const fresh = (): Promise<PayloadRequest> => createLocalReq({}, payload)

async function removeTestData() {
  const bookings = await payload.find({
    collection: 'bookings',
    where: { 'person.fullName': { like: TAG } },
    pagination: false,
    depth: 0,
  })
  const bookingIds = bookings.docs.map((booking) => booking.id)
  if (bookingIds.length) {
    const payments = await payload.find({
      collection: 'payments',
      where: { booking: { in: bookingIds } },
      pagination: false,
      depth: 0,
    })
    for (const payment of payments.docs) {
      await payload.db.drizzle.execute(
        sql`DELETE FROM "payload_jobs" WHERE "input"->>'paymentId' = ${String(payment.id)}`,
      )
    }
    await payload.delete({ collection: 'payments', where: { booking: { in: bookingIds } } })
  }
  await removeQueuedJobs(payload, { bookingIds })
  await payload.delete({ collection: 'bookings', where: { 'person.fullName': { like: TAG } } })
  await payload.delete({ collection: 'practitioners', where: { publicName: { like: TAG } } })
  await payload.delete({ collection: 'services', where: { slug: { like: 'int-messages' } } })
  await payload.delete({ collection: 'people', where: { fullName: { like: TAG } } })
  await payload.delete({ collection: 'users', where: { email: { like: `${TAG}.` } } })
}

/** A confirmed online booking, written as it stands, past the booking module. */
function confirmed(
  startsAt: Date,
  extra: Partial<Booking> & { confirmedAt?: string } = {},
): Promise<Booking> {
  return payload.create({
    collection: 'bookings',
    data: {
      reference: `IM-${Date.now().toString(36)}-${++keys}`,
      type: 'session',
      status: 'confirmed',
      paymentStatus: 'unpaid',
      service: service.id,
      serviceOption: service.options?.[0]?.id as string,
      durationMinutes: 30,
      person: person.id,
      practitioner: practitioner.id,
      format: 'online',
      meetingUrl: 'https://meet.example.invalid/fake-int-link',
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000).toISOString(),
      confirmedAt: new Date(NOW.getTime() - 24 * HOUR).toISOString(),
      ...extra,
    } as Booking,
  })
}

function paymentLinkFor(booking: Booking): Promise<Payment> {
  return payload.create({
    collection: 'payments',
    data: {
      booking: booking.id,
      kind: 'paymentLink',
      gateway: 'razorpay',
      status: 'created',
      amountPaise: 150000,
      currency: 'INR',
      refundedPaise: 0,
      receipt: `im-${Date.now().toString(36)}-${++keys}`,
      linkUrl: 'https://pay.example.invalid/fake-int',
    } as Payment,
  })
}

let core: InstanceType<typeof FakeMessagingCore>

/** Runs one B-series task with the fake core and the fixed clock. */
async function run(slug: Parameters<typeof runBookingTask>[0], input: unknown, now = NOW) {
  return runBookingTask(slug, input, await fresh(), { core: async () => ok(core), now })
}

const rowsFor = (bookingId: number, automation?: string) =>
  core.rows.filter(
    (row) =>
      row.planned.subject.collection === 'bookings' &&
      row.planned.subject.id === bookingId &&
      (!automation || row.planned.automation === automation),
  )

beforeAll(async () => {
  payload = await getPayload({ config })
  await removeTestData()
  // An owner first: on an empty database the first account becomes the owner
  // (src/collections/Users.ts), and an owner is not a practitioner's staff account.
  await payload.create({
    collection: 'users',
    data: {
      name: 'Fake owner',
      email: `${TAG}.owner@example.invalid`,
      password: 'test-only-password-messages',
      roles: ['owner'],
    } as User,
  })
  staff = await payload.create({
    collection: 'users',
    data: {
      name: 'Fake practitioner',
      email: `${TAG}.practitioner@example.invalid`,
      password: 'test-only-password-messages',
      roles: ['practitioner'],
    } as User,
  })
  service = await payload.create({
    collection: 'services',
    data: {
      name: `Fake service ${TAG}`,
      type: 'session',
      slug: `int-messages-${Date.now()}`,
      register: 'counselling',
      format: 'online',
      active: true,
      options: [{ label: 'Fake 30', duration: 30 }],
    } as Service,
  })
  practitioner = await payload.create({
    collection: 'practitioners',
    data: {
      publicName: `Fake ${TAG} one`,
      active: true,
      services: [service.id],
      staff: staff.id,
    } as Practitioner,
  })
  person = await payload.create({
    collection: 'people',
    data: { fullName: `Fake Person ${TAG}` } as Person,
  })
  emailOnly = await payload.create({
    collection: 'people',
    data: { fullName: `Fakemail Person ${TAG}`, preferredChannel: 'email' } as Person,
  })
})

beforeEach(() => {
  core = new FakeMessagingCore()
})

afterAll(async () => {
  await removeTestData()
})

describe('fires once', () => {
  it('queues B2 once for an event emitted twice, and records each message once', async () => {
    const booking = await confirmed(at('2099-06-01', '10:00'))
    const event = { name: 'booking.confirmed', bookingId: booking.id, cause: 'staff' } as const
    // The catalogue subscribes B2 to the event; only B2 is queued here, since other builders'
    // tasks are registered when the branches are joined.
    expect(AUTOMATION_LISTENERS['booking.confirmed']).toContain('B2-confirmation')
    const emit = emitterFor({ 'booking.confirmed': ['B2-confirmation'] })
    const req = await fresh()
    await emit(req, event)
    await emit(req, event)
    const { docs } = await payload.find({
      collection: 'payload-jobs',
      where: {
        and: [
          { taskSlug: { equals: 'B2-confirmation' } },
          { 'input.key': { equals: `booking.confirmed:${booking.id}` } },
        ],
      },
      depth: 0,
    })
    expect(docs).toHaveLength(1)
    const input = docs[0]?.input

    const first = await run('B2-confirmation', input)
    const second = await run('B2-confirmation', input)
    expect(first).toMatchObject({ outcome: 'done', planned: 2, created: 2 })
    expect(second).toMatchObject({ outcome: 'done', planned: 2, created: 0 })
    expect(rowsFor(booking.id).map((row) => row.planned.channel)).toEqual(['email', 'whatsapp'])
    await removeQueuedJobs(payload, { bookingIds: [booking.id] })
  })

  it('refuses an input that is not an event, and fails visibly when no core answers', async () => {
    expect(await run('B2-confirmation', { name: 'booking.confirmed' })).toMatchObject({
      outcome: 'bad-input',
      planned: 0,
    })
    const booking = await confirmed(at('2099-06-01', '11:00'))
    const event = { name: 'booking.confirmed', bookingId: booking.id, cause: 'staff' }
    const missing = async () => err({ code: 'core-not-wired' as const })
    await expect(
      runBookingTask('B2-confirmation', event, await fresh(), { core: missing }),
    ).rejects.toBeInstanceOf(CoreNotWired)
  })
})

describe('the reminders: right time, right channel', () => {
  it('plans B5 24 hours before on WhatsApp with email as its fallback, and B6 30 minutes before', async () => {
    const startsAt = at('2099-06-02', '11:00')
    const booking = await confirmed(startsAt)
    const event = { name: 'booking.confirmed', bookingId: booking.id, cause: 'staff' }
    await run('B5-reminder-24h', event)
    await run('B6-reminder-2h', event)
    const [b5] = rowsFor(booking.id, 'B5')
    const [b6] = rowsFor(booking.id, 'B6')
    expect(b5?.planned).toMatchObject({ channel: 'whatsapp', fallback: 'email' })
    expect(b5?.planned.sendAt).toEqual(new Date(startsAt.getTime() - 24 * HOUR))
    expect(b5?.planned.sendBefore).toEqual(startsAt)
    expect(b6?.planned).toMatchObject({ channel: 'whatsapp' })
    expect(b6?.planned.sendAt).toEqual(new Date(startsAt.getTime() - 30 * 60 * 1000))
  })

  it('sends B5 by email and no B6 to someone who prefers email', async () => {
    const booking = await confirmed(at('2099-06-02', '12:00'), { bookedBy: emailOnly.id })
    const event = { name: 'booking.confirmed', bookingId: booking.id, cause: 'staff' }
    await run('B5-reminder-24h', event)
    await run('B6-reminder-2h', event)
    expect(rowsFor(booking.id).map((row) => [row.planned.automation, row.planned.channel])).toEqual(
      [['B5', 'email']],
    )
    expect(rowsFor(booking.id)[0]?.planned.recipient).toEqual({
      kind: 'person',
      id: emailOnly.id,
    })
  })

  it('plans no B5 for a booking confirmed 20 hours ahead', async () => {
    const startsAt = at('2099-06-03', '10:00')
    const booking = await confirmed(startsAt, {
      confirmedAt: new Date(startsAt.getTime() - 20 * HOUR).toISOString(),
    })
    const event = { name: 'booking.confirmed', bookingId: booking.id, cause: 'staff' }
    const now = new Date(startsAt.getTime() - 20 * HOUR)
    expect(await run('B5-reminder-24h', event, now)).toMatchObject({ planned: 0 })
    expect(await run('B6-reminder-2h', event, now)).toMatchObject({ planned: 1 })
  })
})

describe('re-planning', () => {
  it('a reschedule cancels the old booking’s reminders and plans the new booking’s', async () => {
    const oldStart = at('2099-06-04', '10:00')
    const newStart = at('2099-06-05', '12:00')
    const old = await confirmed(oldStart)
    const confirmedEvent = { name: 'booking.confirmed', bookingId: old.id, cause: 'staff' }
    await run('B5-reminder-24h', confirmedEvent)
    await run('B6-reminder-2h', confirmedEvent)
    expect(rowsFor(old.id)).toHaveLength(2)

    await payload.update({ collection: 'bookings', id: old.id, data: { status: 'rescheduled' } })
    const moved = await confirmed(newStart, { rescheduledFrom: old.id })
    const event = { name: 'booking.rescheduled', bookingId: moved.id, fromBookingId: old.id }
    expect(await run('B5-reminder-24h', event)).toMatchObject({ cancelled: 1, created: 1 })
    expect(await run('B6-reminder-2h', event)).toMatchObject({ cancelled: 1, created: 1 })

    expect(rowsFor(old.id).every((row) => row.status === 'cancelled')).toBe(true)
    const [b5] = rowsFor(moved.id, 'B5')
    const [b6] = rowsFor(moved.id, 'B6')
    expect(b5?.status).toBe('queued')
    expect(b5?.planned.sendAt).toEqual(new Date(newStart.getTime() - 24 * HOUR))
    expect(b6?.planned.sendAt).toEqual(new Date(newStart.getTime() - 30 * 60 * 1000))

    // B7 tells the client on both channels and the practitioner from the platform.
    await run('B7-change-notice', event)
    const notices = core.rows.filter((row) => row.planned.automation === 'B7')
    expect(notices.map((row) => [row.planned.channel, row.planned.recipient.kind])).toEqual([
      ['email', 'person'],
      ['whatsapp', 'person'],
      ['email', 'staff'],
    ])
    expect(notices[2]?.planned.recipient).toEqual({ kind: 'staff', id: staff.id })

    // A replay of the reschedule changes nothing.
    expect(await run('B5-reminder-24h', event)).toMatchObject({ cancelled: 0, created: 0 })
  })

  it('a cancellation cancels the queued reminders and tells the client once', async () => {
    const booking = await confirmed(at('2099-06-06', '10:00'))
    const confirmedEvent = { name: 'booking.confirmed', bookingId: booking.id, cause: 'staff' }
    await run('B5-reminder-24h', confirmedEvent)
    await run('B6-reminder-2h', confirmedEvent)
    await payload.update({
      collection: 'bookings',
      id: booking.id,
      data: { status: 'cancelledByClient' },
    })
    const event = { name: 'booking.cancelled', bookingId: booking.id, by: 'client' }
    expect(await run('B5-reminder-24h', event)).toMatchObject({ cancelled: 1, planned: 0 })
    expect(await run('B6-reminder-2h', event)).toMatchObject({ cancelled: 1, planned: 0 })
    expect(await run('B7-change-notice', event)).toMatchObject({ created: 3 })
    expect(await run('B7-change-notice', event)).toMatchObject({ created: 0 })
    expect(core.queuedKeys().some((key) => key.startsWith('B5:') || key.startsWith('B6:'))).toBe(
      false,
    )
  })

  it('B13: a new link cancels the earlier link’s reminder; a cancellation cancels the rest', async () => {
    const startsAt = at('2099-06-08', '10:00')
    const booking = await confirmed(startsAt)
    const first = await paymentLinkFor(booking)
    const linkSent = (paymentId: number) => ({
      name: 'payment.linkSent',
      paymentId,
      bookingId: booking.id,
    })
    expect(await run('B13-payment-link', linkSent(first.id))).toMatchObject({ created: 3 })
    const reminder = core.rows.find((row) => row.planned.template === 'payment-link-reminder')
    expect(reminder?.planned.sendAt).toEqual(new Date(startsAt.getTime() - 24 * HOUR))

    // The fake sends nothing, so the first link's three rows are all still queued: a new link
    // cancels every one of them (a real link message already sent is no longer queued).
    const second = await paymentLinkFor(booking)
    expect(await run('B13-payment-link', linkSent(second.id))).toMatchObject({
      cancelled: 3,
      created: 3,
    })
    expect(core.queuedKeys().filter((key) => key.startsWith('B13:'))).toEqual([
      `B13:payments:${second.id}:email`,
      `B13:payments:${second.id}:whatsapp`,
      `B13:payments:${second.id}:reminder:email`,
    ])
    await payload.update({
      collection: 'bookings',
      id: booking.id,
      data: { status: 'cancelledByIiic' },
    })
    const cancelled = { name: 'booking.cancelled', bookingId: booking.id, by: 'iiic' }
    expect(await run('B13-payment-link', cancelled)).toMatchObject({ cancelled: 3 })
    expect(core.queuedKeys().filter((key) => key.startsWith('B13:'))).toEqual([])
  })
})

describe('the loaders, at send time', () => {
  const recipient = () => ({ kind: 'person' as const, id: person.id })

  it('read a confirmed booking: the first name, the service, the counselling flag', async () => {
    const startsAt = at('2099-06-09', '10:00')
    const booking = await confirmed(startsAt)
    const result = await loaders.loadConfirmed(await fresh(), {
      subject: { collection: 'bookings', id: booking.id },
      recipient: recipient(),
    })
    expect(result).toMatchObject({
      ok: true,
      value: {
        firstName: 'Fake',
        serviceName: `Fake service ${TAG}`,
        counselling: true,
        format: 'online',
        meetingUrl: 'https://meet.example.invalid/fake-int-link',
        paidPaise: null,
      },
    })
    // A booking the office confirmed has no manage token: its message issues one, and a retry
    // gives the same link (docs/19 §13).
    const manageUrl = result.ok ? result.value.manageUrl : null
    expect(manageUrl).toMatch(/\/b\/[\w-]{43}$/)
    const again = await loaders.loadConfirmed(await fresh(), {
      subject: { collection: 'bookings', id: booking.id },
      recipient: recipient(),
    })
    expect(again.ok && again.value.manageUrl).toBe(manageUrl)
  })

  it('answer stale for a reminder whose booking moved, was cancelled or was rescheduled', async () => {
    const startsAt = at('2099-06-10', '10:00')
    const booking = await confirmed(startsAt)
    const subject = { collection: 'bookings' as const, id: booking.id }
    const due = await loaders.loadReminder(await fresh(), {
      subject,
      recipient: recipient(),
      sendBefore: startsAt,
    })
    expect(due.ok).toBe(true)
    const moved = await loaders.loadReminder(await fresh(), {
      subject,
      recipient: recipient(),
      sendBefore: new Date(startsAt.getTime() + HOUR),
    })
    expect(moved).toEqual({ ok: false, error: { code: 'stale' } })
    await payload.update({
      collection: 'bookings',
      id: booking.id,
      data: { status: 'rescheduled' },
    })
    const gone = await loaders.loadReminder(await fresh(), {
      subject,
      recipient: recipient(),
      sendBefore: startsAt,
    })
    expect(gone).toEqual({ ok: false, error: { code: 'stale' } })
  })

  it('answer stale for a payment link once the booking is paid', async () => {
    const booking = await confirmed(at('2099-06-11', '10:00'))
    const payment = await paymentLinkFor(booking)
    const input = {
      subject: { collection: 'payments' as const, id: payment.id },
      recipient: recipient(),
    }
    const open = await loaders.loadPaymentLink(await fresh(), input)
    expect(open).toMatchObject({
      ok: true,
      value: { amountPaise: 150000, linkUrl: 'https://pay.example.invalid/fake-int' },
    })
    await payload.update({
      collection: 'bookings',
      id: booking.id,
      data: { paymentStatus: 'paid' },
    })
    expect(await loaders.loadPaymentLink(await fresh(), input)).toEqual({
      ok: false,
      error: { code: 'stale' },
    })
  })

  it('tell the practitioner of a move by reference and times, and nothing for a client', async () => {
    const oldStart = at('2099-06-12', '10:00')
    const old = await confirmed(oldStart)
    await payload.update({ collection: 'bookings', id: old.id, data: { status: 'rescheduled' } })
    const moved = await confirmed(at('2099-06-12', '12:00'), { rescheduledFrom: old.id })
    const subject = { collection: 'bookings' as const, id: moved.id }
    const result = await loaders.loadStaffChange(await fresh(), {
      subject,
      recipient: { kind: 'staff', id: staff.id },
    })
    expect(result).toMatchObject({
      ok: true,
      value: { change: 'rescheduled', reference: moved.reference, fromStartsAt: oldStart },
    })
    expect(JSON.stringify(result)).not.toContain('Fake Person')
    expect(
      await loaders.loadStaffChange(await fresh(), { subject, recipient: recipient() }),
    ).toEqual({ ok: false, error: { code: 'not-found' } })
  })
})
