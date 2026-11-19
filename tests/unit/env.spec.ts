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

  it('rejects a site URL that is not a URL', () => {
    expect(() => parseEnv({ ...valid, NEXT_PUBLIC_SITE_URL: 'iiic' })).toThrow(
      /NEXT_PUBLIC_SITE_URL/,
    )
  })
})
