import { sql } from '@payloadcms/db-postgres'
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { PaymentsDeps } from '@/lib/payments/deps'
import { FakeGateway } from '@/lib/payments/fakeGateway'
import { parseRazorpayEvent } from '@/lib/payments/webhookEvent'
import { ok } from '@/lib/result'
import type {
  Booking,
  Person,
  PlatformSettings,
  Practitioner,
  Service,
  User,
} from '@/payload-types'
import config from '@/payload.config'

vi.mock('server-only', () => ({}))

const { confirmBooking } = await import('@/lib/booking/confirm')
const { emit } = await import('@/lib/booking/emit')
const { atIst } = await import('@/lib/booking/slots')
const { makePayments } = await import('@/lib/payments/service')
const { makeOfficeActions, AUDIT_ACTIONS } = await import('@/lib/office/actions')

// The office's money and calendar actions against the real Postgres (docs/16 §12, E): every
// action refuses an anonymous request, a session without the two-factor code and a role it does
// not serve, before it reads or writes anything; each one that changes a record leaves entries in
// the audit log under its own name, with the staff member who made it. The gateway is the fake;
// the booking module's ConfirmBooking and emit are the real ones. Every person, profile, price
// and rule is obviously fake, at days far ahead no other test uses, and removed at the end;
// settings are put back.

let payload: Payload
const TAG = 'int.office'
const REF = 'INT-OFF-'
let service: Service
let person: Person
let practitioner: Practitioner
let otherPractitioner: Practitioner
const staff = {} as Record<'owner' | 'operator' | 'practitioner' | 'finance' | 'editor', User>
let savedSettings: Pick<PlatformSettings, 'flags' | 'money'>
let made = 0

const gateway = new FakeGateway('fake-webhook-secret-for-office-tests-only')
const deps: PaymentsDeps = {
  gateway: () => ok(gateway),
  confirmBooking,
  emit,
  now: () => new Date(),
}
const payments = makePayments(deps)
const office = makeOfficeActions({ payments, now: () => new Date() })

/** Days far ahead that no other test uses. */
const DAY = '2099-05-04'
const at = (clock: string, day = DAY) => atIst(day, clock)
/** The datetime-local value the admin's time field posts for a time in India. */
const field = (clock: string, day = DAY) => `${day}T${clock}`

const fresh = (): Promise<PayloadRequest> => createLocalReq({}, payload)
const as = (user: User, strategy = 'totp'): Promise<PayloadRequest> =>
  createLocalReq({ user: { ...user, collection: 'users', _strategy: strategy } as User }, payload)

async function removeTestData() {
  const { docs: bookings } = await payload.find({
    collection: 'bookings',
    where: { 'person.fullName': { like: TAG } },
    pagination: false,
    depth: 0,
  })
  const ids = bookings.map((booking) => booking.id)
  for (const id of ids) {
    await payload.db.drizzle.execute(
      sql`DELETE FROM "payload_jobs" WHERE "input"->>'bookingId' = ${String(id)}`,
    )
  }
  if (ids.length) {
    await payload.delete({ collection: 'gateway-events', where: { eventId: { like: 'fake' } } })
    await payload.delete({ collection: 'refunds', where: { booking: { in: ids } } })
    await payload.delete({ collection: 'payments', where: { booking: { in: ids } } })
  }
  await payload.delete({ collection: 'bookings', where: { 'person.fullName': { like: TAG } } })
  for (const collection of ['availability-rules', 'availability-exceptions'] as const) {
    await payload.delete({ collection, where: { 'practitioner.publicName': { like: TAG } } })
  }
  await payload.delete({ collection: 'practitioners', where: { publicName: { like: TAG } } })
  await payload.delete({ collection: 'services', where: { slug: { like: 'int-office' } } })
  await payload.delete({ collection: 'people', where: { fullName: { like: TAG } } })
  await payload.delete({ collection: 'users', where: { email: { like: `${TAG}.` } } })
}

/** A booking as it stands, written past the modules. */
function book(status: Booking['status'], from: string, extra: Partial<Booking> = {}, day = DAY) {
  const startsAt = at(from, day)
  return payload.create({
    collection: 'bookings',
    data: {
      reference: `${REF}${Date.now().toString(36)}-${++made}`,
      type: 'session',
      status,
      paymentStatus: 'unpaid',
      service: service.id,
      serviceOption: service.options?.[0]?.id ?? null,
      durationMinutes: 30,
      person: person.id,
      practitioner: practitioner.id,
      format: 'online',
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 30 * 60_000).toISOString(),
      price: { totalPaise: 50_000, taxPaise: 7627, gstRateBasisPoints: 1800, sacCode: '000000' },
      ...extra,
    } as Booking,
  })
}

/** A booking paid at checkout: held, the order opened, the fake's capture processed. */
async function paidBooking(from: string, day = DAY): Promise<Booking> {
  const held = await book(
    'held',
    from,
    { holdExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString() },
    day,
  )
  const opened = await payments.openCheckout(await fresh(), { bookingId: held.id })
  if (!opened.ok) throw new Error(`checkout refused: ${opened.error.code}`)
  const sent = gateway.pay(opened.value.orderId)
  const parsed = parseRazorpayEvent(sent.rawBody, sent.eventId)
  if (!parsed.ok) throw new Error(parsed.error.code)
  const processed = await payments.processGatewayEvent(await fresh(), parsed.value, 'webhook')
  if (!processed.ok) throw new Error(processed.error.code)
  const booking = await reread(held.id)
  if (booking.status !== 'confirmed' || booking.paymentStatus !== 'paid') {
    throw new Error('the fake payment did not confirm the booking')
  }
  return booking
}

const reread = (id: number) => payload.findByID({ collection: 'bookings', id, depth: 0 })

/** The audit entries an action left on one record. */
async function auditOf(action: string, entity: string, entityId: number) {
  const { docs } = await payload.find({
    collection: 'audit-log',
    where: {
      and: [
        { action: { equals: action } },
        { entity: { equals: entity } },
        { entityId: { equals: String(entityId) } },
      ],
    },
    depth: 0,
    pagination: false,
  })
  return docs
}

async function auditCount(entity: string, entityId: number) {
  const { totalDocs } = await payload.count({
    collection: 'audit-log',
    where: { and: [{ entity: { equals: entity } }, { entityId: { equals: String(entityId) } }] },
  })
  return totalDocs
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await removeTestData()
  savedSettings = await payload.findGlobal({
    slug: 'settings',
    select: { flags: true, money: true },
    depth: 0,
  })
  for (const role of ['owner', 'operator', 'practitioner', 'finance', 'editor'] as const) {
    staff[role] = await payload.create({
      collection: 'users',
      data: {
        name: `Fake ${role}`,
        email: `${TAG}.${role}@example.invalid`,
        password: 'test-only-password-office',
        roles: [role],
      },
    })
  }
  service = await payload.create({
    collection: 'services',
    data: {
      name: `Fake service ${TAG}`,
      type: 'session',
      slug: `int-office-${Date.now()}`,
      register: 'counselling',
      format: 'online',
      active: true,
      options: [{ label: 'Fake 30', duration: 30 }],
      // Fake rules: no notice, three days ahead, no buffer, a ten-minute hold.
      bookingRules: { noticeHours: 0, horizonDays: 3, bufferMinutes: 0, holdMinutes: 10 },
    } as Service,
  })
  practitioner = await payload.create({
    collection: 'practitioners',
    data: {
      publicName: `Fake ${TAG} one`,
      active: true,
      services: [service.id],
      staff: staff.practitioner.id,
    } as Practitioner,
  })
  otherPractitioner = await payload.create({
    collection: 'practitioners',
    data: { publicName: `Fake ${TAG} two`, active: true, services: [service.id] } as Practitioner,
  })
  for (const profile of [practitioner, otherPractitioner]) {
    for (const weekday of [
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ] as const) {
      await payload.create({
        collection: 'availability-rules',
        data: {
          practitioner: profile.id,
          weekday,
          spans: [{ start: '10:00', end: '13:00' }],
          validFrom: '2026-01-01',
        },
      })
    }
  }
  person = await payload.create({
    collection: 'people',
    data: { fullName: `Fake Person ${TAG}` } as Person,
  })
  // Payment at booking on, so the fake checkout runs; no refund threshold, so every refund
  // waits for an owner (docs/16 §5).
  await payload.updateGlobal({
    slug: 'settings',
    data: {
      flags: { ...savedSettings.flags, pricesPublic: true, payAtBooking: true },
      money: { refundApprovalThresholdPaise: null },
    },
  })
})

afterAll(async () => {
  await payload.updateGlobal({
    slug: 'settings',
    data: { flags: savedSettings.flags, money: savedSettings.money },
  })
  await removeTestData()
})

describe('every action checks the user, the code and the role first (CLAUDE.md #6)', () => {
  it('refuses anonymous, codeless and wrong-role requests, and changes nothing', async () => {
    const booking = await book('confirmed', '10:00')
    const requested = await book('requested', '11:00', { startsAt: null, endsAt: null })
    const entriesBefore = await auditCount('bookings', booking.id)
    const cancel = {
      by: 'iiic',
      reason: 'Fake reason',
      shownClientPaise: 0,
      shownIiicPaise: 0,
    }
    const attempts = {
      cancelPreview: (req: PayloadRequest) => office.cancelPreview(req, booking.id),
      cancel: (req: PayloadRequest) => office.cancel(req, booking.id, cancel),
      reschedule: (req: PayloadRequest) =>
        office.reschedule(req, booking.id, { startsAt: field('12:00') }),
      confirmTime: (req: PayloadRequest) =>
        office.confirmTime(req, requested.id, { startsAt: field('12:30') }),
      paymentLink: (req: PayloadRequest) => office.paymentLink(req, booking.id, {}),
      resendRefund: (req: PayloadRequest) => office.resendRefund(req, 1),
    }
    for (const [label, attempt] of Object.entries(attempts)) {
      expect(await attempt(await fresh()), label).toEqual({
        ok: false,
        error: { code: 'sign-in' },
      })
      expect(await attempt(await as(staff.operator, 'local-jwt')), label).toEqual({
        ok: false,
        error: { code: 'enter-code' },
      })
      for (const role of ['practitioner', 'finance', 'editor'] as const) {
        expect(await attempt(await as(staff[role])), `${label} as ${role}`).toEqual({
          ok: false,
          error: { code: 'not-allowed' },
        })
      }
    }
    expect(await reread(booking.id)).toMatchObject({ status: 'confirmed', paymentStatus: 'unpaid' })
    expect((await reread(requested.id)).status).toBe('requested')
    expect(await auditCount('bookings', booking.id)).toBe(entriesBefore)
    const { totalDocs: links } = await payload.count({
      collection: 'payments',
      where: { booking: { equals: booking.id } },
    })
    expect(links).toBe(0)
  })

  it('lets only an owner with the code decide a refund', async () => {
    const booking = await paidBooking('10:30')
    const done = await office.cancel(await as(staff.operator), booking.id, {
      by: 'iiic',
      reason: 'Fake reason',
      shownClientPaise: 0,
      shownIiicPaise: 50_000,
    })
    if (!done.ok) throw new Error(done.error.code)
    const refund = done.value.refunds[0]
    if (!refund) throw new Error('no refund requested')
    const decide = { decision: 'approve' }
    expect(await office.decideRefund(await fresh(), refund.id, decide)).toEqual({
      ok: false,
      error: { code: 'sign-in' },
    })
    expect(
      await office.decideRefund(await as(staff.owner, 'local-jwt'), refund.id, decide),
    ).toEqual({ ok: false, error: { code: 'enter-code' } })
    for (const role of ['operator', 'practitioner', 'finance', 'editor'] as const) {
      expect(await office.decideRefund(await as(staff[role]), refund.id, decide)).toEqual({
        ok: false,
        error: { code: 'not-allowed' },
      })
    }
    const still = await payload.findByID({ collection: 'refunds', id: refund.id, depth: 0 })
    expect(still.status).toBe('awaitingApproval')
    expect(await auditOf(AUDIT_ACTIONS.decideRefund, 'refunds', refund.id)).toHaveLength(0)
  })

  it('shows working hours to a practitioner for their own profile only', async () => {
    const option = `${service.id}:${service.options?.[0]?.id}`
    expect(await office.previewHours(await fresh(), { option })).toEqual({
      ok: false,
      error: { code: 'sign-in' },
    })
    expect(
      await office.previewHours(await as(staff.practitioner, 'local-jwt'), { option }),
    ).toEqual({ ok: false, error: { code: 'enter-code' } })
    for (const role of ['finance', 'editor'] as const) {
      expect(await office.previewHours(await as(staff[role]), { option })).toEqual({
        ok: false,
        error: { code: 'not-allowed' },
      })
    }
    expect(
      await office.previewHours(await as(staff.practitioner), {
        option,
        practitionerId: otherPractitioner.id,
      }),
    ).toEqual({ ok: false, error: { code: 'not-own-profile' } })
    const own = await office.previewHours(await as(staff.practitioner), { option })
    expect(own.ok && own.value.practitionerId).toBe(practitioner.id)
    // No calendar is connected: the preview still shows the hours, and says so.
    expect(own.ok && own.value.calendarConnected).toBe(false)
    expect(own.ok && own.value.days.length).toBeGreaterThan(0)
    expect(await office.previewHours(await as(staff.operator), { option })).toEqual({
      ok: false,
      error: { code: 'invalid-input', fields: ['practitionerId'] },
    })
    const theirs = await office.previewHours(await as(staff.operator), {
      option,
      practitionerId: otherPractitioner.id,
    })
    expect(theirs.ok && theirs.value.practitionerId).toBe(otherPractitioner.id)
  })
})

describe('cancelling with the refund shown first (docs/05, Bookings)', () => {
  const CANCEL_DAY = '2099-05-11'

  it('shows the refund each side would give before anything changes', async () => {
    const booking = await paidBooking('11:30', CANCEL_DAY)
    const preview = await office.cancelPreview(await as(staff.operator), booking.id)
    expect(preview).toEqual({
      ok: true,
      value: {
        status: 'confirmed',
        paidPaise: 50_000,
        // No refund steps are set (D-16, I-07): the client's cancellation refunds nothing.
        refundRuleSet: false,
        client: { allowed: true, refundPaise: 0 },
        iiic: { allowed: true, refundPaise: 50_000 },
      },
    })
    expect((await reread(booking.id)).status).toBe('confirmed')
  })

  it('refuses when the refund shown is not the policy’s, and changes nothing', async () => {
    const booking = await paidBooking('12:00', CANCEL_DAY)
    expect(
      await office.cancel(await as(staff.operator), booking.id, {
        by: 'iiic',
        reason: 'Fake reason',
        shownClientPaise: 0,
        shownIiicPaise: 100,
      }),
    ).toEqual({
      ok: false,
      error: { code: 'refund-changed', clientPaise: 0, iiicPaise: 50_000 },
    })
    expect((await reread(booking.id)).status).toBe('confirmed')
    const { totalDocs } = await payload.count({
      collection: 'refunds',
      where: { booking: { equals: booking.id } },
    })
    expect(totalDocs).toBe(0)
  })

  it('cancels for IIIC with the full refund, waiting for an owner, all in the audit log', async () => {
    const booking = await paidBooking('12:30', CANCEL_DAY)
    const done = await office.cancel(await as(staff.operator), booking.id, {
      by: 'iiic',
      reason: 'Fake reason',
      shownClientPaise: 0,
      shownIiicPaise: 50_000,
    })
    expect(done.ok).toBe(true)
    if (!done.ok) return
    expect(done.value.booking.status).toBe('cancelledByIiic')
    expect(done.value.refunds).toHaveLength(1)
    const [refund] = done.value.refunds
    expect(refund).toMatchObject({
      amountPaise: 50_000,
      reason: 'cancelledByIiic',
      status: 'awaitingApproval',
      requestedBy: staff.operator.id,
      idempotencyKey: expect.stringMatching(/^cancel:/),
    })
    const entries = await auditOf(AUDIT_ACTIONS.cancel, 'bookings', booking.id)
    expect(entries.length).toBeGreaterThan(0)
    expect(entries[0]).toMatchObject({ actorId: String(staff.operator.id) })
    expect(await auditOf(AUDIT_ACTIONS.cancel, 'refunds', refund?.id as number)).not.toHaveLength(0)

    // The owner approves; the refund goes to the gateway after the decision commits.
    const decided = await office.decideRefund(await as(staff.owner), refund?.id as number, {
      decision: 'approve',
    })
    expect(decided.ok && decided.value.status).toBe('processed')
    const decision = await auditOf(AUDIT_ACTIONS.decideRefund, 'refunds', refund?.id as number)
    expect(decision.length).toBeGreaterThan(0)
    expect(decision[0]).toMatchObject({ actorId: String(staff.owner.id) })
    expect((await reread(booking.id)).paymentStatus).toBe('refunded')
  })

  it('cancels a free booking for the client with nothing to refund', async () => {
    const booking = await book(
      'confirmed',
      '13:00',
      { paymentStatus: 'notRequired', price: { totalPaise: 0, taxPaise: 0 } },
      CANCEL_DAY,
    )
    const done = await office.cancel(await as(staff.owner), booking.id, {
      by: 'client',
      reason: 'Fake reason',
      shownClientPaise: 0,
      shownIiicPaise: 0,
    })
    expect(done.ok && done.value.refunds).toEqual([])
    expect((await reread(booking.id)).status).toBe('cancelledByClient')
    expect(await auditOf(AUDIT_ACTIONS.cancel, 'bookings', booking.id)).not.toHaveLength(0)
  })
})

describe('moving, confirming and asking for payment', () => {
  it('moves a booking to a free time, and leaves both in the audit log', async () => {
    const booking = await book('confirmed', '10:00', {}, '2099-05-18')
    const moved = await office.reschedule(await as(staff.operator), booking.id, {
      startsAt: field('11:00', '2099-05-19'),
    })
    expect(moved.ok).toBe(true)
    if (!moved.ok) return
    expect(moved.value).toMatchObject({
      status: 'confirmed',
      rescheduledFrom: booking.id,
      startsAt: at('11:00', '2099-05-19').toISOString(),
    })
    expect((await reread(booking.id)).status).toBe('rescheduled')
    // The new booking has no manage link yet: whoever sends its confirmation issues one (M6).
    const created = await payload.findByID({
      collection: 'bookings',
      id: moved.value.id,
      showHiddenFields: true,
      depth: 0,
    })
    expect(created.manageTokenHash ?? null).toBeNull()
    expect(await auditOf(AUDIT_ACTIONS.reschedule, 'bookings', booking.id)).not.toHaveLength(0)
    expect(await auditOf(AUDIT_ACTIONS.reschedule, 'bookings', moved.value.id)).not.toHaveLength(0)
  })

  it('refuses a time that is taken, and one in the past', async () => {
    const TAKEN_DAY = '2099-05-20'
    await book('confirmed', '10:00', {}, TAKEN_DAY)
    const booking = await book('confirmed', '12:00', {}, TAKEN_DAY)
    expect(
      await office.reschedule(await as(staff.operator), booking.id, {
        startsAt: field('10:00', TAKEN_DAY),
      }),
    ).toEqual({ ok: false, error: { code: 'slot-taken' } })
    expect(
      await office.reschedule(await as(staff.operator), booking.id, {
        startsAt: '2020-01-01T10:00',
      }),
    ).toEqual({ ok: false, error: { code: 'outside-hours' } })
    expect(
      await office.reschedule(await as(staff.operator), booking.id, { startsAt: 'soon' }),
    ).toEqual({ ok: false, error: { code: 'invalid-input', fields: ['startsAt'] } })
    expect((await reread(booking.id)).status).toBe('confirmed')
  })

  it('confirms a time request at the agreed time', async () => {
    const requested = await book('requested', '10:00', {
      startsAt: null,
      endsAt: null,
      practitioner: null,
      timeRequest: { preferredDays: [{ day: '2099-05-06' }], preferredTimes: 'Fake mornings' },
    })
    const confirmed = await office.confirmTime(await as(staff.operator), requested.id, {
      startsAt: field('10:00', '2099-05-06'),
      practitionerId: String(practitioner.id),
    })
    expect(confirmed.ok).toBe(true)
    if (!confirmed.ok) return
    expect(confirmed.value).toMatchObject({
      status: 'confirmed',
      startsAt: at('10:00', '2099-05-06').toISOString(),
    })
    expect(await auditOf(AUDIT_ACTIONS.confirmTime, 'bookings', requested.id)).not.toHaveLength(0)
  })

  it('creates a payment link for a priced, unpaid booking, and none for a free one', async () => {
    const booking = await book('confirmed', '11:00', {}, '2099-05-22')
    const sent = await office.paymentLink(await as(staff.operator), booking.id, { expiresAt: '' })
    expect(sent.ok).toBe(true)
    if (!sent.ok) return
    expect(sent.value.payment).toMatchObject({ amountPaise: 50_000, kind: 'paymentLink' })
    expect(sent.value.shortUrl).toMatch(/^https:\/\/example\.invalid\//)
    expect((await reread(booking.id)).paymentStatus).toBe('linkSent')
    expect(
      await auditOf(AUDIT_ACTIONS.paymentLink, 'payments', sent.value.payment.id),
    ).not.toHaveLength(0)
    expect(await auditOf(AUDIT_ACTIONS.paymentLink, 'bookings', booking.id)).not.toHaveLength(0)

    const free = await book(
      'confirmed',
      '12:30',
      { price: { totalPaise: 0, taxPaise: 0 } },
      '2099-05-22',
    )
    expect(await office.paymentLink(await as(staff.operator), free.id, {})).toEqual({
      ok: false,
      error: { code: 'free-service' },
    })
  })
})
