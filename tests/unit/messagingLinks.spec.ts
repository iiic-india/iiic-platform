// @vitest-environment node
import { SignJWT } from 'jose'
import { describe, expect, it, vi } from 'vitest'

import { linkUrls, signLink, verifyLink } from '@/lib/messaging/links'

vi.mock('server-only', () => ({}))

// The signed links in messages (docs/19 §7, §8): a token opens its own purpose only, for the
// record it names, until it expires; a forged or altered token opens nothing.

describe('signed message links', () => {
  it('round-trips the purpose and the record', async () => {
    const token = await signLink({ purpose: 'withdraw', subjectId: 42, expiresInDays: 30 })
    expect(await verifyLink('withdraw', token)).toEqual({ ok: true, value: { subjectId: 42 } })
  })

  it('never opens another purpose', async () => {
    const token = await signLink({ purpose: 'withdraw', subjectId: 42, expiresInDays: 30 })
    expect(await verifyLink('unsubscribe', token)).toEqual({
      ok: false,
      error: { code: 'invalid' },
    })
  })

  it('refuses an altered, a foreign and a malformed token', async () => {
    const token = await signLink({ purpose: 'unsubscribe', subjectId: 7, expiresInDays: 30 })
    const [head, body, signature] = token.split('.') as [string, string, string]
    const flipped = `${head}.${body}.${signature.slice(0, -2)}${signature.endsWith('A') ? 'BB' : 'AA'}`
    expect((await verifyLink('unsubscribe', flipped)).ok).toBe(false)
    const foreign = await new SignJWT({ p: 'unsubscribe', s: 7 })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1d')
      .sign(new TextEncoder().encode('a-different-fake-key-for-this-test-only-000'))
    expect(await verifyLink('unsubscribe', foreign)).toEqual({
      ok: false,
      error: { code: 'invalid' },
    })
    expect(await verifyLink('unsubscribe', 'not-a-token')).toEqual({
      ok: false,
      error: { code: 'invalid' },
    })
  })

  it('says when a token has expired', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      const token = await signLink({ purpose: 'withdraw', subjectId: 3, expiresInDays: 1 })
      vi.setSystemTime(new Date('2026-01-03T00:00:00Z'))
      expect(await verifyLink('withdraw', token)).toEqual({ ok: false, error: { code: 'expired' } })
    } finally {
      vi.useRealTimers()
    }
  })

  it('builds the pages and the one-click endpoint on the site', () => {
    expect(linkUrls('https://example.test/', 'a.b.c')).toEqual({
      withdraw: 'https://example.test/w/a.b.c',
      unsubscribe: 'https://example.test/newsletter/unsubscribe/a.b.c',
      oneClick: 'https://example.test/api/newsletter/unsubscribe?token=a.b.c',
    })
  })
})
