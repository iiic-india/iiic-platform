import { addMinutes } from 'date-fns'
import {
  commitTransaction,
  createLocalReq,
  getPayload,
  initTransaction,
  type Payload,
  type PayloadRequest,
} from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { Booking, Person, Practitioner, Service, User } from '@/payload-types'
import config from '@/payload.config'

import { removeQueuedJobs } from '../helpers/queuedJobs'

vi.mock('server-only', () => ({}))

const api = await import('@/lib/booking/api')
const { cancelBooking, rescheduleBooking } = await import('@/lib/booking/changes')
const { bookWithoutPayment, confirmBooking } = await import('@/lib/booking/confirm')
const { expireHolds, placeHold, startPayment } = await import('@/lib/booking/holds')
const { atIst } = await import('@/lib/booking/slots')
const { requestTime } = await import('@/lib/booking/timeRequests')

// The booking module against the real Postgres (docs/16 §4, §6, §11): holds, their expiry, the
// double-booking guard as the booking service meets it, the race where two payments confirm one
// time, reschedules, cancellations, time requests and the server functions' checks. Every rule,
// hour and name is an obviously fake test value; the days are far ahead and no other test uses
// them; everything is removed at the end.

let payload: Payload
const TAG = 'int.engine'
let service: Service
let person: Person
let practitioner: Practitioner
let unconnected: Practitioner
let office: User

/** Days no other test uses: 2099-03-02 is a Monday. */
const DAY = '2099-03-02'
const NOW = atIst(DAY, '08:00')
const at = (clock: string, day = DAY) => atIst(day, clock)
const option = () => service.options?.[0]?.id as string
let keys = 0
const checkoutKey = () => `fake-engine-${Date.now()}-${++keys}`

const fresh = () => createLocalReq({}, payload)

/** Removes this file's data, a run that stopped half-way included, children first. */
async function removeTestData() {
  const [bookings, profiles] = await Promise.all([
    payload.find({
      collection: 'bookings',
      where: { 'person.fullName': { like: TAG } },
      pagination: false,
      depth: 0,
    }),
    payload.find({
      collection: 'practitioners',
      where: { publicName: { like: TAG } },
      pagination: false,
      depth: 0,
    }),
  ])
  await removeQueuedJobs(payload, {
    bookingIds: bookings.docs.map((booking) => booking.id),
    practitionerIds: profiles.docs.map((profile) => profile.id),
  })
  await payload.delete({
    collection: 'bookings',
    where: { 'person.fullName': { like: TAG } },
  })
  await payload.delete({
    collection: 'calendar-connections',
    where: { calendarId: { like: TAG } },
  })
  for (const collection of ['availability-rules', 'availability-exceptions'] as const) {
    await payload.delete({
      collection,
      where: { 'practitioner.publicName': { like: TAG } },
    })
  }
  await payload.delete({ collection: 'practitioners', where: { publicName: { like: TAG } } })
  await payload.delete({ collection: 'services', where: { slug: { like: 'int-engine' } } })
  await payload.delete({ collection: 'people', where: { fullName: { like: TAG } } })
  await payload.delete({ collection: 'users', where: { email: { like: `${TAG}.` } } })
}

async function hoursFor(profile: Practitioner, start: string, end: string) {
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
        spans: [{ start, end }],
        validFrom: '2099-01-01',
      },
    })
  }
}

/** A booking written as it stands, past the module, for setting up a race. */
function raw(status: Booking['status'], from: string, to: string, extra: Partial<Booking> = {}) {
  return payload.create({
    collection: 'bookings',
    data: {
      // Twenty characters at most, as the collection allows.
      reference: `IE-${Date.now().toString(36)}-${++keys}`,
      type: 'session',
      status,
      paymentStatus: 'unpaid',
      service: service.id,
      serviceOption: option(),
      durationMinutes: 30,
      person: person.id,
      practitioner: practitioner.id,
      startsAt: at(from).toISOString(),
      endsAt: at(to).toISOString(),
      ...extra,
    } as Booking,
  })
}

const hold = async (startsAt: Date, now = NOW, key = checkoutKey()) =>
  placeHold(await fresh(), {
    checkoutKey: key,
    serviceId: service.id,
    serviceOption: option(),
    practitionerId: practitioner.id,
    startsAt,
    personId: person.id,
    now,
  })

beforeAll(async () => {
  payload = await getPayload({ config })
  await removeTestData()
  office = await payload.create({
    collection: 'users',
    data: {
      name: 'Fake office',
      email: `${TAG}.office@example.invalid`,
      password: 'test-only-password-engine',
      roles: ['operator'],
    },
  })
  service = await payload.create({
    collection: 'services',
    data: {
      name: `Fake service ${TAG}`,
      type: 'session',
      slug: `int-engine-${Date.now()}`,
      register: 'counselling',
      format: 'online',
      active: true,
      options: [{ label: 'Fake 30', duration: 30 }],
      // Fake rules: no notice, three days ahead, no buffer, a ten-minute hold, and a fake
      // reschedule window of 24 hours.
      bookingRules: {
        noticeHours: 0,
        horizonDays: 3,
        bufferMinutes: 0,
        holdMinutes: 10,
        rescheduleWindowHours: 24,
      },
    } as Service,
  })
  practitioner = await payload.create({
    collection: 'practitioners',
    data: { publicName: `Fake ${TAG} one`, active: true, services: [service.id] } as Practitioner,
  })
  unconnected = await payload.create({
    collection: 'practitioners',
    data: { publicName: `Fake ${TAG} two`, active: true, services: [service.id] } as Practitioner,
  })
  await payload.create({
    collection: 'calendar-connections',
    data: {
      practitioner: practitioner.id,
      provider: 'google',
      calendarId: `${TAG}@example.invalid`,
      status: 'connected',
    },
  })
  await hoursFor(practitioner, '10:00', '13:00')
  await hoursFor(unconnected, '10:00', '13:00')
  person = await payload.create({
    collection: 'people',
    data: { fullName: `Fake Person ${TAG}` } as Person,
  })
})

afterAll(async () => {
  await removeTestData()
})

describe('holds (B1, B4)', () => {
  it('places a hold for the hold minutes, and finds it again by its checkout key', async () => {
    const key = checkoutKey()
    const first = await hold(at('10:00'), NOW, key)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.value.status).toBe('held')
    expect(first.value.reference).toMatch(/^IIIC-S-\d{5}$/)
    expect(first.value.endsAt).toBe(at('10:30').toISOString())
    expect(first.value.holdExpiresAt).toBe(addMinutes(NOW, 10).toISOString())
    const again = await hold(at('10:00'), NOW, key)
    expect(again.ok && again.value.id).toBe(first.value.id)
  })

  it('refuses a held time, and a time the engine does not offer', async () => {
    expect(await hold(at('10:00'))).toEqual({ ok: false, error: { code: 'slot-taken' } })
    expect(await hold(at('10:15'))).toEqual({ ok: false, error: { code: 'outside-hours' } })
    expect(await hold(at('14:00'))).toEqual({ ok: false, error: { code: 'outside-hours' } })
  })

  it('lets exactly one of two people hold one time at the same moment', async () => {
    const results = await Promise.all([hold(at('11:00')), hold(at('11:00'))])
    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(results.find((result) => !result.ok)).toEqual({
      ok: false,
      error: { code: 'slot-taken' },
    })
  })

  it('expires a lapsed hold before placing a new one on its time', async () => {
    const first = await hold(at('12:00'))
    expect(first.ok).toBe(true)
    const later = addMinutes(NOW, 11)
    const second = await hold(at('12:00'), later)
    expect(second.ok).toBe(true)
    if (!first.ok) return
    const lapsed = await payload.findByID({ collection: 'bookings', id: first.value.id })
    expect(lapsed.status).toBe('expired')
  })

  it('sweeps every hold past its time (B4), once', async () => {
    const day = '2099-03-03'
    const placed = await hold(at('10:00', day))
    expect(placed.ok).toBe(true)
    const swept = await expireHolds(await fresh(), addMinutes(NOW, 30))
    expect(swept).toBeGreaterThanOrEqual(1)
    expect(await expireHolds(await fresh(), addMinutes(NOW, 30))).toBe(0)
    if (!placed.ok) return
    const expired = await payload.findByID({ collection: 'bookings', id: placed.value.id })
    expect(expired.status).toBe('expired')
  })

  it('moves a live hold to waiting for payment, and not a lapsed one', async () => {
    const day = '2099-03-04'
    const placed = await hold(at('10:30', day))
    if (!placed.ok) throw new Error('hold refused')
    const req = await fresh()
    const started = await startPayment(req, { bookingId: placed.value.id, now: NOW })
    expect(started.ok && started.value.status).toBe('pendingPayment')
    const other = await hold(at('11:30', day))
    if (!other.ok) throw new Error('hold refused')
    expect(
      await startPayment(await fresh(), {
        bookingId: other.value.id,
        now: addMinutes(NOW, 20),
      }),
    ).toEqual({ ok: false, error: { code: 'hold-expired' } })
  })
})

describe('confirmation and the race for one time (docs/16 §5)', () => {
  it('confirms a hold waiting for payment only on a captured payment', async () => {
    const day = '2099-03-05'
    const placed = await hold(at('10:00', day))
    if (!placed.ok) throw new Error('hold refused')
    const id = placed.value.id
    expect(await confirmBooking(await fresh(), { bookingId: id, cause: 'staff' })).toMatchObject({
      ok: false,
      error: { code: 'bad-move' },
    })
    await startPayment(await fresh(), { bookingId: id, now: NOW })
    const confirmed = await confirmBooking(await fresh(), {
      bookingId: id,
      cause: 'paymentCaptured',
      now: NOW,
    })
    expect(confirmed.ok && confirmed.value.status).toBe('confirmed')
    expect(confirmed.ok && confirmed.value.holdExpiresAt).toBeFalsy()
    // A replay changes nothing.
    const replay = await confirmBooking(await fresh(), {
      bookingId: id,
      cause: 'paymentCaptured',
    })
    expect(replay.ok && replay.value.status).toBe('confirmed')
  })

  it('lets exactly one of two late payments confirm one time; the other gets slot-taken', async () => {
    // Two holds on one time that both lapsed; both clients' payments arrive at once.
    const time = {
      startsAt: at('10:00', '2099-03-06').toISOString(),
      endsAt: at('10:30', '2099-03-06').toISOString(),
    }
    const a = await raw('expired', '10:00', '10:30', time)
    const b = await raw('expired', '10:00', '10:30', time)
    const reqs = [await fresh(), await fresh()]
    const results = await Promise.all(
      [a, b].map((booking, index) =>
        confirmBooking(reqs[index] as PayloadRequest, {
          bookingId: booking.id,
          cause: 'paymentCaptured',
        }),
      ),
    )
    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(results.find((result) => !result.ok)).toEqual({
      ok: false,
      error: { code: 'slot-taken' },
    })
    const states = await Promise.all(
      [a, b].map((booking) => payload.findByID({ collection: 'bookings', id: booking.id })),
    )
    expect(states.map((booking) => booking.status).sort()).toEqual(['confirmed', 'expired'])
  })

  it('leaves the caller’s transaction usable after slot-taken, for the refund (B10)', async () => {
    const day = '2099-03-07'
    const late = await raw('expired', '10:00', '10:30', {
      startsAt: at('10:00', day).toISOString(),
      endsAt: at('10:30', day).toISOString(),
    })
    await raw('confirmed', '10:00', '10:30', {
      startsAt: at('10:00', day).toISOString(),
      endsAt: at('10:30', day).toISOString(),
    })
    const req = await fresh()
    await initTransaction(req)
    const before = await payload.create({
      collection: 'people',
      data: { fullName: `Fake Person ${TAG} before` } as Person,
      req,
    })
    const refused = await confirmBooking(req, { bookingId: late.id, cause: 'paymentCaptured' })
    expect(refused).toEqual({ ok: false, error: { code: 'slot-taken' } })
    const after = await payload.create({
      collection: 'people',
      data: { fullName: `Fake Person ${TAG} after` } as Person,
      req,
    })
    await commitTransaction(req)
    const kept = await payload.find({
      collection: 'people',
      where: { id: { in: [before.id, after.id] } },
    })
    expect(kept.totalDocs).toBe(2)
    const unchanged = await payload.findByID({ collection: 'bookings', id: late.id })
    expect(unchanged.status).toBe('expired')
  })

  it('confirms a late payment while the time is still free', async () => {
    const day = '2099-03-08'
    const late = await raw('expired', '10:00', '10:30', {
      startsAt: at('10:00', day).toISOString(),
      endsAt: at('10:30', day).toISOString(),
    })
    const confirmed = await confirmBooking(await fresh(), {
      bookingId: late.id,
      cause: 'paymentCaptured',
    })
    expect(confirmed.ok && confirmed.value.status).toBe('confirmed')
  })

  it('books at once without payment, unpaid when priced and free otherwise (D-24)', async () => {
    const day = '2099-03-09'
    const base = {
      serviceId: service.id,
      serviceOption: option(),
      practitionerId: practitioner.id,
      personId: person.id,
      now: atIst('2099-03-08', '09:00'),
    }
    const priced = await bookWithoutPayment(await fresh(), {
      ...base,
      checkoutKey: checkoutKey(),
      startsAt: at('10:00', day),
      price: { totalPaise: 11_800, taxPaise: 1_800, gstRateBasisPoints: 1800, sacCode: null },
    })
    expect(priced.ok && [priced.value.status, priced.value.paymentStatus]).toEqual([
      'confirmed',
      'unpaid',
    ])
    expect(priced.ok && priced.value.price?.totalPaise).toBe(11_800)
    const free = await bookWithoutPayment(await fresh(), {
      ...base,
      checkoutKey: checkoutKey(),
      startsAt: at('11:00', day),
    })
    expect(free.ok && free.value.paymentStatus).toBe('notRequired')
  })
})

describe('time requests (D-02)', () => {
  it('records the preferred days and blocks nothing until the office agrees a time', async () => {
    const asked = await requestTime(await fresh(), {
      serviceId: service.id,
      serviceOption: option(),
      personId: person.id,
      preferredDays: ['2099-03-11', '2099-03-10', '2099-03-11'],
      preferredTimes: 'Fake: mornings',
      note: 'Fake note',
    })
    if (!asked.ok) throw new Error('request refused')
    expect(asked.value.status).toBe('requested')
    expect(asked.value.startsAt).toBeFalsy()
    expect(asked.value.timeRequest?.preferredDays?.map((entry) => entry.day)).toEqual([
      '2099-03-10',
      '2099-03-11',
    ])
    // A time someone holds is refused; a free one confirms, with the practitioner named.
    await raw('confirmed', '10:00', '10:30', {
      startsAt: at('10:00', '2099-03-10').toISOString(),
      endsAt: at('10:30', '2099-03-10').toISOString(),
    })
    const taken = await confirmBooking(await fresh(), {
      bookingId: asked.value.id,
      cause: 'timeAgreed',
      startsAt: at('10:00', '2099-03-10'),
      practitionerId: practitioner.id,
    })
    expect(taken).toEqual({ ok: false, error: { code: 'slot-taken' } })
    const agreed = await confirmBooking(await fresh(), {
      bookingId: asked.value.id,
      cause: 'timeAgreed',
      startsAt: at('16:00', '2099-03-10'),
      practitionerId: practitioner.id,
    })
    expect(agreed.ok && agreed.value.status).toBe('confirmed')
    expect(agreed.ok && agreed.value.endsAt).toBe(at('16:30', '2099-03-10').toISOString())
  })
})

describe('reschedules and cancellations (F4, D-16)', () => {
  const day = '2099-03-12'
  const now = atIst('2099-03-10', '09:00')

  async function confirmedAt(clock: string) {
    const made = await bookWithoutPayment(await fresh(), {
      checkoutKey: checkoutKey(),
      serviceId: service.id,
      serviceOption: option(),
      practitionerId: practitioner.id,
      personId: person.id,
      startsAt: at(clock, day),
      now,
    })
    if (!made.ok) throw new Error(`booking refused: ${made.error.code}`)
    return made.value
  }

  it('moves a booking to a free time: a new booking linked back, the old one rescheduled', async () => {
    const booking = await confirmedAt('10:00')
    const moved = await rescheduleBooking(await fresh(), {
      bookingId: booking.id,
      startsAt: at('10:30', day),
      by: 'client',
      now,
    })
    if (!moved.ok) throw new Error(`refused: ${moved.error.code}`)
    expect(moved.value.rescheduledFrom).toBe(booking.id)
    expect(moved.value.reference).not.toBe(booking.reference)
    const old = await payload.findByID({ collection: 'bookings', id: booking.id })
    expect(old.status).toBe('rescheduled')
  })

  it('changes nothing when the new time is taken', async () => {
    const booking = await confirmedAt('11:00')
    await confirmedAt('12:00')
    const moved = await rescheduleBooking(await fresh(), {
      bookingId: booking.id,
      startsAt: at('12:00', day),
      by: 'staff',
      now,
    })
    expect(moved).toEqual({ ok: false, error: { code: 'slot-taken' } })
    const kept = await payload.findByID({ collection: 'bookings', id: booking.id })
    expect(kept.status).toBe('confirmed')
  })

  it('sends a client inside the window to IIIC', async () => {
    const booking = await confirmedAt('12:30')
    const moved = await rescheduleBooking(await fresh(), {
      bookingId: booking.id,
      startsAt: at('10:00', '2099-03-13'),
      by: 'client',
      now: atIst(day, '09:00'),
    })
    expect(moved).toEqual({ ok: false, error: { code: 'not-allowed', reason: 'outside-window' } })
  })

  it('cancels an unpaid booking for the client, refunding nothing, and frees the time', async () => {
    const booking = await confirmedAt('11:30')
    const cancelled = await cancelBooking(await fresh(), {
      bookingId: booking.id,
      by: 'client',
      reason: 'Fake reason',
      now,
    })
    expect(cancelled.ok && cancelled.value.refundPaise).toBe(0)
    expect(cancelled.ok && cancelled.value.booking.status).toBe('cancelledByClient')
    await expect(confirmedAt('11:30')).resolves.toBeTruthy()
  })
})

describe('the server functions check who is asking (CLAUDE.md #6)', () => {
  const free = async () => null

  it('lists free times, none for a practitioner with no connected calendar', async () => {
    const now = atIst('2099-03-15', '08:00')
    const listed = await api.listSlots(
      await fresh(),
      { serviceId: service.id, serviceOption: option(), practitionerId: practitioner.id },
      now,
    )
    if (!listed.ok) throw new Error(listed.error.code)
    expect(listed.value.days[0]?.day).toBe('2099-03-15')
    expect(listed.value.days[0]?.starts[0]).toBe(at('10:00', '2099-03-15').toISOString())
    const none = await api.listSlots(
      await fresh(),
      { serviceId: service.id, serviceOption: option(), practitionerId: unconnected.id },
      now,
    )
    expect(none).toEqual({ ok: true, value: { days: [] } })
    expect(await api.listSlots(await fresh(), { serviceId: 'x' }, now)).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
  })

  it('books for a visitor, then lets the token open, move and cancel it, and nothing else', async () => {
    const now = atIst('2099-03-15', '08:00')
    const booked = await api.bookSlot(
      await fresh(),
      {
        checkoutKey: checkoutKey(),
        serviceId: service.id,
        serviceOption: option(),
        practitionerId: practitioner.id,
        startsAt: at('12:00', '2099-03-17').toISOString(),
      },
      { personId: person.id, price: free, now },
    )
    if (!booked.ok) throw new Error(booked.error.code)
    expect(booked.value.next).toBe('confirmed')
    const token = booked.value.manageToken as string
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(JSON.stringify(booked.value)).not.toMatch(/price|Paise|person/)

    const seen = await api.viewBooking(await fresh(), { token }, now)
    expect(seen.ok && seen.value.booking.reference).toBe(booked.value.booking.reference)
    expect(seen.ok && seen.value.canReschedule).toBe(true)

    // A visitor without the token cannot move or cancel it by its id.
    expect(
      await api.reschedule(
        await fresh(),
        { bookingId: booked.value.booking.id, startsAt: at('12:30', '2099-03-17').toISOString() },
        now,
      ),
    ).toEqual({ ok: false, error: { code: 'forbidden' } })
    expect(
      await api.cancel(await fresh(), { bookingId: booked.value.booking.id, by: 'iiic' }, now),
    ).toEqual({ ok: false, error: { code: 'forbidden' } })

    const moved = await api.reschedule(
      await fresh(),
      { token, startsAt: at('12:30', '2099-03-17').toISOString() },
      now,
    )
    if (!moved.ok) throw new Error(moved.error.code)
    expect(moved.value.manageToken).not.toBe(token)
    // The old link now opens a rescheduled booking the client can no longer change.
    const old = await api.viewBooking(await fresh(), { token }, now)
    expect(old.ok && old.value.canReschedule).toBe(false)

    const cancelled = await api.cancel(
      await fresh(),
      { token: moved.value.manageToken as string },
      now,
    )
    expect(cancelled.ok && cancelled.value.booking.status).toBe('cancelledByClient')
  })

  it('refuses a booking whose total in force is not the one the visitor was shown', async () => {
    const now = atIst('2099-03-15', '08:00')
    const saved = await payload.findGlobal({ slug: 'settings', select: { flags: true }, depth: 0 })
    await payload.updateGlobal({
      slug: 'settings',
      data: { flags: { ...saved.flags, pricesPublic: true, payAtBooking: false } },
    })
    try {
      // A fake price saved after the visitor's page loaded: ₹1,800 in force, ₹1,500 shown.
      const raised = async () => ({
        totalPaise: 180_000,
        taxPaise: 27_458,
        taxablePaise: 152_542,
        rate: 1800,
        sacCode: '000000',
        priceHistoryId: 1,
      })
      const input = {
        checkoutKey: checkoutKey(),
        serviceId: service.id,
        serviceOption: option(),
        practitionerId: practitioner.id,
        startsAt: at('11:00', '2099-03-17').toISOString(),
      }
      const refused = await api.bookSlot(await fresh(), input, {
        personId: person.id,
        price: raised,
        shownTotalPaise: 150_000,
        now,
      })
      expect(refused).toEqual({ ok: false, error: { code: 'price-changed' } })
      const { totalDocs } = await payload.count({
        collection: 'bookings',
        where: { checkoutKey: { equals: input.checkoutKey } },
      })
      expect(totalDocs).toBe(0)
      const booked = await api.bookSlot(await fresh(), input, {
        personId: person.id,
        price: raised,
        shownTotalPaise: 180_000,
        now,
      })
      expect(booked.ok).toBe(true)
    } finally {
      await payload.updateGlobal({ slug: 'settings', data: { flags: saved.flags } })
    }
  })

  it('lets only the office confirm a time request', async () => {
    const asked = await api.askForTime(
      await fresh(),
      {
        serviceId: service.id,
        serviceOption: option(),
        preferredDays: ['2099-03-18'],
      },
      { personId: person.id, price: free, now: atIst('2099-03-15', '08:00') },
    )
    if (!asked.ok) throw new Error(asked.error.code)
    const input = {
      bookingId: asked.value.booking.id,
      startsAt: at('10:00', '2099-03-18').toISOString(),
      practitionerId: practitioner.id,
    }
    expect(await api.confirmTimeRequest(await fresh(), input, NOW)).toEqual({
      ok: false,
      error: { code: 'forbidden' },
    })
    const asOffice = (await createLocalReq(
      { user: { ...office, collection: 'users', _strategy: 'totp' } as User },
      payload,
    )) as unknown as PayloadRequest
    const confirmed = await api.confirmTimeRequest(asOffice, input, NOW)
    expect(confirmed.ok && confirmed.value.booking.status).toBe('confirmed')
  })
})
