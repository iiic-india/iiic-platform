import { sql } from '@payloadcms/db-postgres'
import { getMigrations } from 'better-auth/db/migration'
import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { postgresDatabase } from '@/lib/accounts/auth/database'
import { customerAuthOptions } from '@/lib/accounts/auth/options'
import { CUSTOMER_AUTH } from '@/lib/accounts/contract'
import config from '@/payload.config'

// Better Auth's tables are made by a hand-written migration, `r2a_customer_auth`, holding Better
// Auth's own SQL (docs/20 §3.3). After `pnpm migrate`, Better Auth asked with the platform's own
// options finds nothing to create, add or index: an upgrade or an option that needs another
// column fails here until a new migration adds it. Reads only; writes nothing.

let payload: Payload

beforeAll(async () => {
  payload = await getPayload({ config })
})

async function rows<T>(query: ReturnType<typeof sql>): Promise<T[]> {
  const result = await payload.db.drizzle.execute(query)
  return (result as unknown as { rows: T[] }).rows
}

describe('the customer_auth schema', () => {
  it('holds every table, column and index Better Auth 1.7.27 needs, after the migrations', async () => {
    const options = customerAuthOptions({
      secret: 'test-only-better-auth-secret-0000000000000000',
      siteUrl: 'http://localhost:3000',
      trustedOrigins: ['http://localhost:3000'],
      database: postgresDatabase(payload),
      log: () => {},
    })
    const plan = await getMigrations(options, { throwOnUnsafe: false })
    expect(plan.toBeCreated.map((table) => table.table)).toEqual([])
    expect(plan.toBeAdded.map((table) => table.table)).toEqual([])
    expect(plan.toBeAddedIndexes.map((index) => index.name)).toEqual([])
    expect(plan.unsafeChanges).toEqual([])
  })

  it('is its own schema, with the four tables, and not Supabase’s auth schema', async () => {
    const tables = await rows<{ table_name: string }>(
      sql`SELECT table_name FROM information_schema.tables WHERE table_schema = ${CUSTOMER_AUTH.schema} ORDER BY table_name`,
    )
    expect(tables.map((row) => row.table_name)).toEqual(
      [...Object.values(CUSTOMER_AUTH.tables)].sort(),
    )
  })

  it('is closed to PUBLIC, and open to the app’s own role when it exists (D-43)', async () => {
    const [schema] = await rows<{ acl: string | null }>(
      sql`SELECT nspacl::text AS acl FROM pg_namespace WHERE nspname = ${CUSTOMER_AUTH.schema}`,
    )
    // A PUBLIC entry in an ACL starts with "=" (no role name before it).
    expect(schema?.acl ?? '').not.toMatch(/(^|[{,])=/)
    const [role] = await rows<{ exists: boolean }>(
      sql`SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'iiic_app') AS exists`,
    )
    if (role?.exists) {
      const [usage] = await rows<{ usage: boolean }>(
        sql`SELECT has_schema_privilege('iiic_app', ${CUSTOMER_AUTH.schema}, 'USAGE') AS usage`,
      )
      expect(usage?.usage).toBe(true)
    }
  })
})
