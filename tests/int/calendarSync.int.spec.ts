import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CalendarDeps } from '@/lib/calendar/config'
import { FakeCalendar } from '@/lib/calendar/fakeCalendar'
import type {
  Booking,
  CalendarConnection,
  Person,
  Practitioner,
  Service,
  User,
} from '@/payload-types'
import config from '@/payload.config'

import { removeQueuedJobs } from '../helpers/queuedJobs'

// The calendar slice against the real database (D-22, B2, B7, B14; docs/16 §7, §11), with the
// in-memory FakeCalendar in Google's place: a booking's entry written once, moved on a
// reschedule, moved across practitioners, removed on cancellation; busy times merged, clipped
// and replaced; a watch channel's token believed only when it matches; a practitioner's private
// feed holding their own bookings only, and nothing once revoked or once their account is off.
// Obviously fake people, profiles and calendars at times far ahead, removed at the end.
vi.mock('server-only', () => ({}))

const { syncBookingEventWith, refreshBusyBlocksWith, renewWatchWith } =
  await import('@/lib/calendar/sync')
const { handleChangeNotificationWith } = await import('@/lib/calendar/notifications')
const { issueFeedLink, practitionerFeed, revokeFeedLink } = await import('@/lib/calendar/feed')
const { bookingInvite } = await import('@/lib/calendar/bookingInvite')

let payload: Payload
let req: PayloadRequest
const TAG = 'int.calendar'
const REF = 'INT-CAL-'
const SITE = 'https://fake.example.invalid'
const CAL_A = 'int.calendar.a@fake.example.invalid'
const CAL_B = 'int.calendar.b@fake.example.invalid'
let service: Service
let person: Person
let staffA: User
let practitionerA: Practitioner
let practitionerB: Practitioner
let connectionA: CalendarConnection
let connectionB: CalendarConnection
let fake: FakeCalendar
let deps: CalendarDeps
let made = 0

/** Minutes after 10 AM India time on 2 March 2099, a day no other test uses. */
const at = (minutes: number) => new Date(Date.UTC(2099, 2, 2, 4, 30) + minutes * 60_000)
/**
 * The server's own writes, as the calendar's jobs make them: past the access rules, and marked
 * so the collections' hooks queue no job (the queue is not what this file tests).
 */
const server = { overrideAccess: true, context: { calendarSync: true } } as const

async function removeTestData() {
  const { docs: bookings } = await payload.find({
    collection: 'bookings',
    where: { reference: { like: REF } },
    pagination: false,
    depth: 0,
  })
  await payload.delete({ collection: 'bookings', where: { reference: { like: REF } }, ...server })
  const { docs: profiles } = await payload.find({
    collection: 'practitioners',
    where: { publicName: { like: TAG } },
    pagination: false,
  })
  await removeQueuedJobs(payload, {
    bookingIds: bookings.map((booking) => booking.id),
    practitionerIds: profiles.map((profile) => profile.id),
  })
  for (const profile of profiles) {
    await payload.delete({
      collection: 'busy-blocks',
      where: { practitioner: { equals: profile.id } },
      ...server,
    })
    await payload.delete({
      collection: 'calendar-connections',
      where: { practitioner: { equals: profile.id } },
      ...server,
    })
  }
  await payload.delete({ collection: 'practitioners', where: { publicName: { like: TAG } } })
  await payload.delete({ collection: 'services', where: { slug: { like: 'int-calendar' } } })
  await payload.delete({ collection: 'people', where: { fullName: { like: TAG } } })
  await payload.delete({ collection: 'users', where: { email: { like: `${TAG}.` } } })
}

function book(
  practitioner: Practitioner | null,
  from: number,
  to: number,
  extra: Partial<Booking> = {},
): Promise<Booking> {
  return payload.create({
    collection: 'bookings',
    data: {
      reference: `${REF}${++made}-${Date.now() % 100000}`,
      type: 'session',
      status: 'confirmed',
      service: service.id,
      person: person.id,
      practitioner: practitioner?.id ?? null,
      format: 'online',
      startsAt: at(from).toISOString(),
      endsAt: at(to).toISOString(),
      ...extra,
    } as Booking,
    ...server,
  })
}

const reload = (id: number) => payload.findByID({ collection: 'bookings', id, depth: 0 })
const reschedule = (id: number) =>
  payload.update({ collection: 'bookings', id, data: { status: 'rescheduled' }, ...server })
const connection = (id: number) =>
  payload.findByID({ collection: 'calendar-connections', id, showHiddenFields: true })
const eventsOn = (calendarId: string) => fake.events.get(calendarId) ?? []
const sync = (bookingId: number) => syncBookingEventWith(deps, req, { bookingId })

beforeAll(async () => {
  payload = await getPayload({ config })
  await removeTestData()
  // An owner first: on an empty table the first account becomes the owner, and the last active
  // owner cannot be switched off, which the feed's last test does to practitioner A.
  await payload.create({
    collection: 'users',
    data: {
      name: 'Fake owner',
      email: `${TAG}.owner@example.invalid`,
      password: 'test-only-password-calendar',
      roles: ['owner'],
    },
  })
  staffA = await payload.create({
    collection: 'users',
    data: {
      name: 'Fake practitioner A',
      email: `${TAG}.a@example.invalid`,
      password: 'test-only-password-calendar',
      roles: ['practitioner'],
    },
  })
  service = await payload.create({
    collection: 'services',
    data: {
      name: `Fake service ${TAG}`,
      type: 'session',
      slug: `int-calendar-${Date.now()}`,
      register: 'counselling',
      format: 'both',
      active: true,
      // A fake horizon, so the busy-time window reaches the test's times whatever else is set.
      bookingRules: { horizonDays: 30 },
    } as Service,
  })
  practitionerA = await payload.create({
    collection: 'practitioners',
    data: { publicName: `Fake ${TAG} A`, staff: staffA.id } as Practitioner,
  })
  practitionerB = await payload.create({
    collection: 'practitioners',
    data: { publicName: `Fake ${TAG} B` } as Practitioner,
  })
  person = await payload.create({
    collection: 'people',
    data: { fullName: `Fakeasha Fakesurname ${TAG}` } as Person,
  })
  connectionA = await payload.create({
    collection: 'calendar-connections',
    data: {
      practitioner: practitionerA.id,
      provider: 'google',
      calendarId: CAL_A,
      status: 'connected',
    },
    ...server,
  })
  connectionB = await payload.create({
    collection: 'calendar-connections',
    data: {
      practitioner: practitionerB.id,
      provider: 'google',
      calendarId: CAL_B,
      status: 'connected',
    },
    ...server,
  })
})

beforeEach(async () => {
  fake = new FakeCalendar()
  deps = { provider: { ok: true, value: fake }, siteUrl: SITE, webhookAddress: null }
  req = await createLocalReq({}, payload)
})

afterAll(async () => {
  await removeTestData()
})

describe('a booking’s entry in its practitioner’s calendar (B2, B7)', () => {
  it('writes a confirmed online session once, with its Meet link on the booking', async () => {
    const booking = await book(practitionerA, 0, 45)
    const first = await sync(booking.id)
    const second = await sync(booking.id)
    expect(first.ok && second.ok).toBe(true)
    const events = eventsOn(CAL_A)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      reference: booking.reference,
      title: `Fake service ${TAG} · Fakeasha · ${booking.reference}`,
      meet: true,
      location: null,
      start: at(0),
      end: at(45),
    })
    expect(JSON.stringify(events)).not.toContain('Fakesurname')
    const saved = await reload(booking.id)
    expect(saved.calendarEventId).toBe(events[0]?.eventId)
    expect(saved.meetingUrl).toBe(events[0]?.meetUrl)
  })

  it('moves the entry to the new time on a reschedule, under the new reference', async () => {
    const original = await book(practitionerA, 60, 105)
    await sync(original.id)
    const eventId = (await reload(original.id)).calendarEventId
    await reschedule(original.id)
    const moved = await book(practitionerA, 240, 285, { rescheduledFrom: original.id })
    expect((await sync(moved.id)).ok).toBe(true)
    const events = eventsOn(CAL_A)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ eventId, reference: moved.reference, start: at(240) })
    expect((await reload(moved.id)).calendarEventId).toBe(eventId)
    // The replaced booking is left alone: the new one owns the entry now.
    expect(await sync(original.id)).toEqual({ ok: true, value: null })
    expect(eventsOn(CAL_A)).toHaveLength(1)
  })

  it('moves the entry across when the new time is with another practitioner', async () => {
    const original = await book(practitionerA, 300, 345)
    await sync(original.id)
    await reschedule(original.id)
    const moved = await book(practitionerB, 300, 345, { rescheduledFrom: original.id })
    expect((await sync(moved.id)).ok).toBe(true)
    expect(eventsOn(CAL_A)).toHaveLength(0)
    expect(eventsOn(CAL_B)).toHaveLength(1)
    expect(eventsOn(CAL_B)[0]?.reference).toBe(moved.reference)
  })

  it('removes the entry when the booking is cancelled', async () => {
    const booking = await book(practitionerA, 400, 445)
    await sync(booking.id)
    expect(eventsOn(CAL_A)).toHaveLength(1)
    await payload.update({
      collection: 'bookings',
      id: booking.id,
      data: { status: 'cancelledByClient' },
      ...server,
    })
    expect((await sync(booking.id)).ok).toBe(true)
    expect(eventsOn(CAL_A)).toHaveLength(0)
    expect((await reload(booking.id)).calendarEventId ?? null).toBeNull()
    // Again: nothing left to remove, and that is no failure.
    expect((await sync(booking.id)).ok).toBe(true)
  })

  it('writes nothing for a time request, a booking without a practitioner, or a hold', async () => {
    const request = await book(practitionerA, 0, 0, {
      status: 'requested',
      startsAt: null,
      endsAt: null,
    })
    const info = await book(null, 500, 560, { type: 'info' })
    const hold = await book(practitionerA, 600, 645, { status: 'held' })
    for (const booking of [request, info, hold]) {
      expect(await sync(booking.id)).toEqual({ ok: true, value: null })
    }
    expect(fake.events.size).toBe(0)
  })

  it('answers not-configured without a calendar, and the booking stands', async () => {
    const booking = await book(practitionerA, 700, 745)
    const off: CalendarDeps = {
      ...deps,
      provider: { ok: false, error: { code: 'not-configured', reason: 'missing' } },
    }
    expect(await syncBookingEventWith(off, req, { bookingId: booking.id })).toEqual({
      ok: false,
      error: { code: 'not-configured' },
    })
    expect((await reload(booking.id)).status).toBe('confirmed')
  })

  it('marks a calendar out of reach as failing, and connected again once it answers', async () => {
    const booking = await book(practitionerA, 800, 845)
    fake.forbidden.add(CAL_A)
    expect(await sync(booking.id)).toEqual({ ok: false, error: { code: 'forbidden' } })
    expect(await connection(connectionA.id)).toMatchObject({
      status: 'failing',
      lastError: 'forbidden',
    })
    fake.forbidden.delete(CAL_A)
    expect((await sync(booking.id)).ok).toBe(true)
    const healthy = await connection(connectionA.id)
    expect(healthy.status).toBe('connected')
    expect(healthy.lastError ?? null).toBeNull()
  })
})

describe('the client’s invite (B2, B7)', () => {
  it('keeps the first booking’s UID across a reschedule and raises SEQUENCE', async () => {
    const original = await book(practitionerA, 900, 945)
    await reschedule(original.id)
    const moved = await book(practitionerA, 960, 1005, { rescheduledFrom: original.id })
    const invite = await bookingInvite(req, { bookingId: moved.id, siteUrl: SITE })
    if (!invite.ok) throw new Error(`invite refused: ${invite.error.code}`)
    const text = invite.value.replace(/\r\n[ \t]/g, '')
    expect(text).toContain(`UID:${original.reference}@fake.example.invalid`)
    expect(text).toContain('SEQUENCE:1')
    expect(text).toContain('METHOD:REQUEST')
    expect(text).toContain(`Booking reference: ${moved.reference}`)
    expect(text).not.toContain('Fakesurname')
  })
})

describe('busy times (B14)', () => {
  const blocksOf = async (practitionerId: number) =>
    (
      await payload.find({
        collection: 'busy-blocks',
        where: { practitioner: { equals: practitionerId } },
        sort: 'startsAt',
        pagination: false,
      })
    ).docs.map((doc) => [new Date(doc.startsAt).getTime(), new Date(doc.endsAt).getTime()])

  it('reads the calendar’s busy times, merged and clipped to the window, and replaces them', async () => {
    const now = new Date()
    const hours = (count: number) => new Date(now.getTime() + count * 3_600_000)
    fake.busy.set(CAL_A, [
      // Started an hour ago: kept from now on.
      { start: hours(-1), end: hours(1) },
      { start: hours(48), end: hours(49) },
      { start: hours(48.5), end: hours(50) },
      // Far past the fake service's horizon: never read.
      { start: hours(24 * 400), end: hours(24 * 400 + 1) },
    ])
    expect(
      await refreshBusyBlocksWith(deps, req, { practitionerId: practitionerA.id, now }),
    ).toEqual({ ok: true, value: { blocks: 2 } })
    expect(await blocksOf(practitionerA.id)).toEqual([
      [now.getTime(), hours(1).getTime()],
      [hours(48).getTime(), hours(50).getTime()],
    ])

    fake.busy.set(CAL_A, [{ start: hours(96), end: hours(97) }])
    expect(
      await refreshBusyBlocksWith(deps, req, { practitionerId: practitionerA.id, now }),
    ).toEqual({ ok: true, value: { blocks: 1 } })
    expect(await blocksOf(practitionerA.id)).toEqual([[hours(96).getTime(), hours(97).getTime()]])
    expect((await connection(connectionA.id)).lastSyncedAt).toBe(now.toISOString())
  })

  it('keeps each practitioner’s busy times apart', async () => {
    const now = new Date()
    fake.busy.set(CAL_B, [
      { start: new Date(now.getTime() + 3_600_000), end: new Date(now.getTime() + 7_200_000) },
    ])
    await refreshBusyBlocksWith(deps, req, { practitionerId: practitionerB.id, now })
    expect(await blocksOf(practitionerB.id)).toHaveLength(1)
    expect(await blocksOf(practitionerA.id)).toHaveLength(1)
  })
})

describe('change notifications (B14)', () => {
  it('opens a channel, keeps only its token’s hash, and believes only that token', async () => {
    const watching: CalendarDeps = {
      ...deps,
      webhookAddress: `${SITE}/api/webhooks/google-calendar`,
    }
    const now = new Date()
    expect(await renewWatchWith(watching, req, await connection(connectionA.id), now)).toEqual({
      ok: true,
      value: 'renewed',
    })
    const [channel] = [...fake.watches.values()]
    if (!channel) throw new Error('no channel opened')
    const stored = await connection(connectionA.id)
    expect(stored.watch?.channelId).toBe(channel.channelId)
    expect(stored.channelTokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(stored.channelTokenHash).not.toContain(channel.token)

    const notice = {
      channelId: channel.channelId,
      token: channel.token,
      resourceId: channel.resourceId,
      state: 'exists' as const,
    }
    expect(await handleChangeNotificationWith(watching, req, notice, now)).toEqual({
      ok: true,
      value: 'refreshed',
    })
    expect(
      await handleChangeNotificationWith(watching, req, { ...notice, token: 'fake-wrong' }, now),
    ).toEqual({ ok: false, error: { code: 'bad-token' } })
    expect(
      await handleChangeNotificationWith(
        watching,
        req,
        { ...notice, channelId: 'fake-unknown-channel' },
        now,
      ),
    ).toEqual({ ok: false, error: { code: 'unknown-channel' } })
    // A channel with days left is left alone.
    expect(await renewWatchWith(watching, req, await connection(connectionA.id), now)).toEqual({
      ok: true,
      value: 'current',
    })
  })
})

describe('a practitioner’s private feed (D-22)', () => {
  const tokenOf = (url: string) => url.split('/').at(-1) ?? ''
  const read = (url: string) =>
    practitionerFeed(req, { token: tokenOf(url), siteUrl: SITE, now: new Date() })

  it('holds the practitioner’s own bookings only, with first names only', async () => {
    const own = await book(practitionerA, 1100, 1145)
    const other = await book(practitionerB, 1100, 1145)
    const issued = await issueFeedLink(req, { connectionId: connectionA.id, siteUrl: SITE })
    if (!issued.ok) throw new Error('no feed link')
    expect(issued.value.url.startsWith(`${SITE}/api/calendar/feed/`)).toBe(true)
    const feed = await read(issued.value.url)
    if (!feed.ok) throw new Error(`feed refused: ${feed.error.code}`)
    const text = feed.value.replace(/\r\n[ \t]/g, '')
    expect(text).toContain(own.reference)
    expect(text).not.toContain(other.reference)
    expect(text).toContain('Fakeasha')
    expect(text).not.toContain('Fakesurname')
    expect(text).toContain('CLASS:PRIVATE')
  })

  it('keeps no working token in the database', async () => {
    const issued = await issueFeedLink(req, { connectionId: connectionB.id, siteUrl: SITE })
    if (!issued.ok) throw new Error('no feed link')
    const stored = await connection(connectionB.id)
    expect(stored.feedTokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(stored.feedTokenHash).not.toContain(tokenOf(issued.value.url))
  })

  it('stops answering once revoked, or once a new address replaces it', async () => {
    const first = await issueFeedLink(req, { connectionId: connectionA.id, siteUrl: SITE })
    const second = await issueFeedLink(req, { connectionId: connectionA.id, siteUrl: SITE })
    if (!first.ok || !second.ok) throw new Error('no feed link')
    expect(await read(first.value.url)).toEqual({ ok: false, error: { code: 'not-found' } })
    expect((await read(second.value.url)).ok).toBe(true)
    expect((await revokeFeedLink(req, { connectionId: connectionA.id })).ok).toBe(true)
    expect(await read(second.value.url)).toEqual({ ok: false, error: { code: 'not-found' } })
  })

  it('stops answering when the practitioner’s staff account is switched off', async () => {
    const issued = await issueFeedLink(req, { connectionId: connectionA.id, siteUrl: SITE })
    if (!issued.ok) throw new Error('no feed link')
    expect((await read(issued.value.url)).ok).toBe(true)
    await payload.update({
      collection: 'users',
      id: staffA.id,
      data: { active: false },
      overrideAccess: true,
    })
    expect(await read(issued.value.url)).toEqual({ ok: false, error: { code: 'not-found' } })
  })
})
