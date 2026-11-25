import { getMigrations } from 'better-auth/db/migration'
import { getPayload } from 'payload'

import { postgresDatabase } from '../lib/accounts/auth/database'
import { customerAuthOptions } from '../lib/accounts/auth/options'
import { env } from '../lib/env'
import config from '../payload.config'

/**
 * `pnpm payload run src/scripts/print-customer-auth-sql.ts` (docs/20 §3.3): prints the SQL that
 * Better Auth itself would run for the platform's customer sign-in options, against the database
 * in DATABASE_URL, for the hand-written `r2a_customer_auth` migration (and for any later one an
 * upgrade or a new option needs). Run it against an empty local database; on a database that
 * already has the tables it prints only what is missing. It prints and changes nothing: the
 * platform never runs Better Auth's own `migrate`, and never calls `runMigrations()`.
 *
 * The secret plays no part in the tables; without BETTER_AUTH_SECRET a stand-in is used.
 */
const settings = env()
const payload = await getPayload({ config })
const options = customerAuthOptions({
  secret: settings.BETTER_AUTH_SECRET ?? 'print-only-stand-in-secret-never-used-000000',
  siteUrl: settings.siteUrl,
  trustedOrigins: settings.allowedOrigins,
  database: postgresDatabase(payload),
  log: (message) => console.error(message),
})
const plan = await getMigrations(options, { throwOnUnsafe: false })
if (plan.unsafeChanges.length) console.error(plan.unsafeChanges.join('\n'))
if (!plan.toBeCreated.length && !plan.toBeAdded.length && !plan.toBeAddedIndexes.length) {
  console.info('-- Better Auth finds nothing to create, add or index.')
} else {
  console.info(await plan.compileMigrations())
}
process.exit(0)
