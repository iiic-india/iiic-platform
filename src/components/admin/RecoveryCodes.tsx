import type { ServerProps } from 'payload'

import { RecoveryCodesPanel } from './RecoveryCodesPanel'

/**
 * On the dashboard: how many unused recovery codes the signed-in staff member holds, and a way
 * to create a new set (src/lib/auth/recoveryEndpoints.ts). Codes are counted here and never
 * read: only their hashes are stored. Shown only once the two-factor code has been entered.
 */
export async function RecoveryCodes({ payload, user }: ServerProps) {
  if (!user || (user as { _strategy?: string })._strategy !== 'totp') return null
  const { totalDocs } = await payload.count({
    collection: 'staff-recovery-codes',
    where: { and: [{ user: { equals: user.id } }, { usedAt: { exists: false } }] },
    overrideAccess: true,
  })
  return <RecoveryCodesPanel unused={totalDocs} />
}
