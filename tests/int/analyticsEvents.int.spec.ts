import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { ROLES, type Role } from '@/access/roles'
import { recordEvent } from '@/lib/analytics/record'
import type { AnalyticsEvent, User } from '@/payload-types'
import config from '@/payload.config'

// The funnel's events (docs/04 `analytics_events`; docs/12 §7) against the real database:
// written by the server only, read by owners, never changed, never in the audit log, and holding
// nothing about the person. The address is from a documentation range (RFC 5737). Events hold
// nobody's data and stay; the retention job will clear them (M6).
vi.mock('server-only', () => ({}))
// Nothing is reported from a test; the config's own error hook (reportServerError) stays real.
vi.mock('@/lib/monitoring/sentry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/monitoring/sentry')>()),
  reportError: async () => false,
}))

let payload: Payload
const email = (label: string) => `int.analytics.${label}@example.invalid`
const PASSWORD = 'test-only-password-analytics'
const staff = {} as Record<Role, User>
/** A staff user as Payload sees them after they entered their two-factor code. */
const verified = (user: User) => ({ ...user, collection: 'users', _strategy: 'totp' }) as User
const ADDRESS = '203.0.113.9'
const BROWSER = 'Fake browser (int.analytics)'
let event: AnalyticsEvent

beforeAll(async () => {
  payload = await getPayload({ config })
  await payload.delete({ collection: 'users', where: { email: { like: 'int.analytics.' } } })
  // The owner first: on an empty table the first account becomes the owner anyway.
  for (const role of ROLES) {
    staff[role] = await payload.create({
      collection: 'users',
      data: { name: `Fake ${role}`, email: email(role), password: PASSWORD, roles: [role] },
    })
  }
  const at = new Date()
  await recordEvent(
    { name: 'step0', route: '/map', register: 'default', whoFor: 'organisation' },
    new Headers({ 'x-forwarded-for': ADDRESS, 'user-agent': BROWSER }),
    at,
  )
  const { docs } = await payload.find({
    collection: 'analytics-events',
    where: { at: { equals: at.toISOString() } },
    limit: 1,
  })
  event = docs[0] as AnalyticsEvent
})

afterAll(async () => {
  await payload.delete({ collection: 'users', where: { email: { like: 'int.analytics.' } } })
})

describe('an analytics event', () => {
  it('holds the event, the page, the register, whom it is for, a session code and the time', () => {
    expect(event).toMatchObject({
      name: 'step0',
      route: '/map',
      register: 'default',
      whoFor: 'organisation',
      at_tz: 'Asia/Kolkata',
    })
    expect(event.sessionHash).toMatch(/^[0-9a-f]{32}$/)
  })

  it('holds nothing about the person: no address, no browser, no link to a record', () => {
    expect(JSON.stringify(event)).not.toContain(ADDRESS)
    expect(JSON.stringify(event)).not.toContain('Fake browser')
    const fields = payload.collections['analytics-events'].config.flattenedFields
    expect(fields.map((field) => field.type)).not.toContain('relationship')
    expect(fields.map((field) => field.type)).not.toContain('join')
  })

  it('is read by owners only', async () => {
    for (const role of ROLES) {
      const read = payload.findByID({
        collection: 'analytics-events',
        id: event.id,
        user: verified(staff[role]),
        overrideAccess: false,
      })
      if (role === 'owner') await expect(read, role).resolves.toBeTruthy()
      else await expect(read, role).rejects.toThrow()
    }
    await expect(
      payload.find({ collection: 'analytics-events', overrideAccess: false }),
    ).rejects.toThrow()
  })

  it('is written by the server only: not even an owner writes, changes or deletes one', async () => {
    const owner = { user: verified(staff.owner), overrideAccess: false }
    await expect(
      payload.create({
        collection: 'analytics-events',
        data: {
          name: 'door',
          route: '/',
          register: 'default',
          sessionHash: 'fake',
          at: new Date().toISOString(),
        } as AnalyticsEvent,
        ...owner,
      }),
    ).rejects.toThrow()
    await expect(
      payload.update({
        collection: 'analytics-events',
        id: event.id,
        data: { route: '/fake' },
        ...owner,
      }),
    ).rejects.toThrow()
    await expect(
      payload.delete({ collection: 'analytics-events', id: event.id, ...owner }),
    ).rejects.toThrow()
  })

  it('is not in the audit log: nobody’s data changed', async () => {
    const { totalDocs } = await payload.count({
      collection: 'audit-log',
      where: { entity: { equals: 'analytics-events' } },
      overrideAccess: true,
    })
    expect(totalDocs).toBe(0)
  })
})
