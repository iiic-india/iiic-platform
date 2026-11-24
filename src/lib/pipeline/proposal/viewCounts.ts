import type { ServerEnv } from '@/lib/env'

/**
 * Whether opening a proposal's PDF through its tracked link counts as the client's view
 * (docs/17 §5; M7). It does not when someone on IIIC's staff is signed in, checking what was
 * sent, nor on a preview deployment, which shares production's database and whose visitors are
 * the team: either would move a sent proposal to "Opened by the client" and tell the office the
 * client had read it. A preview's PDF route already looks nothing up (D-102); the check here
 * stays as a second guard. Locally and in CI an opening counts, so the tests can see it.
 */
export function countsAsClientView(input: {
  vercelEnv: ServerEnv['VERCEL_ENV']
  staffSignedIn: boolean
}): boolean {
  const deployedElsewhere = Boolean(input.vercelEnv) && input.vercelEnv !== 'production'
  return !deployedElsewhere && !input.staffSignedIn
}
