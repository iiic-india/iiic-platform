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
    }
    const scrubbed = scrubEvent(event)
    expect(scrubbed).toEqual({
      request: { method: 'POST', url: '/admin/reset/[token]' },
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
