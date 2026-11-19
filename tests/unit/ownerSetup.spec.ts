import { describe, expect, it } from 'vitest'

import { mayCreateFirstOwner, OWNER_SETUP_COOKIE, readCookie, tokenMatches } from '@/lib/ownerSetup'

// Obviously fake test values.
const TOKEN = 'test-only-owner-setup-token-0000000000'
const cookie = (value: string) => `other=1; ${OWNER_SETUP_COOKIE}=${encodeURIComponent(value)}`

describe('tokenMatches', () => {
  it('accepts only the exact token', () => {
    expect(tokenMatches(TOKEN, TOKEN)).toBe(true)
    expect(tokenMatches(TOKEN, `${TOKEN}x`)).toBe(false)
    expect(tokenMatches(TOKEN, TOKEN.slice(1))).toBe(false)
  })

  it('refuses when either side is missing or empty', () => {
    expect(tokenMatches(undefined, TOKEN)).toBe(false)
    expect(tokenMatches(TOKEN, undefined)).toBe(false)
    expect(tokenMatches('', '')).toBe(false)
  })
})

describe('readCookie', () => {
  it('finds a cookie among others and decodes it', () => {
    expect(readCookie('a=1; b=x%2By; c=3', 'b')).toBe('x+y')
    expect(readCookie('a=1', 'b')).toBeUndefined()
    expect(readCookie(null, 'b')).toBeUndefined()
  })

  it('does not match on a name that only ends with the cookie name', () => {
    expect(readCookie(`x-${OWNER_SETUP_COOKIE}=${TOKEN}`, OWNER_SETUP_COOKIE)).toBeUndefined()
  })
})

describe('mayCreateFirstOwner', () => {
  const production = {
    api: 'REST',
    vercelEnv: 'production',
    nodeEnv: 'production',
    expectedToken: TOKEN,
  }

  it('needs the setup cookie on production', () => {
    expect(mayCreateFirstOwner({ ...production, cookieHeader: cookie(TOKEN) })).toBe(true)
    expect(mayCreateFirstOwner({ ...production, cookieHeader: cookie('guess') })).toBe(false)
    expect(mayCreateFirstOwner({ ...production, cookieHeader: null })).toBe(false)
  })

  it('needs it on production even for a request marked as server code', () => {
    expect(mayCreateFirstOwner({ ...production, api: 'local', cookieHeader: null })).toBe(false)
  })

  it('stays closed on production when no token is configured', () => {
    expect(
      mayCreateFirstOwner({ ...production, expectedToken: undefined, cookieHeader: cookie(TOKEN) }),
    ).toBe(false)
  })

  it('stays closed on a production server outside Vercel, except for its own code', () => {
    const elsewhere = { ...production, vercelEnv: undefined, cookieHeader: null }
    expect(mayCreateFirstOwner(elsewhere)).toBe(false)
    expect(mayCreateFirstOwner({ ...elsewhere, cookieHeader: cookie(TOKEN) })).toBe(true)
    expect(mayCreateFirstOwner({ ...elsewhere, api: 'local' })).toBe(true)
  })

  it('leaves previews and local development as they are', () => {
    const open = { api: 'REST', expectedToken: undefined, cookieHeader: null }
    expect(mayCreateFirstOwner({ ...open, vercelEnv: 'preview', nodeEnv: 'production' })).toBe(true)
    expect(mayCreateFirstOwner({ ...open, vercelEnv: undefined, nodeEnv: 'development' })).toBe(
      true,
    )
  })
})
