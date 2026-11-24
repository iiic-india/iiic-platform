/**
 * Whether this deployment may act on the shared database for the messaging core's outside
 * callers (docs/19 §2, §4): locally and in CI (no VERCEL_ENV), and on production; on no other
 * Vercel deployment. Previews share production's database (docs/16 §10), so a webhook or a cron
 * call reaching one would move production's messages, suppress its addresses, record withdrawals
 * or send its queue. The cron route (`refuseCron`), the provider webhooks and the newsletter's
 * signup refuse there, as M3's `gatewayFor` keeps payments to production and M4's forms store
 * nothing on a preview (`formsStoreHere`). Lift this only once previews have their own database.
 * Pure, free of `server-only`.
 */
export function actsHere(vercelEnv: string | undefined): boolean {
  return !vercelEnv || vercelEnv === 'production'
}
