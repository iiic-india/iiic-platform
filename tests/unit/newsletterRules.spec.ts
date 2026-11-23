import { describe, expect, it } from 'vitest'

import {
  isOneClick,
  linkLive,
  NEWSLETTER_PATHS,
  SignedLinkToken,
  SignupInput,
  signupAction,
} from '@/lib/newsletter/rules'
import {
  CONFIRM_DAYS,
  confirmationKey,
  confirmationToken,
  confirmationVariant,
  confirmExpiry,
  hashToken,
  isToken,
  tokenMatches,
} from '@/lib/newsletter/tokens'

// The newsletter's double opt-in (docs/19 §8; D-10): the link's token, what the entry keeps, and
// what a signup does to the list. Fake secrets and addresses only.
const SECRET = 'unit-test-secret-not-used-anywhere-else-000000000000'
const NOW = new Date('2026-12-01T04:30:00.123Z')
const DAY = 86_400_000

describe('the confirmation token', () => {
  const key = confirmationKey(SECRET)
  const expiresAt = confirmExpiry(NOW)

  it('expires 7 days on, to the second', () => {
    expect(expiresAt.getTime() - NOW.getTime()).toBeGreaterThan(CONFIRM_DAYS * DAY - 1000)
    expect(expiresAt.getUTCMilliseconds()).toBe(0)
  })

  it('is the same for the same entry and expiry, so a retried email shows the same link', () => {
    expect(confirmationToken(key, 7, expiresAt)).toBe(confirmationToken(key, 7, expiresAt))
    expect(isToken(confirmationToken(key, 7, expiresAt))).toBe(true)
  })

  it('changes with the entry, the expiry and the secret', () => {
    const token = confirmationToken(key, 7, expiresAt)
    expect(confirmationToken(key, 8, expiresAt)).not.toBe(token)
    expect(confirmationToken(key, 7, new Date(expiresAt.getTime() + 1000))).not.toBe(token)
    expect(confirmationToken(confirmationKey(`${SECRET}x`), 7, expiresAt)).not.toBe(token)
  })

  it('is kept only as its hash, which matches it and nothing else', () => {
    const token = confirmationToken(key, 7, expiresAt)
    const stored = hashToken(token)
    expect(stored).toMatch(/^[0-9a-f]{64}$/)
    expect(stored).not.toContain(token)
    expect(tokenMatches(token, stored)).toBe(true)
    expect(tokenMatches(confirmationToken(key, 8, expiresAt), stored)).toBe(false)
    expect(tokenMatches(token, null)).toBe(false)
  })

  it('refuses what cannot be a token before any lookup', () => {
    expect(isToken('short')).toBe(false)
    expect(isToken('a'.repeat(42) + '!')).toBe(false)
    expect(isToken(undefined)).toBe(false)
  })

  it('gives each confirmation round a message variant of its own', () => {
    const later = confirmExpiry(new Date(NOW.getTime() + DAY))
    expect(confirmationVariant(expiresAt)).not.toBe(confirmationVariant(later))
    expect(confirmationVariant(expiresAt).length).toBeLessThanOrEqual(40)
  })
})

describe('what a signup does', () => {
  const issued = (msAgo: number) =>
    new Date(NOW.getTime() - msAgo + CONFIRM_DAYS * DAY).toISOString()

  it('creates a pending entry for a new address', () => {
    expect(signupAction(null, NOW, CONFIRM_DAYS)).toBe('create')
  })

  it('does nothing for a confirmed address', () => {
    expect(signupAction({ status: 'confirmed' }, NOW, CONFIRM_DAYS)).toBe('none')
  })

  it('sends no second email within two minutes', () => {
    expect(
      signupAction({ status: 'pending', confirmExpiresAt: issued(30_000) }, NOW, CONFIRM_DAYS),
    ).toBe('none')
  })

  it('renews a pending link later, and an unsubscribed address that signs up again', () => {
    expect(
      signupAction({ status: 'pending', confirmExpiresAt: issued(10 * 60_000) }, NOW, CONFIRM_DAYS),
    ).toBe('renew')
    expect(signupAction({ status: 'unsubscribed' }, NOW, CONFIRM_DAYS)).toBe('renew')
  })

  it('knows a live link from an expired one', () => {
    expect(linkLive(new Date(NOW.getTime() + 1000).toISOString(), NOW)).toBe(true)
    expect(linkLive(new Date(NOW.getTime() - 1000).toISOString(), NOW)).toBe(false)
    expect(linkLive(null, NOW)).toBe(false)
  })
})

describe('the signup form', () => {
  it('takes an address, trimmed and in lower case', () => {
    const parsed = SignupInput.parse({ email: '  Fake.Reader@Example.Invalid ' })
    expect(parsed.email).toBe('fake.reader@example.invalid')
  })

  it('refuses what is not an address', () => {
    expect(SignupInput.safeParse({ email: 'not an address' }).success).toBe(false)
  })

  it('keeps a source only when it is a path on this site', () => {
    expect(SignupInput.parse({ email: 'a@example.invalid', source: '/journal' }).source).toBe(
      '/journal',
    )
    expect(
      SignupInput.parse({ email: 'a@example.invalid', source: 'https://elsewhere.invalid' }).source,
    ).toBeUndefined()
  })

  it('puts the one-click token in the query, encoded', () => {
    expect(NEWSLETTER_PATHS.oneClick('a.b-c')).toBe('/api/newsletter/unsubscribe?token=a.b-c')
    expect(NEWSLETTER_PATHS.confirm('abc')).toBe('/newsletter/confirm/abc')
  })
})

describe('the unsubscribe links (RFC 8058)', () => {
  it('tells the mail client’s one-click POST from the page’s form', () => {
    expect(isOneClick({ 'List-Unsubscribe': 'One-Click' })).toBe(true)
    expect(isOneClick({ token: 'fake' })).toBe(false)
    expect(isOneClick(null)).toBe(false)
  })

  it('accepts a signed link’s shape and nothing else, before it is verified', () => {
    expect(
      SignedLinkToken.safeParse('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjF9.c2lnbmF0dXJl').success,
    ).toBe(true)
    expect(SignedLinkToken.safeParse('short').success).toBe(false)
    expect(SignedLinkToken.safeParse('has spaces in it, not a token').success).toBe(false)
    expect(SignedLinkToken.safeParse('a'.repeat(3000)).success).toBe(false)
  })
})
