// @vitest-environment node
import * as Sentry from '@sentry/nextjs'
import type { PayloadRequest } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { env } from '@/lib/env'
import { scrubEvent, scrubText } from '@/lib/monitoring/scrub'
import {
  reportError,
  reportServerError,
  reportTestError,
  startMonitoring,
  withReference,
} from '@/lib/monitoring/sentry'

vi.mock('@sentry/nextjs', () => ({
  init: vi.fn(),
  getClient: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn(async () => true),
}))
vi.mock('@/lib/env', () => ({ env: vi.fn() }))

const sentry = vi.mocked(Sentry)
// Obviously fake values.
const DSN = 'https://publickey@o0.ingest.example.invalid/1'
const TOKEN = 'test-only-0123456789-abcdefghijklmnopqrstuv'

beforeEach(() => {
  vi.clearAllMocks()
  sentry.getClient.mockReturnValue(undefined)
  vi.mocked(env).mockReturnValue({ NODE_ENV: 'test' } as ReturnType<typeof env>)
})

describe('scrubText', () => {
  it('takes emails, phone numbers and long tokens out of a message', () => {
    expect(scrubText(`No user fake.person@example.invalid, +919876543210 or 9876543210`)).toBe(
      'No user [email], [phone] or [phone]',
    )
    expect(scrubText(`Bad link /admin/reset/${TOKEN}`)).toBe('Bad link /admin/reset/[token]')
  })

  it('takes phone numbers out however they are written, and emails from URLs', () => {
    for (const phone of [
      '+919876543210',
      '+91 98765 43210',
      '+91-98765-43210',
      '919876543210',
      '91 98765 43210',
      '09876543210',
      '98765 43210',
    ]) {
      expect(scrubText(`Could not reach ${phone}`), phone).toBe('Could not reach [phone]')
      // In a URL, + is written %2B and a space %20, before the number as well as inside it.
      const encoded = encodeURIComponent(phone)
      expect(scrubText(`/search?q=${encoded}`), encoded).toBe('/search?q=[phone]')
      expect(scrubText(`?text=Call%20on%20${encoded}`), encoded).toBe('?text=Call%20on%20[phone]')
    }
    expect(scrubText('?q=%2b919876543210&to=9876543210%2C9876543211')).toBe(
      '?q=[phone]&to=[phone]%2C[phone]',
    )
    expect(scrubText('/admin/collections/users?search=fake.person%40example.invalid')).toBe(
      '/admin/collections/users?search=[email]',
    )
    // Two addresses back to back, as a query writes a space between them.
    expect(scrubText('?to=fake.person@example.invalid+other.person@example.invalid')).toBe(
      '?to=[email]',
    )
    // Long numbers that are not phone numbers stay, so reports keep their timings and ids.
    expect(scrubText('Took 1795251128671 ms, id 4512464474865664')).toBe(
      'Took 1795251128671 ms, id 4512464474865664',
    )
    expect(scrubText('/ids/1795251128671%2C4512464474865664')).toBe(
      '/ids/1795251128671%2C4512464474865664',
    )
  })

  it('cleans a long message in well under a second', () => {
    // Runs of the characters an address is made of, with no @ or %40: a pattern that tries a
    // match from each of their characters takes seconds on each of these.
    for (const text of ['a'.repeat(50_000), '%41'.repeat(20_000), 'a+'.repeat(25_000)]) {
      const started = performance.now()
      scrubText(text)
      expect(performance.now() - started, text.slice(0, 6)).toBeLessThan(250)
    }
  })

  it('takes the key out of an address whose last part is one, however short', () => {
    // A certificate's QR token is 22 characters (docs/18 §4): shorter than a long token.
    const verify = 'AbCdEfGhIjKlMnOpQrStUv'
    expect(scrubText(`GET /institute/verify/${verify}`)).toBe('GET /institute/verify/[token]')
    expect(scrubText(`GET /verify/${verify}`)).toBe('GET /verify/[token]')
    expect(scrubText('/book/pay/IIIC-S-00001')).toBe('/book/pay/[token]')
    expect(scrubText('/b/abcdefghij/cancel')).toBe('/b/[token]/cancel')
    expect(scrubText('/p/abcdefghij/pdf')).toBe('/p/[token]/pdf')
    expect(scrubText('/w/abcdefghij/withdraw')).toBe('/w/[token]/withdraw')
    expect(scrubText('GET /newsletter/confirm/abcdefghij')).toBe('GET /newsletter/confirm/[token]')
    expect(scrubText('/newsletter/unsubscribe/abcdefghij')).toBe('/newsletter/unsubscribe/[token]')
    expect(scrubText('/newsletter')).toBe('/newsletter')
    // The pages themselves, and short words, stay readable.
    expect(scrubText('/institute/verify')).toBe('/institute/verify')
    expect(scrubText('/api/bookings/12/reschedule')).toBe('/api/bookings/12/reschedule')
    const event = scrubEvent({
      request: { url: `https://site.invalid/institute/verify/${verify}?id=IIIC-C-2027-1-7` },
      transaction: `GET /institute/verify/${verify}`,
      contexts: { nextjs: { request_path: `/institute/verify/${verify}` } },
    })
    expect(JSON.stringify(event)).not.toContain(verify)
    expect(JSON.stringify(event)).not.toContain('IIIC-C-')
  })

  it('drops the values of a failed database query', () => {
    expect(
      scrubText('Failed query: select * from "users" where "email" = $1\nparams: a@b.invalid,7'),
    ).toBe('Failed query: select * from "users" where "email" = $1\nparams: [removed]')
  })
})

describe('scrubEvent', () => {
  it('removes the person, the request data and the trail, and keeps what locates the fault', () => {
    const event = {
      user: { id: 7, email: 'fake.person@example.invalid', ip_address: '203.0.113.9' },
      breadcrumbs: [{ category: 'query', message: 'select …' }],
      extra: { body: { name: 'Fake Person' } },
      request: {
        method: 'POST',
        url: `https://iiic.example/admin/reset/${TOKEN}?token=secret#x`,
        headers: { cookie: 'payload-token=secret' },
        cookies: { 'payload-token': 'secret' },
        data: { password: 'secret' },
        query_string: 'token=secret',
      },
      message: 'Could not email fake.person@example.invalid',
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Row for fake.person@example.invalid',
            stacktrace: { frames: [{ function: 'save', vars: { password: 'secret' } }] },
          },
        ],
      },
      tags: { role: 'owner', collection: 'users' },
      transaction: `GET /admin/reset/${TOKEN}`,
      contexts: {
        nextjs: { request_path: `/admin/reset/${TOKEN}`, router_path: '/admin/[[...segments]]' },
        trace: { trace_id: '0123456789abcdef0123456789abcdef', span_id: '0123456789abcdef' },
      },
    }
    const scrubbed = scrubEvent(event)
    expect(scrubbed).toEqual({
      request: { method: 'POST', url: '/admin/reset/[token]' },
      transaction: 'GET /admin/reset/[token]',
      contexts: {
        nextjs: { request_path: '/admin/reset/[token]', router_path: '/admin/[[...segments]]' },
        trace: { trace_id: '0123456789abcdef0123456789abcdef', span_id: '0123456789abcdef' },
      },
      message: 'Could not email [email]',
      exception: {
        values: [
          {
            type: 'Error',
            value: 'Row for [email]',
            stacktrace: { frames: [{ function: 'save' }] },
          },
        ],
      },
      tags: { role: 'owner', collection: 'users' },
    })
    expect(JSON.stringify(scrubbed)).not.toMatch(/secret|example\.invalid|203\.0\.113/)
    expect(JSON.stringify(scrubbed)).not.toContain(TOKEN)
  })
})

describe('startMonitoring', () => {
  it('stays off without a DSN', () => {
    startMonitoring()
    expect(sentry.init).not.toHaveBeenCalled()
  })

  it('reports errors only, scrubbed, with the deployment as the release', () => {
    vi.mocked(env).mockReturnValue({
      NODE_ENV: 'production',
      VERCEL_ENV: 'preview',
      VERCEL_GIT_COMMIT_SHA: 'abc123',
      sentryDsn: DSN,
    } as ReturnType<typeof env>)
    startMonitoring()
    const options = sentry.init.mock.calls[0]?.[0]
    expect(options).toMatchObject({
      dsn: DSN,
      environment: 'preview',
      release: 'abc123',
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
        databaseQueryData: false,
        stackFrameVariables: false,
      },
    })
    // Unset, not zero: any value would switch tracing on.
    expect(options).not.toHaveProperty('tracesSampleRate')
    expect(options?.beforeBreadcrumb?.({ message: 'select …' })).toBeNull()
    const sent = options?.beforeSend?.(
      { type: undefined, user: { email: 'fake.person@example.invalid' } },
      {},
    )
    expect(sent).toEqual({ type: undefined })
  })

  it('tags a report with the digest the 500 page shows as its reference', () => {
    vi.mocked(env).mockReturnValue({ sentryDsn: DSN } as ReturnType<typeof env>)
    startMonitoring()
    const options = sentry.init.mock.calls[0]?.[0]
    const error = Object.assign(new Error('fake'), { digest: '2938475610@E394' })
    const sent = options?.beforeSend?.(
      { type: undefined, tags: { role: 'owner' } },
      { originalException: error },
    )
    expect(sent).toEqual({ type: undefined, tags: { role: 'owner', digest: '2938475610@E394' } })
  })
})

describe('withReference', () => {
  it('leaves a report without a digest, or with one that is not Next.js’s, as it was', () => {
    const event = { tags: { role: 'owner' } }
    expect(withReference(event, {})).toBe(event)
    expect(withReference(event, { originalException: new Error('fake') })).toBe(event)
    for (const digest of [42, '', 'has spaces', 'a'.repeat(65), 'fake.person@example.invalid']) {
      expect(withReference(event, { originalException: { digest } }), String(digest)).toBe(event)
    }
  })
})

describe('reportError', () => {
  it('does nothing while reporting is off', async () => {
    expect(await reportError(new Error('fake'))).toBe(false)
    expect(sentry.captureException).not.toHaveBeenCalled()
  })

  it('sends the error with its tags and waits for it to leave', async () => {
    sentry.getClient.mockReturnValue({} as ReturnType<typeof Sentry.getClient>)
    const error = new Error('fake')
    expect(await reportError(error, { role: 'owner' })).toBe(true)
    expect(sentry.captureException).toHaveBeenCalledWith(error, { tags: { role: 'owner' } })
    expect(sentry.flush).toHaveBeenCalledWith(2000)
  })
})

describe('reportServerError', () => {
  const args = (error: unknown) =>
    ({
      error,
      collection: { slug: 'media' },
      req: { user: { id: 7, email: 'fake.person@example.invalid', roles: ['editor'] } },
    }) as unknown as Parameters<typeof reportServerError>[0]

  it("leaves the caller's mistakes (4xx) alone", async () => {
    sentry.getClient.mockReturnValue({} as ReturnType<typeof Sentry.getClient>)
    await reportServerError(args(Object.assign(new Error('Forbidden'), { status: 403 })))
    expect(sentry.captureException).not.toHaveBeenCalled()
  })

  it("reports the server's faults with the collection and the role, nothing else of the person", async () => {
    sentry.getClient.mockReturnValue({} as ReturnType<typeof Sentry.getClient>)
    const error = new Error('fake database fault')
    await reportServerError(args(error))
    expect(sentry.captureException).toHaveBeenCalledWith(error, {
      tags: { collection: 'media', role: 'editor' },
    })
  })
})

describe('reportTestError', () => {
  const owner = { id: 1, collection: 'users', roles: ['owner'], active: true, _strategy: 'totp' }
  const call = (user: Record<string, unknown> | null) =>
    reportTestError({ user } as unknown as PayloadRequest)

  it('is for an owner who has entered their code', async () => {
    expect((await call(null)).status).toBe(401)
    expect((await call({ ...owner, _strategy: 'local-jwt' })).status).toBe(401)
    expect((await call({ ...owner, roles: ['operator'] })).status).toBe(403)
    expect((await call({ ...owner, active: false })).status).toBe(403)
    expect(sentry.captureException).not.toHaveBeenCalled()
  })

  it('says so when reporting is off', async () => {
    expect((await call(owner)).status).toBe(503)
  })

  it('sends one labelled test error', async () => {
    sentry.getClient.mockReturnValue({} as ReturnType<typeof Sentry.getClient>)
    const response = await call(owner)
    expect(response.status).toBe(200)
    expect(sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Test error from the admin: error reporting works.' }),
      { tags: { role: 'owner', test: 'true' } },
    )
  })
})
