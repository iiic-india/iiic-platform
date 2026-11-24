import { sql } from '@payloadcms/db-postgres'
import type { PayloadRequest } from 'payload'

import { recordAudit } from '@/lib/audit/record'
import { env } from '@/lib/env'
import { ok } from '@/lib/result'

import type { NotesKeyring, RekeyNotes, SealedNote } from './contract'
import { loadKeyring } from './keys'
import { openNote, sealNote } from './seal'

/**
 * The notes key's rotation (docs/18 §3; the runbook): every note not sealed under the current key
 * is opened with the key it names and sealed again under the current one. Each write is a
 * compare-and-set on the old key id and body, so a note its author changed meanwhile is left as
 * the author wrote it. A note that opens under no key held is counted, never changed. Re-sealing
 * is not a change of the note: no audit entry per note and no new `updatedAt`, one entry for the
 * run. Safe to repeat; nothing here logs a note's words.
 *
 * Not `server-only`: `pnpm notes:rekey` runs it outside Next.js, as `pnpm totp:rekey` runs its own
 * (src/scripts/rekey-notes.ts).
 */
export async function rekeyNotesWith(
  req: PayloadRequest,
  keyring: NotesKeyring,
): Promise<{ moved: number; unreadable: number }> {
  const { docs } = await req.payload.find({
    collection: 'session-notes',
    where: { keyId: { not_equals: keyring.current.id } },
    depth: 0,
    pagination: false,
    showHiddenFields: true,
    select: { booking: true, author: true, sealed: true, keyId: true },
    overrideAccess: true,
    req,
  })
  let moved = 0
  let unreadable = 0
  for (const note of docs) {
    const bookingId = typeof note.booking === 'number' ? note.booking : note.booking?.id
    const authorId = typeof note.author === 'number' ? note.author : note.author?.id
    if (bookingId === undefined || authorId === undefined) {
      unreadable += 1
      continue
    }
    const context = { bookingId, authorId }
    const opened = await openNote(keyring, note.sealed as SealedNote, context)
    if (!opened.ok) {
      unreadable += 1
      continue
    }
    const { sealed, keyId } = await sealNote(keyring, opened.value, context)
    const updated = await req.payload.db.drizzle.execute(
      sql`UPDATE "session_notes" SET "sealed" = ${JSON.stringify(sealed)}::jsonb, "key_id" = ${keyId} WHERE "id" = ${note.id} AND "key_id" = ${note.keyId} AND "sealed" = ${JSON.stringify(note.sealed)}::jsonb RETURNING "id"`,
    )
    moved += updated.rows.length
  }
  if (moved > 0 || unreadable > 0) {
    await recordAudit(req, { action: 'rekey-notes', entity: 'session-notes' }, null)
  }
  return { moved, unreadable }
}

/** The deployment's own rotation, with the keys from the environment. */
export const rekeyNotes: RekeyNotes = async (req) => {
  const keyring = loadKeyring(env())
  if (!keyring.ok) return keyring
  return ok(await rekeyNotesWith(req, keyring.value))
}
