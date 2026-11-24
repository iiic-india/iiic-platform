import 'server-only'

import type { PayloadHandler, PayloadRequest } from 'payload'

import { viewRefusal } from '@/access/views'
import { NOTES_COPY, type NoteErrorCode } from '@/components/admin/notes/notesCopy'

import type { NoteError } from './contract'
import {
  countNotesForOwner,
  listOwnNotes,
  notesAvailable,
  ownsBooking,
  readNote,
  updateNote,
  writeNote,
} from './notes'

/**
 * The notes panel's routes under /api/notes (docs/18 §3). A practitioner's routes ask
 * `viewRefusal` here, before the query or the body is read, and the notes module asks again; the
 * owner's count is refused by the module before its one number is used (CLAUDE.md #6). Answers are never cached; an
 * error names what to do, never a note's words. A note is opened by POST, so no prefetch or
 * cache ever opens one.
 */

const json = (body: Record<string, unknown>, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

const STATUS: Record<NoteError['code'], number> = {
  refused: 403,
  invalid: 400,
  'notes-key-missing': 503,
  'not-own-booking': 403,
  'not-found': 404,
  unreadable: 422,
}

function refused(error: NoteError) {
  const status = error.code === 'refused' ? error.refusal.status : STATUS[error.code]
  const message = NOTES_COPY.errors[error.code as NoteErrorCode]
  return json({ code: error.code, message }, status)
}

async function body(req: PayloadRequest): Promise<Record<string, unknown>> {
  const parsed = await req.json?.().catch(() => null)
  return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
}

const numberParam = (req: PayloadRequest, name: string) => {
  const raw = req.searchParams?.get(name)
  return raw && /^\d{1,12}$/.test(raw) ? Number(raw) : undefined
}

/** Logs only the fault's name: a failed query's message can carry values. */
function failed(req: PayloadRequest, what: string, error: unknown) {
  req.payload.logger.error(
    `${what} failed (${error instanceof Error ? error.name : 'unknown error'}).`,
  )
  return json({ code: 'failed', message: NOTES_COPY.errors.failed }, 500)
}

const guarded =
  (what: string, handler: PayloadHandler, practitionersOnly = true): PayloadHandler =>
  async (req) => {
    // The user, the code and the role, before the query or the body is read (CLAUDE.md #6).
    const refusal = practitionersOnly ? viewRefusal(req.user, 'notes') : null
    if (refusal) return refused({ code: 'refused', refusal })
    try {
      return await handler(req)
    } catch (error) {
      return failed(req, what, error)
    }
  }

/** GET ?bookingId= or ?personId=: the author's own notes there (dates only), and whether they write. */
const list: PayloadHandler = async (req) => {
  const bookingId = numberParam(req, 'bookingId')
  const personId = numberParam(req, 'personId')
  const scope = bookingId ? { bookingId } : { personId: personId ?? 0 }
  const notes = await listOwnNotes(req, scope)
  if (!notes.ok) return refused(notes.error)
  const writes = bookingId ? await ownsBooking(req, bookingId) : null
  if (writes && !writes.ok) return refused(writes.error)
  // Not the practitioner of this booking, and no notes of theirs here: nothing to show.
  if (bookingId && !writes?.value && notes.value.length === 0) {
    return refused({ code: 'not-own-booking' })
  }
  return json({
    available: notesAvailable(),
    writes: Boolean(writes?.value),
    notes: notes.value,
  })
}

/** POST { bookingId, body } */
const write: PayloadHandler = async (req) => {
  const input = await body(req)
  const written = await writeNote(req, {
    bookingId: input.bookingId as number,
    body: input.body as string,
  })
  return written.ok ? json({ id: written.value.id }) : refused(written.error)
}

/** POST { noteId, body } */
const update: PayloadHandler = async (req) => {
  const input = await body(req)
  const saved = await updateNote(req, {
    noteId: input.noteId as number,
    body: input.body as string,
  })
  return saved.ok ? json({ id: saved.value.id }) : refused(saved.error)
}

/** POST { noteId }: one note's words for its author, after the `read-note` entry is written. */
const open: PayloadHandler = async (req) => {
  const input = await body(req)
  const note = await readNote(req, input.noteId as number)
  return note.ok ? json({ note: note.value }) : refused(note.error)
}

/** GET ?personId=: an owner's count of a person's notes, never their words or authors. */
const count: PayloadHandler = async (req) => {
  const counted = await countNotesForOwner(req, numberParam(req, 'personId') ?? 0)
  if (!counted.ok) {
    const error = counted.error
    const status = error.code === 'refused' ? error.refusal.status : 400
    return json({ code: error.code }, status)
  }
  return json(counted.value)
}

/** Registered by src/plugins/notesAndPrivacy.ts, which loads this module only when one is called. */
export const notesHandlers = {
  list: guarded('Listing notes', list),
  write: guarded('Writing a note', write),
  update: guarded('Changing a note', update),
  open: guarded('Opening a note', open),
  count: guarded('Counting notes', count, false),
} satisfies Record<string, PayloadHandler>
