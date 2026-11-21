// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AnalyticsEvents } from '@/collections/AnalyticsEvents'
import { AnalyticsEvent, EVENT_NAMES } from '@/lib/analytics/events'
import { recordEvent, recordEventQuietly } from '@/lib/analytics/record'
import { sessionHash } from '@/lib/analytics/session'
import { reportError } from '@/lib/monitoring/sentry'

// Writing a funnel event (docs/04 `analytics_events`; docs/12 §7, §10): what may be recorded
// without consent, and nothing more. The database and error reporting are faked; the address
// is from a documentation range (RFC 5737).
const { create } = vi.hoisted(() => ({ create: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: async () => ({ create }) }))
vi.mock('@/lib/env', () => ({
  env: () => ({ PAYLOAD_SECRET: 'fake-secret-for-tests-only-0000000000000000' }),
}))
vi.mock('@/lib/monitoring/sentry', () => ({ reportError: vi.fn(async () => false) }))

const ADDRESS = '203.0.113.7'
const BROWSER = 'Mozilla/5.0 (fake browser)'
const headers = () =>
  new Headers({
    'x-forwarded-for': ADDRESS,
    'user-agent': BROWSER,
    referer: 'https://fake.example/somewhere?name=fake',
    cookie: 'fake=1',
  })
const NOW = new Date('2026-12-01T06:00:00Z')
const STEP_ZERO = { name: 'step0', route: '/map', register: 'default', whoFor: 'family' } as const

let errors: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  create.mockReset()
  vi.mocked(reportError).mockClear()
  errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  errors.mockRestore()
})

describe('recording an event', () => {
  it('writes the event, the page, the register, whom it is for, the day’s code and the time', async () => {
    await recordEvent(STEP_ZERO, headers(), NOW)
    expect(create).toHaveBeenCalledTimes(1)
    const [{ collection, data, overrideAccess }] = create.mock.calls[0] ?? [{}]
    expect(collection).toBe('analytics-events')
    // Written by the server: nobody may write one through the API.
    expect(overrideAccess).toBe(true)
    expect(data).toEqual({
      ...STEP_ZERO,
      sessionHash: sessionHash({
        secret: 'fake-secret-for-tests-only-0000000000000000',
        now: NOW,
        address: ADDRESS,
        userAgent: BROWSER,
      }),
      at: NOW.toISOString(),
      at_tz: 'Asia/Kolkata',
    })
  })

  it('stores no address, browser, referrer, cookie or person', async () => {
    await recordEvent(STEP_ZERO, headers(), NOW)
    const stored = JSON.stringify(create.mock.calls[0]?.[0]?.data)
    for (const leak of [ADDRESS, 'Mozilla', 'fake.example', 'name=fake', 'fake=1']) {
      expect(stored, leak).not.toContain(leak)
    }
  })

  it('refuses what is not an event: an unknown name, a page with a query, an unknown answer', async () => {
    for (const bad of [
      { ...STEP_ZERO, name: 'page_view' },
      { ...STEP_ZERO, route: '/map?who=family' },
      { ...STEP_ZERO, route: 'https://fake.example/map' },
      { ...STEP_ZERO, register: 'admin' },
      { ...STEP_ZERO, whoFor: 'everyone' },
    ]) {
      await expect(recordEvent(bad as never, headers(), NOW), JSON.stringify(bad)).rejects.toThrow()
    }
    expect(create).not.toHaveBeenCalled()
    expect(
      AnalyticsEvent.safeParse({ name: 'step0', route: '/', register: 'default' }).success,
    ).toBe(true)
  })

  it('knows docs/04’s event names, and the collection holds no link to a person', () => {
    expect(EVENT_NAMES.map((event) => event.value)).toEqual([
      'door',
      'step0',
      'booking_started',
      'time_chosen',
      'booking_confirmed',
      'request_submitted',
      'map_completed',
      'newsletter_confirmed',
      'search_no_results',
    ])
    const types = AnalyticsEvents.fields.map((field) => field.type)
    expect(types).not.toContain('relationship')
    expect(types).not.toContain('join')
    expect(types).not.toContain('upload')
  })
})

describe('recording an event without failing the request', () => {
  it('logs only the error’s name and reports it, and never throws', async () => {
    create.mockRejectedValueOnce(
      Object.assign(new Error('fake: value 203.0.113.7 violates something'), { name: 'FakeError' }),
    )
    await expect(recordEventQuietly(STEP_ZERO, headers(), NOW)).resolves.toBeUndefined()
    expect(errors).toHaveBeenCalledWith('An analytics event was not recorded (FakeError).')
    expect(JSON.stringify(errors.mock.calls)).not.toContain('203.0.113.7')
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), { task: 'analytics-event' })
  })

  it('is quiet when the event is recorded', async () => {
    await recordEventQuietly(STEP_ZERO, headers(), NOW)
    expect(create).toHaveBeenCalledTimes(1)
    expect(errors).not.toHaveBeenCalled()
    expect(reportError).not.toHaveBeenCalled()
  })
})
