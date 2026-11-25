import 'server-only'

import { betterAuth } from 'better-auth'
import { getPayload, type Payload } from 'payload'

import { env, type ServerEnv } from '@/lib/env'
import config from '@payload-config'

import { deploymentOptions, postgresDatabase } from './database'
import type { CustomerAuthOptions } from './options'

/**
 * Customer sign-in's Better Auth instance (docs/20 §3.4), built once per server after
 * `getPayload()`: it talks to Postgres through Payload's own pool (no second pool per function),
 * keeps its four tables in the `customer_auth` schema, and is reached only from the platform's
 * server actions and server components through `auth.api.*`. Its HTTP handler is never mounted
 * (no `/api/auth/*`), and no client SDK reaches a bundle. On its first call Better Auth checks
 * that its tables are as its options expect, and refuses to run if they are not.
 *
 * Null while BETTER_AUTH_SECRET is unset: then sign-in is closed here (docs/20 §4.9).
 */

export type CustomerAuth = ReturnType<typeof betterAuth<CustomerAuthOptions>>

let cached: { secret: string; auth: CustomerAuth } | undefined

/** The instance for this Payload and this environment; null without the secret. */
export function customerAuthFor(
  payload: Payload,
  settings: ServerEnv = env(),
): CustomerAuth | null {
  const secret = settings.BETTER_AUTH_SECRET
  if (!secret) return null
  if (cached?.secret === secret) return cached.auth
  const options = deploymentOptions(settings, postgresDatabase(payload), (message) =>
    payload.logger.error({ msg: message }),
  )
  if (!options) return null
  const auth = betterAuth(options)
  cached = { secret, auth }
  return auth
}

/** The instance, after Payload is ready; null without the secret. */
export async function getAuth(): Promise<CustomerAuth | null> {
  if (!env().BETTER_AUTH_SECRET) return null
  return customerAuthFor(await getPayload({ config }))
}
