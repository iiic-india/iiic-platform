// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import { fakeTurnstile } from '@/lib/enquiryForms/turnstile'

vi.mock('server-only', () => ({}))

const {
  BOOKING_FORMS,
  BOOKING_LIMITS,
  bookingLimitsOn,
  bookingsStoreHere,
  fakeRecentBookings,
  guardBooking,
  recentBookings,
} = await import('@/lib/bookingFlow/guards')

// What stands between the public booking flow and the database (D-108): nothing on a preview,
// Turnstile where its keys are set, and the rate limits on production. Obviously fake addresses
// (from the documentation ranges), emails and tokens; no request leaves for Cloudflare.

const NOW = new Date('2099-01-05T06:00:00.000Z')
const ADDRESS = '203.0.113.7'
const EMAIL = 'client.test@example.invalid'
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000)

type World = Parameters<typeof guardBooking>[1]

function world(overrides: Partial<World> = {}): World {
  return {
    storesHere: true,
    limitsOn: true,
    turnstile: null,
    address: ADDRESS,
    now: NOW,
    recent: fakeRecentBookings([]),
    ...overrides,
  }
}

const made = (count: number, row: { address?: string | null; email?: string; minutes: number }) =>
  Array.from({ length: count }, () => ({
    address: row.address === undefined ? ADDRESS : row.address,
    email: row.email ?? EMAIL,
    at: minutesAgo(row.minutes),
  }))

describe('where a booking is stored', () => {
  it('stores locally, in CI and on production, and never on a preview', () => {
    expect(bookingsStoreHere({ VERCEL_ENV: undefined })).toBe(true)
    expect(bookingsStoreHere({ VERCEL_ENV: 'production' })).toBe(true)
    expect(bookingsStoreHere({ VERCEL_ENV: 'preview' })).toBe(false)
    expect(bookingsStoreHere({ VERCEL_ENV: 'development' })).toBe(false)
  })

  it('counts the rate limits on production only', () => {
    expect(bookingLimitsOn({ VERCEL_ENV: 'production' })).toBe(true)
    expect(bookingLimitsOn({ VERCEL_ENV: 'preview' })).toBe(false)
    expect(bookingLimitsOn({ VERCEL_ENV: undefined })).toBe(false)
  })

  it('refuses on a preview before asking Turnstile or counting anything', async () => {
    const turnstile = fakeTurnstile(['fake-token'])
    const recent = { fromAddress: vi.fn(), forEmail: vi.fn() }
    const refusal = await guardBooking(
      { email: EMAIL, turnstileToken: 'fake-token' },
      world({ storesHere: false, turnstile, recent }),
    )
    expect(refusal).toBe('preview')
    expect(turnstile.calls).toEqual([])
    expect(recent.fromAddress).not.toHaveBeenCalled()
    expect(recent.forEmail).not.toHaveBeenCalled()
  })
})

describe('Turnstile on a booking', () => {
  it('asks nothing of a booking where its keys are not set', async () => {
    expect(await guardBooking({ email: EMAIL }, world())).toBeNull()
  })

  it('lets a booking through with a token Cloudflare passes', async () => {
    const turnstile = fakeTurnstile(['fake-token'])
    expect(
      await guardBooking({ email: EMAIL, turnstileToken: 'fake-token' }, world({ turnstile })),
    ).toBeNull()
    expect(turnstile.calls).toContain('fake-token')
  })

  it('refuses a missing, malformed or failed token, without counting', async () => {
    const turnstile = fakeTurnstile(['fake-token'])
    const recent = { fromAddress: vi.fn(), forEmail: vi.fn() }
    for (const token of [undefined, '', 42, 'x'.repeat(2049), 'fake-wrong-token']) {
      expect(
        await guardBooking({ email: EMAIL, turnstileToken: token }, world({ turnstile, recent })),
        String(token).slice(0, 20),
      ).toBe('turnstile')
    }
    // Only the well-shaped token went to Cloudflare.
    expect(turnstile.calls).toEqual(['fake-wrong-token'])
    expect(recent.fromAddress).not.toHaveBeenCalled()
  })
})

describe('the rate limits', () => {
  it('allows the fifth booking an hour from one address and refuses the sixth', async () => {
    const { count } = BOOKING_LIMITS.perAddress
    const four = made(count - 1, { minutes: 10 }).map((row, index) => ({
      ...row,
      email: `client.${index}@example.invalid`,
    }))
    expect(
      await guardBooking({ email: EMAIL }, world({ recent: fakeRecentBookings(four) })),
    ).toBeNull()
    const five = [...four, { address: ADDRESS, email: 'client.x@example.invalid', at: NOW }]
    expect(await guardBooking({ email: EMAIL }, world({ recent: fakeRecentBookings(five) }))).toBe(
      'limit',
    )
  })

  it('forgets an address’s bookings older than an hour', async () => {
    const old = made(10, { minutes: 61, email: 'someone.else@example.invalid' })
    expect(
      await guardBooking({ email: EMAIL }, world({ recent: fakeRecentBookings(old) })),
    ).toBeNull()
  })

  it('refuses a fourth booking a day for one email, from any address, whatever its case', async () => {
    const three = made(BOOKING_LIMITS.perEmail.count, { minutes: 20 * 60, address: '198.51.100.9' })
    expect(
      await guardBooking(
        { email: '  Client.Test@Example.INVALID ' },
        world({ recent: fakeRecentBookings(three) }),
      ),
    ).toBe('limit')
    const yesterday = made(3, { minutes: 25 * 60, address: '198.51.100.9' })
    expect(
      await guardBooking({ email: EMAIL }, world({ recent: fakeRecentBookings(yesterday) })),
    ).toBeNull()
  })

  it('counts no address when the request carries none, and still counts the email', async () => {
    const recent = {
      fromAddress: vi.fn(async () => 99),
      forEmail: vi.fn(async () => 0),
    }
    expect(await guardBooking({ email: EMAIL }, world({ address: null, recent }))).toBeNull()
    expect(recent.fromAddress).not.toHaveBeenCalled()
    expect(recent.forEmail).toHaveBeenCalledWith(EMAIL, minutesAgo(24 * 60))
  })

  it('counts nothing where the limits are off (locally and in CI)', async () => {
    const recent = { fromAddress: vi.fn(async () => 99), forEmail: vi.fn(async () => 99) }
    expect(await guardBooking({ email: EMAIL }, world({ limitsOn: false, recent }))).toBeNull()
    expect(recent.fromAddress).not.toHaveBeenCalled()
  })
})

describe('the counts as the database holds them', () => {
  it('counts the booking consents from an address and the booking people for an email', async () => {
    const count = vi.fn(async () => ({ totalDocs: 2 }))
    const recent = recentBookings({ count } as never)
    const since = minutesAgo(60)
    expect(await recent.fromAddress(ADDRESS, since)).toBe(2)
    expect(await recent.forEmail(EMAIL, since)).toBe(2)
    expect(count).toHaveBeenNthCalledWith(1, {
      collection: 'consents',
      where: {
        and: [
          { purpose: { equals: 'bookingCommunications' } },
          { 'evidence.form': { in: BOOKING_FORMS } },
          { 'evidence.ip': { equals: ADDRESS } },
          { grantedAt: { greater_than: since.toISOString() } },
        ],
      },
      overrideAccess: true,
    })
    expect(count).toHaveBeenNthCalledWith(2, {
      collection: 'people',
      where: {
        and: [
          { email: { equals: EMAIL } },
          { source: { equals: 'booking' } },
          { createdAt: { greater_than: since.toISOString() } },
        ],
      },
      overrideAccess: true,
    })
    expect(BOOKING_FORMS).toEqual(['booking:session', 'booking:call', 'booking:info'])
  })
})
