// @vitest-environment node
import type { PayloadRequest } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FakeCalendar } from '@/lib/calendar/fakeCalendar'
import { hashToken } from '@/lib/calendar/tokens'
import { err, ok } from '@/lib/result'

// The calendar's three ways in from outside (docs/16 §7; CLAUDE.md #6): Google's change
// notifications, a practitioner's private feed, and the owner's feed-link endpoints. Each checks
// its caller before anything else and refuses everyone else with nothing changed. The database,
// the calendar and the feed's contents are stubbed here; tests/int checks them for real.

vi.mock('server-only', () => ({}))
vi.mock('@payload-config', () => ({ default: {} }))

const find = vi.fn()
const fakePayload = { find, logger: { info: vi.fn(), error: vi.fn() } }
vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('payload')>()),
  getPayload: vi.fn(async () => fakePayload),
  createLocalReq: vi.fn(async () => ({ payload: fakePayload, context: {} })),
}))

const deps = vi.hoisted(() => ({
  current: {
    provider: { ok: true, value: {} } as { ok: boolean; value?: unknown; error?: unknown },
    siteUrl: 'https://fake.example.invalid',
    webhookAddress: 'https://fake.example.invalid/api/webhooks/google-calendar',
  },
}))
vi.mock('@/lib/calendar/calendarFor', () => ({ calendarDeps: () => deps.current }))

const refreshBusyBlocksWith = vi.fn(async () => ({ ok: true, value: { blocks: 2 } }))
vi.mock('@/lib/calendar/sync', () => ({ refreshBusyBlocksWith }))

const practitionerFeed = vi.fn()
const issueFeedLink = vi.fn()
const revokeFeedLink = vi.fn()
vi.mock('@/lib/calendar/feed', () => ({ practitionerFeed, issueFeedLink, revokeFeedLink }))

const { POST: notify } = await import('@/app/api/webhooks/google-calendar/route')
const { GET: feed } = await import('@/app/api/calendar/feed/[token]/route')
const {
  issueFeedLinkHandler,
  normaliseConnection,
  refreshAfterConnectionChange,
  removeBlocksWithConnection,
  revokeFeedLinkHandler,
  busyBlockInOrder,
} = await import('@/lib/calendar/connectionHooks')

const CHANNEL_TOKEN = 'fake-channel-token-0000000000000000000000000'
const connection = {
  id: 5,
  practitioner: 9,
  calendarId: 'fakeasha@fake.example.invalid',
  status: 'connected',
  watch: { channelId: 'fake-channel', resourceId: 'fake-resource' },
  channelTokenHash: hashToken(CHANNEL_TOKEN),
}

const notification = (headers: Record<string, string>) =>
  new Request('https://fake.example.invalid/api/webhooks/google-calendar', {
    method: 'POST',
    headers: {
      'X-Goog-Channel-ID': 'fake-channel',
      'X-Goog-Channel-Token': CHANNEL_TOKEN,
      'X-Goog-Resource-ID': 'fake-resource',
      'X-Goog-Resource-State': 'exists',
      ...headers,
    },
  })

beforeEach(() => {
  vi.clearAllMocks()
  deps.current.provider = { ok: true, value: new FakeCalendar() }
  find.mockResolvedValue({ docs: [connection] })
})

describe('POST /api/webhooks/google-calendar', () => {
  it('reads the practitioner’s busy times again for a believed change', async () => {
    const response = await notify(notification({}))
    expect(response.status).toBe(200)
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'calendar-connections',
        where: { 'watch.channelId': { equals: 'fake-channel' } },
        overrideAccess: true,
        showHiddenFields: true,
      }),
    )
    expect(refreshBusyBlocksWith).toHaveBeenCalledWith(
      deps.current,
      expect.anything(),
      expect.objectContaining({ practitionerId: 9 }),
    )
  })

  it('refuses a notification without Google’s headers before asking the database', async () => {
    const response = await notify(
      new Request('https://fake.example.invalid/api/webhooks/google-calendar', { method: 'POST' }),
    )
    expect(response.status).toBe(400)
    expect(find).not.toHaveBeenCalled()
  })

  it('refuses a wrong token or another resource, and changes nothing', async () => {
    const refusals: Record<string, string>[] = [
      { 'X-Goog-Channel-Token': 'fake-wrong-token' },
      { 'X-Goog-Resource-ID': 'another-resource' },
    ]
    for (const headers of refusals) {
      const response = await notify(notification(headers))
      expect(response.status).toBe(401)
    }
    expect(refreshBusyBlocksWith).not.toHaveBeenCalled()
  })

  it('answers 404 for a channel no connection holds (an old one, or a guess)', async () => {
    find.mockResolvedValue({ docs: [] })
    expect((await notify(notification({}))).status).toBe(404)
    expect(refreshBusyBlocksWith).not.toHaveBeenCalled()
  })

  it('answers 404 while the calendar is switched off', async () => {
    deps.current.provider = { ok: false, error: { code: 'not-configured', reason: 'missing' } }
    expect((await notify(notification({}))).status).toBe(404)
    expect(find).not.toHaveBeenCalled()
  })

  it('takes the opening message and a paused calendar’s news without reading anything', async () => {
    expect((await notify(notification({ 'X-Goog-Resource-State': 'sync' }))).status).toBe(200)
    find.mockResolvedValue({ docs: [{ ...connection, status: 'paused' }] })
    expect((await notify(notification({}))).status).toBe(200)
    expect(refreshBusyBlocksWith).not.toHaveBeenCalled()
  })

  it('answers 500, so Google tries again, when the database fails', async () => {
    find.mockRejectedValue(new Error('fake database failure naming fakeasha@fake.example.invalid'))
    const response = await notify(notification({}))
    expect(response.status).toBe(500)
    expect(JSON.stringify(fakePayload.logger.error.mock.calls)).not.toContain('fakeasha')
  })
})

describe('GET /api/calendar/feed/[token]', () => {
  const params = (token: string) => ({ params: Promise.resolve({ token }) })
  const request = new Request('https://fake.example.invalid/api/calendar/feed/x')
  const TOKEN = 'AAAAAAAAAAAAAAAAAAAAAA'

  it('serves the feed as a private calendar that is never cached', async () => {
    practitionerFeed.mockResolvedValue(ok('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n'))
    const response = await feed(request, params(TOKEN))
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8')
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('X-Robots-Tag')).toContain('noindex')
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(await response.text()).toContain('BEGIN:VCALENDAR')
    expect(practitionerFeed).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ token: TOKEN }),
    )
  })

  it('answers a malformed token with a plain 404, before asking the database', async () => {
    for (const token of ['short', `${TOKEN}A`, 'AAAAAAAAAAAAAAAAAAAAA!']) {
      expect((await feed(request, params(token))).status).toBe(404)
    }
    expect(practitionerFeed).not.toHaveBeenCalled()
  })

  it('answers an unknown or revoked token with the same 404', async () => {
    practitionerFeed.mockResolvedValue(err({ code: 'not-found' }))
    const response = await feed(request, params(TOKEN))
    expect(response.status).toBe(404)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })
})

describe('the feed-link endpoints', () => {
  const owner = { id: 1, collection: 'users', roles: ['owner'], active: true }
  const call = (handler: typeof issueFeedLinkHandler, user: unknown, id: unknown = 5) =>
    handler({ user, routeParams: { id }, context: {} } as unknown as PayloadRequest)

  it('give an owner who entered their code a new feed address, once', async () => {
    issueFeedLink.mockResolvedValue(
      ok({ url: 'https://fake.example.invalid/api/calendar/feed/AAAAAAAAAAAAAAAAAAAAAA' }),
    )
    const response = await call(issueFeedLinkHandler, { ...owner, _strategy: 'totp' })
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({
      url: 'https://fake.example.invalid/api/calendar/feed/AAAAAAAAAAAAAAAAAAAAAA',
    })
    expect(issueFeedLink).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ connectionId: 5 }),
    )
  })

  it('let an owner who entered their code revoke a feed address', async () => {
    revokeFeedLink.mockResolvedValue(ok(undefined))
    const response = await call(revokeFeedLinkHandler, { ...owner, _strategy: 'totp' })
    expect(response.status).toBe(200)
    expect(revokeFeedLink).toHaveBeenCalledWith(expect.anything(), { connectionId: 5 })
  })

  it('refuse anyone else before touching the connection', async () => {
    for (const handler of [issueFeedLinkHandler, revokeFeedLinkHandler]) {
      expect((await call(handler, null)).status).toBe(401)
      expect((await call(handler, { ...owner, _strategy: 'local-jwt' })).status).toBe(403)
      for (const role of ['operator', 'practitioner', 'editor', 'finance']) {
        const user = { ...owner, roles: [role], _strategy: 'totp' }
        expect((await call(handler, user)).status, role).toBe(403)
      }
      const deactivated = { ...owner, active: false, _strategy: 'totp' }
      expect((await call(handler, deactivated)).status).toBe(403)
    }
    expect(issueFeedLink).not.toHaveBeenCalled()
    expect(revokeFeedLink).not.toHaveBeenCalled()
  })

  it('answer 404 for a connection that is not there', async () => {
    const user = { ...owner, _strategy: 'totp' }
    expect((await call(issueFeedLinkHandler, user, 'nope')).status).toBe(404)
    revokeFeedLink.mockResolvedValue(err({ code: 'not-found' }))
    expect((await call(revokeFeedLinkHandler, user, 404)).status).toBe(404)
  })
})

describe('the calendar connection hooks', () => {
  const hookReq = () => {
    const remove = vi.fn(async () => ({ docs: [] }))
    const queue = vi.fn(async () => ({}))
    const req = { payload: { delete: remove, jobs: { queue } } } as unknown as PayloadRequest
    return { req, remove, queue }
  }
  type AfterArgs = Parameters<typeof refreshAfterConnectionChange>[0]
  const after = (args: Partial<AfterArgs>) => refreshAfterConnectionChange(args as AfterArgs)

  it('keeps the calendar address in lower case', () => {
    const data = normaliseConnection({
      data: { calendarId: '  Fakeasha@Fake.Example.Invalid ' },
      operation: 'create',
      context: {},
    } as Parameters<typeof normaliseConnection>[0])
    expect(data.calendarId).toBe('fakeasha@fake.example.invalid')
  })

  it('forgets what was read from a calendar the connection no longer names', () => {
    const data = normaliseConnection({
      data: { calendarId: 'other@fake.example.invalid' },
      originalDoc: connection,
      operation: 'update',
      context: {},
    } as unknown as Parameters<typeof normaliseConnection>[0])
    expect(data).toMatchObject({
      watch: { channelId: null, resourceId: null, expiresAt: null },
      channelTokenHash: null,
      lastSyncedAt: null,
      lastError: null,
      feedTokenHash: null,
    })
  })

  it('stops the feed address when the connection is given to another practitioner', () => {
    const owned = { ...connection, feedTokenHash: 'fake-feed-hash' }
    const moved = normaliseConnection({
      data: { ...owned, practitioner: 10 },
      originalDoc: owned,
      operation: 'update',
      context: {},
    } as unknown as Parameters<typeof normaliseConnection>[0])
    expect(moved.feedTokenHash).toBeNull()
    const kept = normaliseConnection({
      data: { ...owned, status: 'paused' },
      originalDoc: owned,
      operation: 'update',
      context: {},
    } as unknown as Parameters<typeof normaliseConnection>[0])
    expect(kept.feedTokenHash).toBe('fake-feed-hash')
  })

  it('queues a refresh when a calendar starts being read, and not when it is paused', async () => {
    const created = hookReq()
    await after({ doc: connection, operation: 'create', context: {}, req: created.req } as never)
    expect(created.queue).toHaveBeenCalledWith(
      expect.objectContaining({
        task: 'B14-refresh-busy-times',
        input: { practitionerId: 9 },
      }),
    )
    const paused = hookReq()
    await after({
      doc: { ...connection, status: 'paused' },
      previousDoc: connection,
      operation: 'update',
      context: {},
      req: paused.req,
    } as never)
    expect(paused.queue).not.toHaveBeenCalled()
    expect(paused.remove).not.toHaveBeenCalled()
  })

  it('removes the busy times copied from a calendar no longer named', async () => {
    const changed = hookReq()
    await after({
      doc: { ...connection, calendarId: 'other@fake.example.invalid' },
      previousDoc: connection,
      operation: 'update',
      context: {},
      req: changed.req,
    } as never)
    expect(changed.remove).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'busy-blocks',
        where: { practitioner: { equals: 9 } },
      }),
    )
    expect(changed.queue).toHaveBeenCalled()
  })

  it('leaves the server’s own writes alone', async () => {
    const own = hookReq()
    await after({
      doc: { ...connection, calendarId: 'other@fake.example.invalid' },
      previousDoc: connection,
      operation: 'update',
      context: { calendarSync: true },
      req: own.req,
    } as never)
    expect(own.queue).not.toHaveBeenCalled()
    expect(own.remove).not.toHaveBeenCalled()
  })

  it('removes the busy times with the connection', async () => {
    const deleted = hookReq()
    await removeBlocksWithConnection({ doc: connection, req: deleted.req } as never)
    expect(deleted.remove).toHaveBeenCalledWith(
      expect.objectContaining({ where: { practitioner: { equals: 9 } } }),
    )
  })

  it('refuses a busy time that does not end after it starts', () => {
    const check = (startsAt: string, endsAt: string) =>
      busyBlockInOrder({ data: { startsAt, endsAt }, context: {} } as never)
    expect(() => check('2099-01-05T05:00:00Z', '2099-01-05T04:00:00Z')).toThrow()
    expect(() => check('2099-01-05T05:00:00Z', '2099-01-05T05:00:00Z')).toThrow()
    expect(check('2099-01-05T04:00:00Z', '2099-01-05T05:00:00Z')).toBeTruthy()
  })
})

describe('withOwnContext', () => {
  it('gives the request its own context back after a calendar write, even a failed one', async () => {
    const { withOwnContext, CALENDAR_SYNC_CONTEXT } = await import('@/lib/calendar/queue')
    const own = { auditAction: 'expire-holds' }
    const req = { context: own } as unknown as PayloadRequest
    // Payload merges a local call's context into the request, as createLocalReq does.
    const write = async () => {
      req.context = { ...req.context, ...CALENDAR_SYNC_CONTEXT }
      return 'written'
    }
    expect(await withOwnContext(req, write)).toBe('written')
    expect(req.context).toBe(own)
    await expect(
      withOwnContext(req, async () => {
        await write()
        throw new Error('fake failure')
      }),
    ).rejects.toThrow('fake failure')
    expect(req.context).toBe(own)
  })
})
