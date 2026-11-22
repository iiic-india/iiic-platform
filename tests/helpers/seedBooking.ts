import { getPayload, type Payload } from 'payload'

import { assertLocalDatabase } from './localDatabase'
import config from '../../src/payload.config'

/**
 * Obviously fake things to book, for the booking flow's end-to-end tests (tests/e2e/
 * booking.e2e.spec.ts; docs/16 §11): a session and a call offered by one fake practitioner whose
 * calendar counts as connected and whose hours cover every day, the booking-messages consent text,
 * and the settings the flow reads. Every name, price, rate, rule and threshold here is a test
 * value, never IIIC's (CLAUDE.md #1), and the helper refuses any database that is not local, as
 * the staff seeds do (tests/helpers/localDatabase.ts). Nothing is created twice: a second run
 * finds what the first one made by its fake slug or name.
 */

export const FAKE = {
  practitioner: 'Test Counsellor (fake)',
  sessionSlug: 'e2e-fake-session',
  callSlug: 'e2e-fake-call',
  sessionPricePaise: 150_000,
  consentText: 'Fake consent text for tests: send me messages about this booking.',
  marketingText: 'Fake consent text for tests: send me the monthly Journal.',
} as const

const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

let cached: Payload | null = null
async function payloadFor(): Promise<Payload> {
  assertLocalDatabase()
  cached ??= await getPayload({ config })
  return cached
}

const SERVER = { overrideAccess: true, depth: 0 } as const

/** The fake booking rules: two hours' notice so a reschedule window of one hour holds. */
const RULES = {
  noticeHours: 2,
  horizonDays: 7,
  bufferMinutes: 0,
  holdMinutes: 10,
  rescheduleWindowHours: 1,
  refunds: [{ hoursBefore: 1, refundPercent: 100 }],
}

async function upsertService(
  payload: Payload,
  data: {
    slug: string
    name: string
    type: 'session' | 'call'
    register: 'counselling' | 'consultancy'
    pricePaise: number | null
  },
): Promise<number> {
  const fields = {
    name: data.name,
    type: data.type,
    slug: data.slug,
    register: data.register,
    format: 'online' as const,
    options: [
      {
        label: 'Fake 30',
        duration: 30,
        ...(data.pricePaise === null ? {} : { price: data.pricePaise, gstInclusive: true }),
      },
    ],
    ...(data.pricePaise === null ? {} : { gstRateBasisPoints: 1800, sacCode: '999999' }),
    bookingRules: RULES,
    active: true,
  }
  const { docs } = await payload.find({
    collection: 'services',
    where: { slug: { equals: data.slug } },
    limit: 1,
    ...SERVER,
  })
  if (docs[0]) return docs[0].id
  const created = await payload.create({ collection: 'services', data: fields, ...SERVER })
  return created.id
}

async function consentVersion(
  payload: Payload,
  purpose: 'bookingCommunications' | 'marketingEmail',
  text: string,
) {
  const { docs } = await payload.find({
    collection: 'consent-versions',
    where: { and: [{ purpose: { equals: purpose } }, { text: { equals: text } }] },
    limit: 1,
    ...SERVER,
  })
  if (docs[0]) return
  await payload.create({
    collection: 'consent-versions',
    data: {
      purpose,
      language: 'en-IN',
      text,
      effectiveFrom: new Date(Date.now() - 86_400_000).toISOString(),
      effectiveFrom_tz: 'Asia/Kolkata',
    } as never,
    ...SERVER,
  })
}

export type Seeded = { sessionId: number; callId: number; practitionerId: number }

export async function seedBookables(): Promise<Seeded> {
  const payload = await payloadFor()
  const sessionId = await upsertService(payload, {
    slug: FAKE.sessionSlug,
    name: 'Fake session',
    type: 'session',
    register: 'counselling',
    pricePaise: FAKE.sessionPricePaise,
  })
  const callId = await upsertService(payload, {
    slug: FAKE.callSlug,
    name: 'Fake proposal call',
    type: 'call',
    register: 'consultancy',
    pricePaise: null,
  })
  const found = await payload.find({
    collection: 'practitioners',
    where: { publicName: { equals: FAKE.practitioner } },
    limit: 1,
    ...SERVER,
  })
  const practitionerId =
    found.docs[0]?.id ??
    (
      await payload.create({
        collection: 'practitioners',
        data: { publicName: FAKE.practitioner, services: [sessionId, callId], active: true },
        ...SERVER,
      })
    ).id

  const today = new Date().toISOString().slice(0, 10)
  const rules = await payload.count({
    collection: 'availability-rules',
    where: { practitioner: { equals: practitionerId } },
    overrideAccess: true,
  })
  if (rules.totalDocs === 0) {
    for (const weekday of WEEKDAYS) {
      await payload.create({
        collection: 'availability-rules',
        data: {
          practitioner: practitionerId,
          weekday,
          spans: [{ start: '00:00', end: '23:30' }],
          validFrom: '2026-01-01' < today ? '2026-01-01' : today,
        },
        ...SERVER,
      })
    }
  }
  const connections = await payload.count({
    collection: 'calendar-connections',
    where: { practitioner: { equals: practitionerId } },
    overrideAccess: true,
  })
  if (connections.totalDocs === 0) {
    await payload.create({
      collection: 'calendar-connections',
      data: {
        practitioner: practitionerId,
        provider: 'google',
        calendarId: 'fake.counsellor@example.invalid',
        status: 'connected',
      } as never,
      ...SERVER,
    })
  }
  await consentVersion(payload, 'bookingCommunications', FAKE.consentText)
  await consentVersion(payload, 'marketingEmail', FAKE.marketingText)
  return { sessionId, callId, practitionerId }
}

type SettingsState = {
  flags: { pricesPublic: boolean; payAtBooking: boolean }
  threshold: number | null
}

/** The flags and the refund threshold as they are, to put back after the tests. */
export async function readSettings(): Promise<SettingsState> {
  const payload = await payloadFor()
  const settings = await payload.findGlobal({ slug: 'settings', ...SERVER })
  return {
    flags: {
      pricesPublic: settings.flags?.pricesPublic === true,
      payAtBooking: settings.flags?.payAtBooking === true,
    },
    threshold: settings.money?.refundApprovalThresholdPaise ?? null,
  }
}

/** Sets the two switches (docs/16 §8) and a fake refund threshold. */
export async function setSettings(state: SettingsState): Promise<void> {
  const payload = await payloadFor()
  const settings = await payload.findGlobal({ slug: 'settings', ...SERVER })
  await payload.updateGlobal({
    slug: 'settings',
    data: {
      flags: { ...(settings.flags ?? {}), ...state.flags },
      money: { refundApprovalThresholdPaise: state.threshold },
    },
    ...SERVER,
  })
}

export async function bookingByReference(reference: string) {
  const payload = await payloadFor()
  const { docs } = await payload.find({
    collection: 'bookings',
    where: { reference: { equals: reference } },
    limit: 1,
    ...SERVER,
  })
  return docs[0] ?? null
}

export async function bookingsRescheduledFrom(bookingId: number) {
  const payload = await payloadFor()
  const { docs } = await payload.find({
    collection: 'bookings',
    where: { rescheduledFrom: { equals: bookingId } },
    ...SERVER,
  })
  return docs
}

export async function paymentsOf(bookingId: number) {
  const payload = await payloadFor()
  const { docs } = await payload.find({
    collection: 'payments',
    where: { booking: { equals: bookingId } },
    sort: 'createdAt',
    ...SERVER,
  })
  return docs
}

export async function refundsOf(bookingId: number) {
  const payload = await payloadFor()
  const { docs } = await payload.find({
    collection: 'refunds',
    where: { booking: { equals: bookingId } },
    ...SERVER,
  })
  return docs
}

export async function gatewayEventsOf(paymentId: number) {
  const payload = await payloadFor()
  const { docs } = await payload.find({
    collection: 'gateway-events',
    where: { payment: { equals: paymentId } },
    ...SERVER,
  })
  return docs
}

/** Moves a hold's end into the past, as ten minutes passing would (the clock is the server's). */
export async function lapseHold(reference: string): Promise<void> {
  const payload = await payloadFor()
  const booking = await bookingByReference(reference)
  if (!booking) throw new Error('No such booking.')
  await payload.update({
    collection: 'bookings',
    id: booking.id,
    data: { holdExpiresAt: new Date(Date.now() - 60_000).toISOString() },
    ...SERVER,
  })
}
