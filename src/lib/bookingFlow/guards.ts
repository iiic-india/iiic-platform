import 'server-only'

import type { Payload } from 'payload'

import { formsStoreHere } from '@/lib/enquiryForms/deployment'
import { isTokenShaped, type TurnstileCheck } from '@/lib/enquiryForms/turnstile'
import type { ServerEnv } from '@/lib/env'

import { FLOW_TYPES } from './options'

/**
 * What stands between the public booking flow and the database (docs/08 §9, "Abuse"; docs/12
 * §5, "Rate limits"; D-108). In order, before anything about the person is stored:
 *
 * 1. Nothing on a preview. Previews share production's database (docs/16 §10), so a booking sent
 *    from one would hold a real practitioner's time and put a person and a consent on production's
 *    records. The flow refuses there, as the enquiry forms do (src/lib/enquiryForms/deployment.ts).
 * 2. Cloudflare Turnstile, where both its keys are set (src/lib/env.ts): the widget's token is
 *    checked with Cloudflare before the booking is made. Without the keys there is no check.
 * 3. The rate limits, on production: at most five bookings an hour from one network address and
 *    three a day for one email address, the enquiry forms' numbers (D-92). They are counted from
 *    what is stored, a booking's consent and its person, so a refused booking counts for nothing
 *    and no table of counters is needed. Locally and in CI they are off, so the end-to-end suite
 *    can book as often as its flows need; their own tests run on this core and on the database.
 *
 * The address is the request's, as Vercel passes it; it is compared with the evidence each
 * booking's consent already keeps (docs/08 §3) and never logged.
 */

export const BOOKING_LIMITS = {
  perAddress: { count: 5, windowMs: 60 * 60 * 1000 },
  perEmail: { count: 3, windowMs: 24 * 60 * 60 * 1000 },
} as const

/** How many bookings were made since a moment, from one address or for one email address. */
export type RecentBookings = {
  fromAddress: (address: string, since: Date) => Promise<number>
  forEmail: (email: string, since: Date) => Promise<number>
}

export type BookingGuardWorld = {
  /** Whether this deployment stores bookings: locally, in CI and on production. */
  storesHere: boolean
  /** Whether the rate limits count here: on production only. */
  limitsOn: boolean
  /** The check, where Turnstile's keys are set; null where they are not. */
  turnstile: TurnstileCheck | null
  /** The network address the request came from, if known. */
  address: string | null
  now: Date
  recent: RecentBookings
}

export type BookingRefusal = 'preview' | 'turnstile' | 'limit'

/** Why a booking may not be made now, or null when it may. */
export async function guardBooking(
  input: { email: string; turnstileToken?: unknown },
  world: BookingGuardWorld,
): Promise<BookingRefusal | null> {
  if (!world.storesHere) return 'preview'
  if (world.turnstile) {
    const token = input.turnstileToken
    if (!isTokenShaped(token) || !(await world.turnstile(token, world.address))) return 'turnstile'
  }
  if (!world.limitsOn) return null
  const since = (windowMs: number) => new Date(world.now.getTime() - windowMs)
  const { perAddress, perEmail } = BOOKING_LIMITS
  if (
    world.address &&
    (await world.recent.fromAddress(world.address, since(perAddress.windowMs))) >= perAddress.count
  ) {
    return 'limit'
  }
  const email = input.email.trim().toLowerCase()
  if ((await world.recent.forEmail(email, since(perEmail.windowMs))) >= perEmail.count) {
    return 'limit'
  }
  return null
}

/** Whether this deployment may change a booking through its manage link: as for a new one. */
export function bookingsStoreHere(config: Pick<ServerEnv, 'VERCEL_ENV'>): boolean {
  return formsStoreHere(config)
}

/** Whether the rate limits count on this deployment: production only (D-108). */
export function bookingLimitsOn(config: Pick<ServerEnv, 'VERCEL_ENV'>): boolean {
  return config.VERCEL_ENV === 'production'
}

/** The evidence's form name each kind of booking records (src/lib/bookingFlow/actions.ts). */
export const BOOKING_FORMS = FLOW_TYPES.map((type) => `booking:${type}`)

/**
 * The counts as the database holds them, read past the access rules (the server's own check):
 * by address, the booking-messages consents the flow recorded from it, which every booking has
 * (src/lib/bookingFlow/people.ts); by email, the people the flow recorded with it, one per
 * booking, since the flow makes a new record each time.
 */
export function recentBookings(payload: Payload): RecentBookings {
  return {
    fromAddress: async (address, since) =>
      (
        await payload.count({
          collection: 'consents',
          where: {
            and: [
              { purpose: { equals: 'bookingCommunications' } },
              { 'evidence.form': { in: BOOKING_FORMS } },
              { 'evidence.ip': { equals: address } },
              { grantedAt: { greater_than: since.toISOString() } },
            ],
          },
          overrideAccess: true,
        })
      ).totalDocs,
    forEmail: async (email, since) =>
      (
        await payload.count({
          collection: 'people',
          where: {
            and: [
              { email: { equals: email } },
              { source: { equals: 'booking' } },
              { createdAt: { greater_than: since.toISOString() } },
            ],
          },
          overrideAccess: true,
        })
      ).totalDocs,
  }
}

/** For tests: the bookings already made, as address, email and time. */
export function fakeRecentBookings(
  made: readonly { address: string | null; email: string; at: Date }[],
): RecentBookings {
  return {
    fromAddress: async (address, since) =>
      made.filter((row) => row.address === address && row.at > since).length,
    forEmail: async (email, since) =>
      made.filter((row) => row.email === email && row.at > since).length,
  }
}
