import type { PayloadRequest } from 'payload'
import { z } from 'zod'

import type { ViewRefusal } from '@/access/views'
import type { Result } from '@/lib/result'

/**
 * The session-notes module's contract (D-11; CLAUDE.md #3; docs/18 §3). Builder A implements it in
 * src/lib/notes/ (keys.ts, seal.ts, notes.ts), all `server-only`.
 *
 * - Sealing: jose's flattened JWE, `alg: 'dir'`, `enc: 'A256GCM'`, the key's id in the protected
 *   header (`kid`), and the additional authenticated data `session-note|booking:<id>|author:<id>`,
 *   so a sealed body moved to another row or author does not open. No home-made cryptography.
 * - Keys: NOTES_ENCRYPTION_KEY (32 bytes, base64), and NOTES_ENCRYPTION_KEY_PREVIOUS while it is
 *   rotated (src/lib/env.ts). A key's id is the first 12 base64url characters of its SHA-256.
 *   Without a key nothing is sealed or opened: `notes-key-missing`.
 * - Who: the author alone, with the two-factor code (`viewRefusal(user, 'notes')` first); a note
 *   is written only on a booking whose practitioner profile is the author's own.
 * - Audit: every opening writes `read-note` in the same transaction before the words are handed
 *   back, and a failed entry refuses the read; a write records `write-note` or `update-note` (the
 *   sealed field is hidden, so the plugin's field diff alone would not see the change).
 * - Logs and errors never hold the body, a person's name or the booking's reference.
 */

/** A note's words as the author types them. */
export const noteBody = z.string().trim().min(1).max(20_000)

export const writeNoteInput = z.object({
  bookingId: z.number().int().positive(),
  body: noteBody,
})
export type WriteNoteInput = z.infer<typeof writeNoteInput>

export const updateNoteInput = z.object({
  noteId: z.number().int().positive(),
  body: noteBody,
})
export type UpdateNoteInput = z.infer<typeof updateNoteInput>

export type NoteError =
  | ({ code: 'refused' } & { refusal: ViewRefusal })
  | { code: 'invalid'; issues: string[] }
  /** No NOTES_ENCRYPTION_KEY in this environment: notes are refused, never stored in the clear. */
  | { code: 'notes-key-missing' }
  /** The booking is not one of the author's own sessions. */
  | { code: 'not-own-booking' }
  /** No such note, or not this person's: the same answer, so a note's existence never leaks. */
  | { code: 'not-found' }
  /** The sealed body did not open under any key held (a rotation left it behind, or tampering). */
  | { code: 'unreadable' }

/** A key and its id (`kid`). */
export type NoteKey = { id: string; key: Uint8Array }

/** The keys a deployment holds: the one it seals with, and the one it replaced, while rotating. */
export type NotesKeyring = { current: NoteKey; previous?: NoteKey }

/** The stored form: a flattened JWE. */
export type SealedNote = {
  protected: string
  iv: string
  ciphertext: string
  tag: string
}

/** What binds a sealed body to its row. */
export type NoteContext = { bookingId: number; authorId: number }

/** The keyring from the environment, or `notes-key-missing`. */
export type LoadKeyring = (env: {
  NOTES_ENCRYPTION_KEY?: string
  NOTES_ENCRYPTION_KEY_PREVIOUS?: string
}) => Result<NotesKeyring, { code: 'notes-key-missing' }>

export type SealNote = (
  keyring: NotesKeyring,
  body: string,
  context: NoteContext,
) => Promise<{ sealed: SealedNote; keyId: string }>

export type OpenNote = (
  keyring: NotesKeyring,
  sealed: SealedNote,
  context: NoteContext,
) => Promise<Result<string, { code: 'unreadable' }>>

/** A note as its author reads it. */
export type NoteView = {
  id: number
  bookingId: number
  body: string
  createdAt: string
  updatedAt: string
}

/** A note in a list: when, never the words (the list itself is not a read of S3 content). */
export type NoteSummary = { id: number; bookingId: number; createdAt: string; updatedAt: string }

export type WriteNote = (
  req: PayloadRequest,
  input: unknown,
) => Promise<Result<{ id: number }, NoteError>>

export type UpdateNote = (
  req: PayloadRequest,
  input: unknown,
) => Promise<Result<{ id: number }, NoteError>>

/** Opens one note for its author and records the read (`read-note`) first. */
export type ReadNote = (req: PayloadRequest, noteId: number) => Promise<Result<NoteView, NoteError>>

/** The author's own notes on a person or a booking, newest first. */
export type ListOwnNotes = (
  req: PayloadRequest,
  scope: { personId: number } | { bookingId: number },
) => Promise<Result<NoteSummary[], NoteError>>

/**
 * For the People timeline (docs/05: owners see that a note exists): how many notes a person has
 * and when the latest was written, without authors or words. Owners only; a practitioner sees
 * their own notes through ListOwnNotes, and the operator sees nothing of notes.
 */
export type CountNotesForOwner = (
  req: PayloadRequest,
  personId: number,
) => Promise<Result<{ count: number; latestAt: string | null }, NoteError>>

/**
 * The rotation (`pnpm notes:rekey`, run in the deploy's build like totp:rekey): re-seals every
 * note still under the previous key with the current one and returns how many moved and how many
 * would not open. Writes one audit entry for the run, none per note.
 */
export type RekeyNotes = (
  req: PayloadRequest,
) => Promise<Result<{ moved: number; unreadable: number }, { code: 'notes-key-missing' }>>
