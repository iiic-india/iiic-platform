import { describe, expect, it } from 'vitest'

import { parseEnv } from '@/lib/env'

const valid = {
  PAYLOAD_SECRET: 'a'.repeat(32),
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/iiic',
}

describe('parseEnv', () => {
  it('accepts the minimum a local run needs and fills the defaults', () => {
    const env = parseEnv(valid)
    expect(env.NEXT_PUBLIC_SITE_URL).toBe('http://localhost:3000')
    expect(env.PLATFORM_HOSTS).toBe('localhost:3000')
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
