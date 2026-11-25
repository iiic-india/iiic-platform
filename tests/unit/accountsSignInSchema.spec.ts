// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { CUSTOMER_AUTH } from '@/lib/accounts/contract'

// Better Auth's tables come in a hand-written migration, `r2a_customer_auth`, placed right after
// the generated `r2a_accounts` and holding Better Auth's own SQL (docs/20 §3.3). The file is never
// edited, so this test holds only its shape: the four tables in customer_auth, their keys and
// indexes, the grants and the way down. Whether the SQL is still what Better Auth needs is the
// integration test's job (tests/int/accountsAuthSchema.int.spec.ts): after `pnpm migrate`, Better
// Auth asked with the platform's own options finds nothing to create, add or index. Comparing the
// placed file with Better Auth's printed SQL here would fail for good after an upgrade or an option
// change, even once a correct follow-up migration exists (the join's ruling 12).

const MIGRATIONS = path.resolve('src/migrations')

function placedMigration(): string {
  const file = readdirSync(MIGRATIONS).find((name) => name.endsWith('_r2a_customer_auth.ts'))
  if (!file) throw new Error('src/migrations holds no *_r2a_customer_auth.ts')
  return readFileSync(path.join(MIGRATIONS, file), 'utf8')
}

describe('the r2a_customer_auth migration', () => {
  const source = placedMigration()
  const up = source.slice(source.indexOf('create schema'), source.indexOf('REVOKE ALL'))

  it('comes right after r2a_accounts, as the migrations list runs them', () => {
    const index = readFileSync(path.join(MIGRATIONS, 'index.ts'), 'utf8')
    const names = [...index.matchAll(/name: '([^']+)'/g)].map((match) => match[1] ?? '')
    const at = names.findIndex((name) => name.endsWith('_r2a_customer_auth'))
    expect(at).toBeGreaterThan(0)
    expect(names[at - 1]).toMatch(/_r2a_accounts$/)
  })

  it('makes the four tables in customer_auth, never in Supabase’s auth schema', () => {
    expect(up).toContain('create schema if not exists "customer_auth"')
    for (const table of Object.values(CUSTOMER_AUTH.tables)) {
      expect(up).toContain(`create table "customer_auth"."${table}"`)
    }
    expect(up.match(/create table /g)).toHaveLength(Object.values(CUSTOMER_AUTH.tables).length)
    expect(up).not.toMatch(/"auth"\./)
    expect(up).not.toMatch(/"public"\./)
    // Keys, unique columns and indexes as docs/20 §3.3 lists them.
    expect(up).toContain('"email" text not null unique')
    expect(up).toContain('"phoneNumber" text unique')
    expect(up).toContain('"token" text not null unique')
    expect(up).toMatch(
      /"userId" text not null references "customer_auth"\."users" \("id"\) on delete cascade/,
    )
    expect(up).toContain('create index "sessions_userId_idx"')
    expect(up).toContain('create index "identities_userId_idx"')
    expect(up).toContain('create index "verifications_identifier_idx"')
  })

  it('closes the schema to PUBLIC and opens it to the app’s own role when it exists (D-43)', () => {
    expect(source).toContain('REVOKE ALL ON SCHEMA "customer_auth" FROM PUBLIC')
    expect(source).toContain("IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'iiic_app')")
    expect(source).toContain('GRANT USAGE ON SCHEMA "customer_auth" TO "iiic_app"')
    expect(source).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "customer_auth" TO "iiic_app"',
    )
  })

  it('drops the schema on the way down', () => {
    expect(source.slice(source.indexOf('export async function down'))).toContain(
      'DROP SCHEMA IF EXISTS "customer_auth" CASCADE',
    )
  })

  it('is printed by the script from the same options the running instance uses', () => {
    const script = readFileSync(path.resolve('src/scripts/print-customer-auth-sql.ts'), 'utf8')
    expect(script).toContain('customerAuthOptions')
    expect(script).toContain('compileMigrations')
    expect(script).not.toMatch(/\.runMigrations\(/)
  })

  it('is no longer staged beside the auth code, so there is one copy of the SQL', () => {
    expect(existsSync(path.resolve('src/lib/accounts/auth/r2a_customer_auth.migration.ts'))).toBe(
      false,
    )
  })
})
