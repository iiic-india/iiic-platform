import type { ServerEnv } from '@/lib/env'
import { err, ok, type Result } from '@/lib/result'

import type { ZohoError } from './books'

/**
 * Whether the platform may reach Zoho Books, from the settings src/lib/env.ts validated (D-13):
 * the organisation, the OAuth client and its refresh token, all four or none. Without them
 * invoices wait in `pending` (docs/16 §10) and nothing else changes.
 *
 * Previews share production's database (docs/16 §10), so only Vercel's production deployment
 * issues real tax documents; local development and CI use the fake (tests pass their own).
 */

export type ZohoConfig = {
  organizationId: string
  clientId: string
  clientSecret: string
  refreshToken: string
  /** The Books API, India data centre by default: https://www.zohoapis.in/books/v3. */
  apiBase: string
  /** Where tokens are refreshed, in the same data centre: https://accounts.zoho.in. */
  accountsBase: string
}

type ZohoEnv = Pick<
  ServerEnv,
  | 'ZOHO_BOOKS_ORGANIZATION_ID'
  | 'ZOHO_CLIENT_ID'
  | 'ZOHO_CLIENT_SECRET'
  | 'ZOHO_REFRESH_TOKEN'
  | 'ZOHO_API_BASE'
  | 'VERCEL_ENV'
>

/** Zoho's accounts server for the API's data centre: zohoapis.in → accounts.zoho.in. */
export function accountsBaseFor(apiBase: string): string {
  const host = new URL(apiBase).hostname
  const centre = /(?:^|\.)zohoapis\.([a-z.]+)$/.exec(host)?.[1] ?? 'in'
  return `https://accounts.zoho.${centre}`
}

export function zohoConfig(
  env: ZohoEnv,
): Result<ZohoConfig, Extract<ZohoError, { code: 'not-configured' }>> {
  const organizationId = env.ZOHO_BOOKS_ORGANIZATION_ID
  const clientId = env.ZOHO_CLIENT_ID
  const clientSecret = env.ZOHO_CLIENT_SECRET
  const refreshToken = env.ZOHO_REFRESH_TOKEN
  if (!organizationId || !clientId || !clientSecret || !refreshToken) {
    return err({ code: 'not-configured', reason: 'missing' })
  }
  if (env.VERCEL_ENV && env.VERCEL_ENV !== 'production') {
    return err({ code: 'not-configured', reason: 'not-production' })
  }
  const apiBase = env.ZOHO_API_BASE.replace(/\/+$/, '')
  return ok({
    organizationId,
    clientId,
    clientSecret,
    refreshToken,
    apiBase,
    accountsBase: accountsBaseFor(apiBase),
  })
}
