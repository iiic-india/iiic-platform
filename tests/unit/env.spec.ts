import { describe, expect, it } from 'vitest'

import { parseEnv } from '@/lib/env'

const valid = {
  PAYLOAD_SECRET: 'a'.repeat(32),
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/iiic',
}

describe('parseEnv', () => {
  it('accepts the minimum a local run needs and fills the defaults', () => {
    const env = parseEnv(valid)
    expect(env.siteUrl).toBe('http://localhost:3000')
    expect(env.allowedOrigins).toEqual(['http://localhost:3000'])
    expect(env.PLATFORM_HOSTS).toBe('localhost:3000')
  })

  it('uses the configured site URL when there is one', () => {
    const env = parseEnv({
      ...valid,
      NEXT_PUBLIC_SITE_URL: 'https://iiic.example',
      VERCEL_URL: 'x.vercel.app',
    })
    expect(env.siteUrl).toBe('https://iiic.example')
    expect(env.allowedOrigins).toEqual(['https://iiic.example', 'https://x.vercel.app'])
  })

  it('uses the production alias, not the deployment URL, in production', () => {
    const env = parseEnv({
      ...valid,
      VERCEL_ENV: 'production',
      VERCEL_URL: 'iiic-platform-abc123.vercel.app',
      VERCEL_PROJECT_PRODUCTION_URL: 'iiic-platform.vercel.app',
    })
    expect(env.siteUrl).toBe('https://iiic-platform.vercel.app')
    expect(env.allowedOrigins).toContain('https://iiic-platform-abc123.vercel.app')
  })

  it('falls back to the preview deployment URL and allows its branch alias', () => {
    const env = parseEnv({
      ...valid,
      VERCEL_ENV: 'preview',
      VERCEL_URL: 'iiic-platform-abc123.vercel.app',
      VERCEL_BRANCH_URL: 'iiic-platform-git-m1.vercel.app',
    })
    expect(env.siteUrl).toBe('https://iiic-platform-abc123.vercel.app')
    expect(env.allowedOrigins).toEqual([
      'https://iiic-platform-abc123.vercel.app',
      'https://iiic-platform-git-m1.vercel.app',
    ])
  })

  it('rejects a short Payload secret', () => {
    expect(() => parseEnv({ ...valid, PAYLOAD_SECRET: 'short' })).toThrow(/PAYLOAD_SECRET/)
  })

  it('rejects a database URL that is not Postgres', () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: 'mongodb://localhost/iiic' })).toThrow(
      /DATABASE_URL/,
    )
  })

  it('treats the empty owner setup token from .env.example as unset', () => {
    expect(parseEnv({ ...valid, OWNER_SETUP_TOKEN: '' }).OWNER_SETUP_TOKEN).toBeUndefined()
    expect(() => parseEnv({ ...valid, OWNER_SETUP_TOKEN: 'short' })).toThrow(/OWNER_SETUP_TOKEN/)
  })

  it('accepts only an owner setup token that survives a link (base64url)', () => {
    const urlSafe = 'Ab-_0'.repeat(8)
    expect(parseEnv({ ...valid, OWNER_SETUP_TOKEN: urlSafe }).OWNER_SETUP_TOKEN).toBe(urlSafe)
    // "+" arrives as a space, "/", "=", "&", "#" and "%" break or change the link.
    for (const character of ['+', '/', '=', '&', '#', '%']) {
      expect(() =>
        parseEnv({ ...valid, OWNER_SETUP_TOKEN: `${'a'.repeat(32)}${character}` }),
      ).toThrow(/OWNER_SETUP_TOKEN/)
    }
  })

  it('rejects a site URL that is not a URL', () => {
    expect(() => parseEnv({ ...valid, NEXT_PUBLIC_SITE_URL: 'iiic' })).toThrow(
      /NEXT_PUBLIC_SITE_URL/,
    )
  })

  // Obviously fake values.
  const r2 = {
    R2_ACCOUNT_ID: 'test-only-account',
    R2_ACCESS_KEY_ID: 'test-only-key-id',
    R2_SECRET_ACCESS_KEY: 'test-only-secret',
    R2_PUBLIC_BASE_URL: 'https://media.example/some/path/',
  }

  it('takes the four R2 variables together or not at all, and the bucket origin for images', () => {
    expect(parseEnv(valid).mediaOrigin).toBeUndefined()
    expect(parseEnv({ ...valid, ...r2 }).mediaOrigin).toBe('https://media.example')
    for (const name of Object.keys(r2)) {
      expect(() => parseEnv({ ...valid, ...r2, [name]: undefined }), name).toThrow(/R2/)
    }
  })

  it('treats the empty lines from .env.example as unset', () => {
    const env = parseEnv({
      ...valid,
      SENTRY_DSN: '',
      NEXT_PUBLIC_SENTRY_DSN: '',
      RESEND_API_KEY: '',
      R2_ACCOUNT_ID: '',
      R2_ACCESS_KEY_ID: '',
      R2_SECRET_ACCESS_KEY: '',
      R2_PUBLIC_BASE_URL: '',
    })
    expect(env.sentryDsn).toBeUndefined()
    expect(env.RESEND_API_KEY).toBeUndefined()
    expect(env.mediaOrigin).toBeUndefined()
  })

  it("reads Sentry's DSN from SENTRY_DSN, else from the integration's NEXT_PUBLIC_SENTRY_DSN", () => {
    const dsn = 'https://publickey@o0.ingest.example.invalid/1'
    expect(parseEnv({ ...valid, NEXT_PUBLIC_SENTRY_DSN: dsn }).sentryDsn).toBe(dsn)
    expect(
      parseEnv({
        ...valid,
        SENTRY_DSN: dsn,
        NEXT_PUBLIC_SENTRY_DSN: 'https://other@o0.ingest.example.invalid/2',
      }).sentryDsn,
    ).toBe(dsn)
  })
})
