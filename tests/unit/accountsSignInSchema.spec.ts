// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { getMigrations } from 'better-auth/db/migration'
import { PostgresDialect } from 'kysely'
import { describe, expect, it } from 'vitest'

import { customerAuthOptions } from '@/lib/accounts/auth/options'
import { CUSTOMER_AUTH } from '@/lib/accounts/contract'

// Better Auth's tables come in a hand-written migration whose SQL is Better Auth's own (docs/20
// §3.3). Until the integrator places it after `r2a_accounts`, it is staged in
// src/lib/accounts/auth; this holds the staged SQL to what Better Auth 1.7.27 prints for the
// platform's options on an empty database (the print script's output), statement for statement.
// Once the migration is placed, tests/int/accountsAuthSchema.int.spec.ts is the lasting guard:
// after `pnpm migrate`, Better Auth finds nothing to create, add or index.

const STAGED = path.resolve('src/lib/accounts/auth/r2a_customer_auth.migration.ts')

/** A pool whose database is empty: every introspection query answers with no rows. */
function emptyPool() {
  const client = {
    query: async () => ({ rows: [], command: 'SELECT', rowCount: 0 }),
    release: () => {},
  }
  return { connect: async () => client, end: async () => {} }
}

async function betterAuthSql(): Promise<string> {
  const options = customerAuthOptions({
    secret: 'unit-only-better-auth-secret-0000000000000000',
    siteUrl: 'http://localhost:3000',
    trustedOrigins: ['http://localhost:3000'],
    database: {
      dialect: new PostgresDialect({ pool: emptyPool() as never }),
      type: 'postgres',
      schemaName: CUSTOMER_AUTH.schema,
    },
    log: () => {},
  })
  return (await getMigrations(options, { throwOnUnsafe: false })).compileMigrations()
}

const statements = (text: string) =>
  text
    .split(';')
    .map((statement) => statement.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

describe('the r2a_customer_auth migration (staged)', () => {
  const source = readFileSync(STAGED, 'utf8')
  const up = source.slice(source.indexOf('create schema'), source.indexOf('REVOKE ALL'))

  it('is Better Auth’s own SQL for the platform’s options, statement for statement', async () => {
    expect(statements(up)).toEqual(statements(await betterAuthSql()))
  })

  it('makes the four tables in customer_auth, never in Supabase’s auth schema', async () => {
    for (const table of Object.values(CUSTOMER_AUTH.tables)) {
      expect(up).toContain(`create table "customer_auth"."${table}"`)
    }
    expect(up).not.toMatch(/"auth"\./)
    // Keys, unique columns and indexes as docs/20 §3.3 lists them.
    expect(up).toContain('"email" text not null unique')
    expect(up).toContain('"phoneNumber" text unique')
    expect(up).toContain('"token" text not null unique')
    expect(up).toMatch(
      /"userId" text not null references "customer_auth"\."users" \("id"\) on delete cascade/,
    )
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
})
