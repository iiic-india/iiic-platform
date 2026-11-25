import { PostgresDialect, type PostgresPool } from 'kysely'
import type { Payload } from 'payload'

import type { ServerEnv } from '@/lib/env'

import { CUSTOMER_AUTH } from '../contract'
import { customerAuthOptions, type CustomerAuthOptions } from './options'

/**
 * Better Auth on Postgres (docs/20 §3.2, §3.4): Payload's own pool (`max` 4 with one held for
 * the adapter, docs/12 §4), so a function opens no second pool, and Better Auth's own schema,
 * `customer_auth`, which Payload's migrations never see. Free of `server-only`: the script that
 * prints the schema's SQL (src/scripts/print-customer-auth-sql.ts) runs under the Payload CLI.
 */
export function postgresDatabase(payload: Payload) {
  const pool = (payload.db as unknown as { pool: PostgresPool }).pool
  return {
    dialect: new PostgresDialect({ pool }),
    type: 'postgres' as const,
    schemaName: CUSTOMER_AUTH.schema,
  }
}

/** The options for this deployment, on the database given; null without the secret. */
export function deploymentOptions(
  settings: Pick<
    ServerEnv,
    'BETTER_AUTH_SECRET' | 'ACCOUNTS_TEST_CODE' | 'siteUrl' | 'allowedOrigins'
  >,
  database: CustomerAuthOptions['database'],
  log: (message: string) => void,
): CustomerAuthOptions | null {
  if (!settings.BETTER_AUTH_SECRET) return null
  return customerAuthOptions({
    secret: settings.BETTER_AUTH_SECRET,
    siteUrl: settings.siteUrl,
    trustedOrigins: settings.allowedOrigins,
    database,
    ...(settings.ACCOUNTS_TEST_CODE ? { testCode: settings.ACCOUNTS_TEST_CODE } : {}),
    log,
  })
}
