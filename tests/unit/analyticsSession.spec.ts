// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { clientAddress, dayKey, sessionHash } from '@/lib/analytics/session'

// The pseudonymous session code of an analytics event (docs/04 `analytics_events`; docs/12 §7,
// §10): the same for one browser at one address through one day in India, another the next day
// or under another secret, and never the address or the browser itself. Fake addresses from the
// documentation ranges (RFC 5737, RFC 3849) and a fake secret.
const SECRET = 'fake-secret-for-tests-only-0000000000000000'
const VISIT = {
  secret: SECRET,
  address: '203.0.113.7',
  userAgent: 'Mozilla/5.0 (fake browser)',
}
const at = (iso: string) => new Date(iso)

describe('the session code', () => {
  it('is 32 hexadecimal characters that hold neither the address nor the browser', () => {
    const code = sessionHash({ ...VISIT, now: at('2026-12-01T06:00:00Z') })
    expect(code).toMatch(/^[0-9a-f]{32}$/)
    expect(code).not.toContain('203')
    expect(code).not.toContain('Mozilla')
  })

  it('is the same for one browser at one address all day in India', () => {
    // 00:00 and 23:59 in India on 1 December 2026.
    const morning = sessionHash({ ...VISIT, now: at('2026-11-30T18:30:00Z') })
    const night = sessionHash({ ...VISIT, now: at('2026-12-01T18:29:59Z') })
    expect(night).toBe(morning)
  })

  it('changes at midnight in India, so one day’s codes say nothing about the next', () => {
    const before = sessionHash({ ...VISIT, now: at('2026-12-01T18:29:59Z') })
    const after = sessionHash({ ...VISIT, now: at('2026-12-01T18:30:00Z') })
    expect(after).not.toBe(before)
  })

  it('differs for another address, another browser or another secret', () => {
    const now = at('2026-12-01T06:00:00Z')
    const code = sessionHash({ ...VISIT, now })
    expect(sessionHash({ ...VISIT, now, address: '198.51.100.7' })).not.toBe(code)
    expect(sessionHash({ ...VISIT, now, userAgent: 'Fake other browser' })).not.toBe(code)
    expect(sessionHash({ ...VISIT, now, secret: `${SECRET}-other` })).not.toBe(code)
  })

  it('keeps the address and the browser apart, so one cannot pass for the other', () => {
    const now = at('2026-12-01T06:00:00Z')
    expect(sessionHash({ ...VISIT, now, address: 'a', userAgent: 'b\nc' })).not.toBe(
      sessionHash({ ...VISIT, now, address: 'a\nb', userAgent: 'c' }),
    )
  })

  it('comes from a key of the day, derived from the secret and the date', () => {
    expect(dayKey(SECRET, '2026-12-01')).toHaveLength(32)
    expect(dayKey(SECRET, '2026-12-01').equals(dayKey(SECRET, '2026-12-01'))).toBe(true)
    expect(dayKey(SECRET, '2026-12-01').equals(dayKey(SECRET, '2026-12-02'))).toBe(false)
  })
})

describe('the client’s address', () => {
  it('is the first address Vercel forwards, else the real address, else nothing', () => {
    expect(
      clientAddress(
        new Headers({ 'x-forwarded-for': ' 203.0.113.7 , 10.0.0.1', 'x-real-ip': '1' }),
      ),
    ).toBe('203.0.113.7')
    expect(clientAddress(new Headers({ 'x-real-ip': '2001:db8::7' }))).toBe('2001:db8::7')
    expect(clientAddress(new Headers())).toBe('')
  })
})
