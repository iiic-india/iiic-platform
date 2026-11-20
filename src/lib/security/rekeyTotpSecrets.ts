import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { decryptTotpSecret, encryptTotpSecret, isEncryptedTotpSecret } from './totpSecret'

/**
 * After a PAYLOAD_SECRET rotation (docs/08 §9): stores every staff TOTP secret that only the
 * previous key opens again under the current one. Each write is a compare-and-set, so a secret
 * that changed meanwhile (a reset, a new authenticator) is left alone. Safe to repeat.
 */
export async function rekeyTotpSecrets(
  payload: Payload,
  keys: { current: string; previous: string },
): Promise<{ moved: number; unreadable: number }> {
  const { rows } = await payload.db.drizzle.execute(
    sql`SELECT "id", "totp_secret" FROM "users" WHERE "totp_secret" IS NOT NULL`,
  )
  let moved = 0
  let unreadable = 0
  for (const row of rows as { id: number | string; totp_secret: string }[]) {
    const stored = row.totp_secret
    if (!isEncryptedTotpSecret(stored) || decryptTotpSecret(stored, keys.current) !== null) {
      continue
    }
    const plain = decryptTotpSecret(stored, keys.previous)
    if (plain === null) {
      unreadable += 1
      continue
    }
    const updated = await payload.db.drizzle.execute(
      sql`UPDATE "users" SET "totp_secret" = ${encryptTotpSecret(plain, keys.current)} WHERE "id" = ${row.id} AND "totp_secret" = ${stored} RETURNING "id"`,
    )
    moved += updated.rows.length
  }
  return { moved, unreadable }
}
