import { createLocalReq, getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { Practitioner, Service } from '@/payload-types'
import config from '@/payload.config'

import { removeQueuedJobs } from '../helpers/queuedJobs'

vi.mock('server-only', () => ({}))

const { bookSlot } = await import('@/lib/booking/api')
const { inTransaction, keepOk } = await import('@/lib/booking/guard')
const { SLOT_BLOCKING_STATUSES } = await import('@/lib/booking/states')
const { atIst } = await import('@/lib/booking/slots')
const { recordPersonAndConsents } = await import('@/lib/bookingFlow/people')

// Two people book one time at the same moment (M7; docs/16 §4; docs/12 §13): each goes through
// what the booking flow's submission does on the server (src/lib/bookingFlow/actions.ts), the
// person recorded and the time booked in one transaction, and the database's exclusion constraint
// `bookings_no_overlap` lets exactly one through. The other is told the time was taken, and
// nothing of theirs is kept: no booking and no person. Every rule, hour and name is an obviously
// fake test value, on days far ahead that no other test uses; everything, the jobs the winner's
// booking queued included, is removed at the end.

let payload: Payload
const TAG = 'int.concurrency'
let service: Service
let practitioner: Practitioner

/** A Monday far ahead, and the moment the race runs, two hours before its first time. */
const DAY = '2099-04-06'
const NOW = atIst(DAY, '08:00')
const at = (clock: string) => atIst(DAY, clock)
const option = () => service.options?.[0]?.id as string
let keys = 0
const checkoutKey = () => `fake-race-${Date.now()}-${++keys}`

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
  await payload.delete({ collection: 'bookings', where: { 'person.fullName': { like: TAG } } })
  await payload.delete({ collection: 'calendar-connections', where: { calendarId: { like: TAG } } })
  await payload.delete({
    collection: 'availability-rules',
    where: { 'practitioner.publicName': { like: TAG } },
  })
  await payload.delete({ collection: 'practitioners', where: { publicName: { like: TAG } } })
  await payload.delete({ collection: 'services', where: { slug: { like: 'int-race' } } })
  await payload.delete({ collection: 'people', where: { fullName: { like: TAG } } })
}

/** One visitor's submission, as the flow makes it: the person, then the time, all or nothing. */
async function submit(name: string, startsAt: Date) {
  const req = await createLocalReq({}, payload)
  return inTransaction(
    req,
    async () => {
      const { personId } = await recordPersonAndConsents(req, {
        details: {
          type: 'session',
          fullName: `Fake ${name} ${TAG}`,
          mobile: '+919876543210',
          email: `${name.toLowerCase()}.${TAG}@example.invalid`,
          whoFor: 'yourself',
          ageBand: 'adult',
          consents: { bookingCommunications: true },
        } as never,
        given: [],
        texts: [],
        evidence: { form: 'booking:session', ip: null, userAgent: null },
        source: 'booking',
        now: NOW,
      })
      return bookSlot(
        req,
        {
          checkoutKey: checkoutKey(),
          serviceId: service.id,
          serviceOption: option(),
          practitionerId: practitioner.id,
          startsAt: startsAt.toISOString(),
          whoFor: 'yourself',
          ageBand: 'adult',
          source: 'booking',
        },
        { personId, price: async () => null, now: NOW },
      )
    },
    keepOk,
  )
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await removeTestData()
  service = await payload.create({
    collection: 'services',
    data: {
      name: `Fake service ${TAG}`,
      type: 'session',
      slug: `int-race-${Date.now()}`,
      register: 'counselling',
      format: 'online',
      active: true,
      options: [{ label: 'Fake 30', duration: 30 }],
      // Fake rules: no notice, three days ahead, no buffer, a ten-minute hold.
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
    data: { publicName: `Fake ${TAG}`, active: true, services: [service.id] } as Practitioner,
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
        practitioner: practitioner.id,
        weekday,
        spans: [{ start: '10:00', end: '13:00' }],
        validFrom: '2099-01-01',
      },
    })
  }
})

afterAll(async () => {
  await removeTestData()
})

describe('two bookings for one time at the same moment (bookings_no_overlap)', () => {
  it('lets exactly one through, tells the other the time was taken, and keeps nothing of theirs', async () => {
    const results = await Promise.all([submit('Asha', at('11:00')), submit('Ravi', at('11:00'))])
    const won = results.filter((result) => result.ok)
    const lost = results.filter((result) => !result.ok)
    expect(won).toHaveLength(1)
    expect(lost).toEqual([{ ok: false, error: { code: 'slot-taken' } }])

    const { docs: bookings } = await payload.find({
      collection: 'bookings',
      where: {
        and: [
          { practitioner: { equals: practitioner.id } },
          { startsAt: { equals: at('11:00').toISOString() } },
        ],
      },
      depth: 1,
      pagination: false,
    })
    expect(bookings).toHaveLength(1)
    const [booking] = bookings
    expect(SLOT_BLOCKING_STATUSES as readonly string[]).toContain(booking?.status)
    // The loser's person went with its transaction: only the winner's is kept.
    const { docs: people } = await payload.find({
      collection: 'people',
      where: { fullName: { like: TAG } },
      pagination: false,
      depth: 0,
    })
    expect(people).toHaveLength(1)
    const winner = typeof booking?.person === 'object' ? booking.person : null
    expect(people[0]?.id).toBe(winner?.id)
  })

  it('still lets the next free time be booked by the one who lost', async () => {
    const next = await submit('Ravi', at('11:30'))
    expect(next.ok).toBe(true)
  })
})
