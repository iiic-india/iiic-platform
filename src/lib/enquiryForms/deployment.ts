import type { ServerEnv } from '@/lib/env'

/**
 * Whether this deployment may store what a public form receives (docs/17 §6): locally, in CI and
 * on production, and on no other Vercel deployment. A preview shares production's database
 * (docs/16 §10), so a request sent from one would put a person, a consent, a lead and a task for
 * the office on production's board. The forms refuse there, as M3 keeps payments, the calendar
 * and Zoho to production (src/lib/payments/gatewayFor.ts) and the 404 log and the search counts
 * skip a preview. Lift this only once previews have their own database.
 */
export function formsStoreHere(config: Pick<ServerEnv, 'VERCEL_ENV'>): boolean {
  return !config.VERCEL_ENV || config.VERCEL_ENV === 'production'
}
