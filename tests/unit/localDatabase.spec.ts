// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { assertLocalDatabase } from '../helpers/localDatabase'

describe('assertLocalDatabase', () => {
  it('allows a database on this machine or in CI', () => {
    for (const url of [
      'postgres://postgres:postgres@localhost:5432/iiic',
      'postgresql://u:p@127.0.0.1/iiic',
      'postgres://u:p@[::1]:5432/iiic',
    ]) {
      expect(() => assertLocalDatabase(url), url).not.toThrow()
    }
  })

  it('refuses any other database, without printing its URL', () => {
    for (const url of [
      'postgres://postgres.fake:secret-password@aws-0-ap-south-1.pooler.supabase.com:6543/postgres',
      'postgres://u:p@localhost.example.com/iiic',
      'not a url',
      undefined,
    ]) {
      expect(() => assertLocalDatabase(url), String(url)).toThrow(/only against a local database/)
      try {
        assertLocalDatabase(url)
      } catch (error) {
        expect(String(error)).not.toContain('secret-password')
      }
    }
  })
})
