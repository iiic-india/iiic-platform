// @vitest-environment node
import { after } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { env } from '@/lib/env'
import { reportError } from '@/lib/monitoring/sentry'
import { logMissingPage } from '@/lib/redirects/log'
import { WRITES_PER_MINUTE } from '@/lib/redirects/missingPages'
import { recordMissingPage } from '@/lib/redirects/store'

// When a 404 writes to the log (src/lib/redirects/log.ts; the route calls it as it answers with
// the 404, tests/unit/redirectLookup.spec.ts): after the response, never on a preview, never for
// a prefetch, and no more often than the budget allows.

const { request, payload } = vi.hoisted(() => ({
  request: { headers: new Headers() },
  payload: { fake: 'payload' },
}))

vi.mock('server-only', () => ({}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: async () => payload }))
vi.mock('next/headers', () => ({ headers: async () => request.headers }))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/env', () => ({ env: vi.fn(() => ({})) }))
vi.mock('@/lib/monitoring/sentry', () => ({ reportError: vi.fn(async () => true) }))
vi.mock('@/lib/redirects/store', () => ({ recordMissingPage: vi.fn(async () => undefined) }))

/** Runs what the log handed to after(), as Next.js does once the response has gone. */
async function runAfter() {
  for (const [task] of vi.mocked(after).mock.calls) await (task as () => Promise<void>)()
}

beforeEach(() => {
  vi.mocked(after).mockClear()
  vi.mocked(recordMissingPage).mockReset()
  vi.mocked(reportError).mockClear()
  vi.mocked(env).mockReturnValue({} as ReturnType<typeof env>)
  request.headers = new Headers({ 'x-pathname': '/old-page', referer: 'https://fake.example/x?y' })
})

describe('logging a missing page', () => {
  it('writes the address and the referring host once the response has gone', async () => {
    await logMissingPage()
    expect(recordMissingPage).not.toHaveBeenCalled()
    await runAfter()
    expect(recordMissingPage).toHaveBeenCalledWith(payload, {
      path: '/old-page',
      referrerHost: 'fake.example',
    })
  })

  it('writes nothing on a preview, which shares production’s database', async () => {
    vi.mocked(env).mockReturnValue({ VERCEL_ENV: 'preview' } as ReturnType<typeof env>)
    await logMissingPage()
    expect(after).not.toHaveBeenCalled()
  })

  it('writes nothing for a prefetch, or an address it never keeps', async () => {
    request.headers = new Headers({ 'x-pathname': '/old-page', 'next-router-prefetch': '1' })
    await logMissingPage()
    request.headers = new Headers({ 'x-pathname': '/wp-login.php' })
    await logMissingPage()
    expect(after).not.toHaveBeenCalled()
  })

  it('reports a failed write, and never shows it: the visitor has their page', async () => {
    const failure = new Error('fake database fault')
    vi.mocked(recordMissingPage).mockRejectedValueOnce(failure)
    await logMissingPage()
    await expect(runAfter()).resolves.toBeUndefined()
    expect(reportError).toHaveBeenCalledWith(failure, { area: '404-log' })
  })

  it('stops writing past the budget of one server in a minute', async () => {
    // The budget is shared by the whole server, so earlier tests have spent a little of it.
    for (let visit = 0; visit < WRITES_PER_MINUTE + 5; visit += 1) await logMissingPage()
    expect(vi.mocked(after).mock.calls.length).toBeLessThan(WRITES_PER_MINUTE)
  })
})
