import 'server-only'

import { sql } from '@payloadcms/db-postgres'

import { recordAudit } from '@/lib/audit/record'

import { customerAuthFor } from './auth/instance'
import { SIGN_IN_REQUEST_KEEP_HOURS, type PurgeSignIns } from './contract'

/**
 * What sign-in leaves behind, removed nightly by O5 (docs/20 §4.8; D-116; hook H9): the
 * `sign-in-requests` rows older than SIGN_IN_REQUEST_KEEP_HOURS (their keyed hashes have done
 * their work for the limits), and Better Auth's sessions and codes past their end. One audit
 * entry for a run that removed something, with the counts and no one's details.
 */
export const purgeSignIns: PurgeSignIns = async (req, now) => {
  const cutoff = new Date(now.getTime() - SIGN_IN_REQUEST_KEEP_HOURS * 60 * 60 * 1000)
  const result = await req.payload.db.drizzle.execute(
    sql`DELETE FROM "sign_in_requests" WHERE "requested_at" < ${cutoff.toISOString()}`,
  )
  const requests = Number((result as { rowCount?: number | null }).rowCount ?? 0)

  let sessions = 0
  let codes = 0
  const auth = customerAuthFor(req.payload)
  if (auth) {
    const { adapter } = await auth.$context
    sessions = await adapter.deleteMany({
      model: 'session',
      where: [{ field: 'expiresAt', operator: 'lt', value: now }],
    })
    codes = await adapter.deleteMany({
      model: 'verification',
      where: [{ field: 'expiresAt', operator: 'lt', value: now }],
    })
  }

  if (requests + sessions + codes > 0) {
    await recordAudit(
      req,
      {
        action: 'purge-expired',
        entity: 'sign-in-requests',
        changed: [`requests:${requests}`, `sessions:${sessions}`, `codes:${codes}`],
      },
      null,
    )
  }
  return { requests, sessions, codes }
}
