import { sql } from '@payloadcms/db-postgres'
import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SLOT_BLOCKING_STATUSES } from '@/lib/booking/states'
import type {
  Booking,
  GatewayEvent,
  Person,
  Practitioner,
  Service,
  User,
} from '@/payload-types'
import config from '@/payload.config'

// The database's double-booking guard (docs/04, Rules the schema enforces; docs/16 §4) and the
// gateway events' once-only index (docs/16 §5), against the real Postgres: what the migrations
// built, not what the code hopes. Obviously fake services, profiles and people, at times far in
// the future, removed at the end.
let payload: Payload
const TAG = 'int.bookings'
const REF = 'INT-OVL-'
let service: Service
let person: Person
const practitioners: Practitioner[] = []
let practitionerUser: User
let made = 0

/** A fixed hour, far ahead, in a day no other test uses: minutes after 2099-01-05 10:00 IST. */
const at = (minutes: number) => new Date(Date.UTC(2099, 0, 5, 4, 30) + minutes * 60_000)

async function removeTestData() {
  await payload.delete({ collection: 'bookings', where: { reference: { like: REF } } })
  await payload.delete({ collection: 'gateway-events', where: { eventId: { like: 'evt_int' } } })
  await payload.delete({ collection: 'practitioners', where: { publicName: { like: TAG } } })
  await payload.delete({ collection: 'services', where: { slug: { like: 'int-bookings' } } })
  await payload.delete({ collection: 'people', where: { fullName: { like: TAG } } })
  await payload.delete({ collection: 'users', where: { email: { like: `${TAG}.` } } })
}

/** A booking as the server writes one (access overridden, as the booking flow will). */
function book(
  practitioner: Practitioner | null,
  from: number,
  to: number,
  status: Booking['status'] = 'held',
) {
  return payload.create({
    collection: 'bookings',
    data: {
      reference: `${REF}${Date.now()}-${++made}`,
      type: 'session',
      status,
      service: service.id,
      person: person.id,
      practitioner: practitioner?.id ?? null,
      startsAt: at(from).toISOString(),
      endsAt: at(to).toISOString(),
    } as Booking,
  })
}

/** Postgres's own answer to a raw insert: null when it went in, else the SQLSTATE code. */
async function rawInsert(practitioner: Practitioner, from: number, to: number, status: string) {
  return payload.db.drizzle
    .execute(
      sql`INSERT INTO "bookings"
            ("reference", "type", "status", "service_id", "person_id", "practitioner_id",
             "starts_at", "ends_at")
          VALUES (${`${REF}raw-${++made}`}, 'session', ${status}, ${service.id}, ${person.id},
                  ${practitioner.id}, ${at(from).toISOString()}, ${at(to).toISOString()})`,
    )
    .then(
      () => null,
      (error: { code?: string; cause?: { code?: string } }) => error.cause?.code ?? error.code,
    )
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await removeTestData()
  practitionerUser = await payload.create({
    collection: 'users',
    data: {
      name: 'Fake practitioner',
      email: `${TAG}.practitioner@example.invalid`,
      password: 'test-only-password-bookings',
      roles: ['practitioner'],
    },
  })
  service = await payload.create({
    collection: 'services',
    data: {
      name: `Fake service ${TAG}`,
      type: 'session',
      slug: `int-bookings-${Date.now()}`,
      register: 'counselling',
      format: 'online',
    } as Service,
  })
  for (const name of ['one', 'two']) {
    practitioners.push(
      await payload.create({
        collection: 'practitioners',
        data: {
          publicName: `Fake ${TAG} ${name}`,
          ...(name === 'one' ? { staff: practitionerUser.id } : {}),
        } as Practitioner,
      }),
    )
  }
  person = await payload.create({
    collection: 'people',
    data: { fullName: `Fake Person ${TAG}` } as Person,
  })
})

afterAll(async () => {
  await removeTestData()
})

describe('the double-booking guard (docs/16 §4)', () => {
  it('exists in the database, as the migration made it', async () => {
    const { rows } = (await payload.db.drizzle.execute(
      sql`SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
          WHERE conrelid = '"bookings"'::regclass
            AND conname IN ('bookings_no_overlap', 'bookings_ends_after_start')
          ORDER BY conname`,
    )) as unknown as { rows: { conname: string; definition: string }[] }
    expect(rows.map((row) => row.conname)).toEqual([
      'bookings_ends_after_start',
      'bookings_no_overlap',
    ])
    const exclusion = rows[1]?.definition ?? ''
    expect(exclusion).toMatch(/EXCLUDE USING gist/)
    for (const status of SLOT_BLOCKING_STATUSES) expect(exclusion).toContain(`'${status}'`)
  })

  it('refuses a second active booking that overlaps one practitioner’s time', async () => {
    const [one] = practitioners as [Practitioner, Practitioner]
    await book(one, 0, 30)
    await expect(book(one, 15, 45)).rejects.toThrow()
    for (const status of SLOT_BLOCKING_STATUSES) {
      expect(await rawInsert(one, 10, 20, status), status).toBe('23P01')
    }
  })

  it('lets back-to-back bookings and other practitioners’ times through', async () => {
    const [one, two] = practitioners as [Practitioner, Practitioner]
    await book(one, 60, 90)
    await expect(book(one, 90, 120)).resolves.toBeTruthy()
    await expect(book(two, 60, 90)).resolves.toBeTruthy()
  })

  it('frees the time once a booking is cancelled, rescheduled or its hold expired', async () => {
    const [one] = practitioners as [Practitioner, Practitioner]
    for (const [index, status] of (
      ['expired', 'cancelledByClient', 'cancelledByIiic', 'rescheduled'] as const
    ).entries()) {
      const start = 200 + index * 60
      const first = await book(one, start, start + 30)
      await payload.update({ collection: 'bookings', id: first.id, data: { status } })
      await expect(book(one, start, start + 30), status).resolves.toBeTruthy()
    }
  })

  it('does not hold a time request without a time, or a booking with no practitioner', async () => {
    const [one] = practitioners as [Practitioner, Practitioner]
    for (let i = 0; i < 2; i += 1) {
      await payload.create({
        collection: 'bookings',
        data: {
          reference: `${REF}request-${++made}`,
          type: 'session',
          status: 'requested',
          service: service.id,
          person: person.id,
          practitioner: one.id,
        } as Booking,
      })
      await expect(book(null, 500, 530)).resolves.toBeTruthy()
    }
  })

  it('refuses a booking that ends before it starts', async () => {
    const [one] = practitioners as [Practitioner, Practitioner]
    expect(await rawInsert(one, 700, 690, 'cancelledByClient')).toBe('23514')
  })

  it('lets exactly one of two people take one time at the same moment', async () => {
    const [, two] = practitioners as [Practitioner, Practitioner]
    const results = await Promise.allSettled([
      book(two, 800, 830, 'confirmed'),
      book(two, 800, 830, 'confirmed'),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
  })

  it('refuses a late payment’s confirmation once someone else holds the time', async () => {
    const [, two] = practitioners as [Practitioner, Practitioner]
    const late = await book(two, 900, 930, 'pendingPayment')
    await payload.update({ collection: 'bookings', id: late.id, data: { status: 'expired' } })
    await book(two, 900, 930, 'confirmed')
    await expect(
      payload.update({ collection: 'bookings', id: late.id, data: { status: 'confirmed' } }),
    ).rejects.toThrow()
    const kept = await payload.findByID({ collection: 'bookings', id: late.id })
    expect(kept.status).toBe('expired')
  })
})

describe('who reads bookings (docs/05)', () => {
  it('shows a practitioner their own bookings only', async () => {
    const [one, two] = practitioners as [Practitioner, Practitioner]
    await book(one, 1000, 1030)
    await book(two, 1000, 1030)
    const seen = await payload.find({
      collection: 'bookings',
      where: { reference: { like: REF } },
      user: { ...practitionerUser, collection: 'users', _strategy: 'totp' } as User,
      overrideAccess: false,
      depth: 0,
      limit: 200,
    })
    expect(seen.docs.length).toBeGreaterThan(0)
    expect(new Set(seen.docs.map((doc) => doc.practitioner))).toEqual(new Set([one.id]))
    // The money on a booking is not a practitioner's to read (docs/05).
    expect(seen.docs.every((doc) => doc.price === undefined)).toBe(true)
  })
})

describe('gateway events, each once (docs/16 §5)', () => {
  it('refuses the same event id from the same gateway twice', async () => {
    const event = {
      gateway: 'razorpay',
      eventId: `evt_int${Date.now()}`,
      type: 'payment.captured',
      source: 'webhook',
      receivedAt: new Date().toISOString(),
      outcome: 'processed',
    } as GatewayEvent
    await payload.create({ collection: 'gateway-events', data: event })
    await expect(payload.create({ collection: 'gateway-events', data: event })).rejects.toThrow()
    const refused = await payload.db.drizzle
      .execute(
        sql`INSERT INTO "gateway_events" ("gateway", "event_id", "type", "source", "received_at", "outcome")
            VALUES ('razorpay', ${event.eventId}, 'payment.captured', 'webhook', now(), 'processed')`,
      )
      .then(
        () => null,
        (error: { code?: string; cause?: { code?: string } }) => error.cause?.code ?? error.code,
      )
    expect(refused).toBe('23505')
  })
})
