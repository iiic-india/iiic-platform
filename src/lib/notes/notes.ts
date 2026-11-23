import 'server-only'

import {
  commitTransaction,
  initTransaction,
  killTransaction,
  type PayloadRequest,
  type Where,
} from 'payload'
import { z } from 'zod'

import { hasRole } from '@/access/roles'
import { viewRefusal } from '@/access/views'
import { recordAudit } from '@/lib/audit/record'
import { env } from '@/lib/env'
import { err, ok, type Result } from '@/lib/result'

import {
  type CountNotesForOwner,
  type ListOwnNotes,
  type NoteError,
  type NotesKeyring,
  type NoteSummary,
  type ReadNote,
  type SealedNote,
  type UpdateNote,
  updateNoteInput,
  type WriteNote,
  writeNoteInput,
} from './contract'
import { loadKeyring } from './keys'
import { openNote, sealNote } from './seal'

/**
 * Session notes (D-11; CLAUDE.md #3; docs/18 §3): written by the practitioner of the booking,
 * read by their author alone, sealed at rest, every opening in the audit log first.
 *
 * Every function asks `viewRefusal(user, 'notes')` before it reads any input; a note is then
 * found with the author's own access (POLICY.sessionNotes: `author`), so another practitioner, an
 * owner and the operator get `not-found`, the same answer as for a note that does not exist. The
 * sealed field is written past the API (`overrideAccess`) only here, after those checks. Nothing
 * here logs a note's words, a person's name or a booking's reference; validation issues name the
 * field, never its value.
 */

const COLLECTION = 'session-notes'

/** What the module needs from outside: the keyring and the audit log (tests hand in fakes). */
export type NotesDeps = {
  keyring: () => Result<NotesKeyring, { code: 'notes-key-missing' }>
  audit: typeof recordAudit
}

type Staff = { id: number }

/** An id from a relationship read at any depth. */
export const idOf = (value: unknown): number | undefined => {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'number') {
    return (value as { id: number }).id
  }
  return undefined
}

/** The field names of a failed parse, never the values typed. */
const issuesOf = (error: z.ZodError): string[] =>
  error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.code}`)

const noteId = z.number().int().positive()

/** The refusal, or the signed-in practitioner. */
function practitioner(req: PayloadRequest): Result<Staff, NoteError> {
  const refusal = viewRefusal(req.user, 'notes')
  if (refusal) return err({ code: 'refused', refusal })
  return ok({ id: (req.user as unknown as Staff).id })
}

/**
 * The booking, if it is one of the author's own sessions: read with their own access, then its
 * practitioner profile's account compared with theirs (an owner who also counsels sees every
 * booking, and still writes only on their own).
 */
async function ownBooking(
  req: PayloadRequest,
  bookingId: number,
  author: Staff,
): Promise<{ id: number; personId: number } | null> {
  const booking = await req.payload
    .findByID({
      collection: 'bookings',
      id: bookingId,
      depth: 0,
      disableErrors: true,
      overrideAccess: false,
      user: req.user,
      req,
    })
    .catch(() => null)
  const practitionerId = idOf(booking?.practitioner)
  const personId = idOf(booking?.person)
  if (!booking || practitionerId === undefined || personId === undefined) return null
  // The profile's account is not a field a practitioner may read (FIELD_POLICY.practitionerStaff),
  // so it is read past the rules, for this comparison only.
  const profile = await req.payload.findByID({
    collection: 'practitioners',
    id: practitionerId,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
  return idOf(profile?.staff) === author.id ? { id: booking.id, personId } : null
}

/** One of the author's own notes, sealed body included, or null. */
async function ownNote(req: PayloadRequest, id: number, author: Staff) {
  const { docs } = await req.payload.find({
    collection: COLLECTION,
    where: { id: { equals: id } },
    depth: 0,
    limit: 1,
    pagination: false,
    showHiddenFields: true,
    overrideAccess: false,
    user: req.user,
    req,
  })
  const note = docs[0]
  // The rule already narrows to the author; the comparison is a second lock on the same door.
  return note && idOf(note.author) === author.id ? note : null
}

export function notesWith(deps: NotesDeps) {
  const writeNote: WriteNote = async (req, input) => {
    const author = practitioner(req)
    if (!author.ok) return author
    const parsed = writeNoteInput.safeParse(input)
    if (!parsed.success) return err({ code: 'invalid', issues: issuesOf(parsed.error) })
    const keyring = deps.keyring()
    if (!keyring.ok) return keyring
    const booking = await ownBooking(req, parsed.data.bookingId, author.value)
    if (!booking) return err({ code: 'not-own-booking' })
    const { sealed, keyId } = await sealNote(keyring.value, parsed.data.body, {
      bookingId: booking.id,
      authorId: author.value.id,
    })
    const note = await req.payload.create({
      collection: COLLECTION,
      data: {
        booking: booking.id,
        person: booking.personId,
        author: author.value.id,
        sealed,
        keyId,
      },
      depth: 0,
      overrideAccess: true,
      req,
      // The sealed field is hidden from the audit plugin's field diff: the act is named instead.
      context: { auditAction: 'write-note' },
    })
    return ok({ id: note.id })
  }

  const updateNote: UpdateNote = async (req, input) => {
    const author = practitioner(req)
    if (!author.ok) return author
    const parsed = updateNoteInput.safeParse(input)
    if (!parsed.success) return err({ code: 'invalid', issues: issuesOf(parsed.error) })
    const keyring = deps.keyring()
    if (!keyring.ok) return keyring
    const note = await ownNote(req, parsed.data.noteId, author.value)
    const bookingId = idOf(note?.booking)
    if (!note || bookingId === undefined) return err({ code: 'not-found' })
    const { sealed, keyId } = await sealNote(keyring.value, parsed.data.body, {
      bookingId,
      authorId: author.value.id,
    })
    await req.payload.update({
      collection: COLLECTION,
      id: note.id,
      data: { sealed, keyId },
      depth: 0,
      overrideAccess: true,
      req,
      context: { auditAction: 'update-note' },
    })
    return ok({ id: note.id })
  }

  /**
   * Opens one note for its author. The `read-note` entry is written and committed before the
   * sealed body is opened; if the entry fails, the read fails (it throws, as a fault) and the
   * words are never handed back. When the caller already holds a transaction, the entry commits
   * with it.
   */
  const readNote: ReadNote = async (req, id) => {
    const author = practitioner(req)
    if (!author.ok) return author
    const parsedId = noteId.safeParse(id)
    if (!parsedId.success) return err({ code: 'invalid', issues: issuesOf(parsedId.error) })
    const keyring = deps.keyring()
    if (!keyring.ok) return keyring
    const note = await ownNote(req, parsedId.data, author.value)
    const bookingId = idOf(note?.booking)
    if (!note || bookingId === undefined) return err({ code: 'not-found' })

    const owned = await initTransaction(req)
    try {
      await deps.audit(req, { action: 'read-note', entity: COLLECTION, entityId: note.id })
      if (owned) await commitTransaction(req)
    } catch (error) {
      if (owned) await killTransaction(req)
      throw error
    }

    const opened = await openNote(keyring.value, note.sealed as SealedNote, {
      bookingId,
      authorId: author.value.id,
    })
    if (!opened.ok) return opened
    return ok({
      id: note.id,
      bookingId,
      body: opened.value,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    })
  }

  /** The author's own notes on a booking or a person, newest first: dates only, not a read. */
  const listOwnNotes: ListOwnNotes = async (req, scope) => {
    const author = practitioner(req)
    if (!author.ok) return author
    const parsed = z
      .union([
        z.object({ bookingId: z.number().int().positive() }),
        z.object({ personId: z.number().int().positive() }),
      ])
      .safeParse(scope)
    if (!parsed.success) return err({ code: 'invalid', issues: issuesOf(parsed.error) })
    const where: Where =
      'bookingId' in parsed.data
        ? { booking: { equals: parsed.data.bookingId } }
        : { person: { equals: parsed.data.personId } }
    const { docs } = await req.payload.find({
      collection: COLLECTION,
      where: { and: [{ author: { equals: author.value.id } }, where] },
      depth: 0,
      pagination: false,
      sort: '-createdAt',
      select: { booking: true, createdAt: true, updatedAt: true },
      overrideAccess: false,
      user: req.user,
      req,
    })
    return ok(
      docs.flatMap((doc): NoteSummary[] => {
        const bookingId = idOf(doc.booking)
        return bookingId === undefined
          ? []
          : [{ id: doc.id, bookingId, createdAt: doc.createdAt, updatedAt: doc.updatedAt }]
      }),
    )
  }

  /**
   * For an owner's view of a person (docs/05): how many notes exist and when the latest was
   * written, never who wrote them or what they say. Read past the rules, as counts only.
   */
  const countNotesForOwner: CountNotesForOwner = async (req, personId) => {
    const refusal = viewRefusal(req.user, 'person')
    if (refusal) return err({ code: 'refused', refusal })
    if (!hasRole(req.user, 'owner')) {
      return err({ code: 'refused', refusal: { status: 403, code: 'not-allowed' } })
    }
    const parsed = noteId.safeParse(personId)
    if (!parsed.success) return err({ code: 'invalid', issues: issuesOf(parsed.error) })
    const where = { person: { equals: parsed.data } }
    const [{ totalDocs }, latest] = await Promise.all([
      req.payload.count({ collection: COLLECTION, where, overrideAccess: true, req }),
      req.payload.find({
        collection: COLLECTION,
        where,
        depth: 0,
        limit: 1,
        pagination: false,
        sort: '-createdAt',
        select: { createdAt: true },
        overrideAccess: true,
        req,
      }),
    ])
    return ok({ count: totalDocs, latestAt: latest.docs[0]?.createdAt ?? null })
  }

  /** Whether the signed-in practitioner writes on this booking: the panel shows only then. */
  const ownsBooking = async (
    req: PayloadRequest,
    bookingId: unknown,
  ): Promise<Result<boolean, NoteError>> => {
    const author = practitioner(req)
    if (!author.ok) return author
    const parsed = noteId.safeParse(bookingId)
    if (!parsed.success) return err({ code: 'invalid', issues: issuesOf(parsed.error) })
    return ok((await ownBooking(req, parsed.data, author.value)) !== null)
  }

  return { writeNote, updateNote, readNote, listOwnNotes, countNotesForOwner, ownsBooking }
}

/** The deployment's own: the keyring from the environment, the real audit log. */
export const { writeNote, updateNote, readNote, listOwnNotes, countNotesForOwner, ownsBooking } =
  notesWith({
    keyring: () => loadKeyring(env()),
    audit: recordAudit,
  })

/** Whether this deployment can seal and open notes (the panel says so when it cannot). */
export const notesAvailable = (): boolean => loadKeyring(env()).ok
