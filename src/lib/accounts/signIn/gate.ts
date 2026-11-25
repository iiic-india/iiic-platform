import type { ServerEnv } from '@/lib/env'

/**
 * Where sign-in may act (docs/20 §4.9; D-122). A Vercel deployment other than production shares
 * production's database, so it sends no code, starts no session and reads no account; and
 * without BETTER_AUTH_SECRET there is no Better Auth here at all. Both are known from the
 * environment alone, so an action answers `closed-here` before it reads its input or the
 * database. The `accountsEnabled` flag is read after this, from the settings.
 */
export type DeploymentGate = 'open' | 'preview' | 'no-secret'

export function deploymentGate(
  settings: Pick<ServerEnv, 'VERCEL_ENV' | 'BETTER_AUTH_SECRET'>,
): DeploymentGate {
  if (settings.VERCEL_ENV && settings.VERCEL_ENV !== 'production') return 'preview'
  if (!settings.BETTER_AUTH_SECRET) return 'no-secret'
  return 'open'
}
