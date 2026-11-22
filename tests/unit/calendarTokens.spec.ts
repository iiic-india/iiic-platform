// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  CHANNEL_TOKEN_BYTES,
  FEED_TOKEN_BYTES,
  FeedToken,
  hashToken,
  newToken,
  tokenMatchesHash,
} from '@/lib/calendar/tokens'

// The feed's and the watch channel's tokens (docs/16 §7): random, shown once, kept as a hash.

describe('calendar tokens', () => {
  it('makes a feed token of 128 random bits that the feed address accepts', () => {
    const one = newToken(FEED_TOKEN_BYTES)
    const two = newToken(FEED_TOKEN_BYTES)
    expect(one).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(one).not.toBe(two)
    expect(FeedToken.safeParse(one).success).toBe(true)
  })

  it('makes a channel token Google accepts (at most 256 characters)', () => {
    const token = newToken(CHANNEL_TOKEN_BYTES)
    expect(token.length).toBeLessThanOrEqual(256)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('keeps only a hash, and matches the token to it', () => {
    const token = newToken(FEED_TOKEN_BYTES)
    const hash = hashToken(token)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(token)
    expect(tokenMatchesHash(token, hash)).toBe(true)
  })

  it('refuses another token, a revoked one and a malformed hash', () => {
    const hash = hashToken(newToken(FEED_TOKEN_BYTES))
    expect(tokenMatchesHash(newToken(FEED_TOKEN_BYTES), hash)).toBe(false)
    expect(tokenMatchesHash('anything', null)).toBe(false)
    expect(tokenMatchesHash('anything', undefined)).toBe(false)
    expect(tokenMatchesHash('', hash)).toBe(false)
    expect(tokenMatchesHash('anything', 'not-a-hash')).toBe(false)
  })

  it('accepts only the feed token’s own shape in the address', () => {
    for (const bad of [
      '',
      'short',
      `${'a'.repeat(22)}=`,
      'a'.repeat(23),
      '../../etc/passwd!!!!!!',
    ]) {
      expect(FeedToken.safeParse(bad).success, bad).toBe(false)
    }
  })
})
