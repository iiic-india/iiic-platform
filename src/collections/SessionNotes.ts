import type { CollectionConfig, FieldAccess } from 'payload'

import { allow, POLICY } from '@/access/policy'

/** Fields only the notes module writes, after its own checks (src/lib/notes/). */
const serverWritten: { create: FieldAccess; update: FieldAccess } = {
  create: () => false,
  update: () => false,
}

/**
 * A practitioner's private note on a session (docs/04 `session_notes`, S3; D-11; CLAUDE.md #3;
 * docs/18 §3). Kept apart from the booking, with rules of its own:
 * - its author alone reads it (POLICY.sessionNotes), with the two-factor code; an owner sees that
 *   a note exists, through the People timeline's count, never its words;
 * - the body is stored only encrypted (`sealed`, a JWE under NOTES_ENCRYPTION_KEY, bound to the
 *   booking and the author), in a field no read returns; the notes module writes it and opens it
 *   for its author, and records every opening in the audit log;
 * - nobody writes a note through the API, so nothing unencrypted can reach the table;
 * - never in search, analytics, exports, messages or logs.
 * Hidden from the admin's lists: notes are written and read from the booking and the person's
 * record (docs/18 §6).
 */
export const SessionNotes: CollectionConfig = {
  slug: 'session-notes',
  labels: { singular: 'Session note', plural: 'Session notes' },
  admin: {
    hidden: true,
    useAsTitle: 'id',
    defaultColumns: ['booking', 'createdAt', 'updatedAt'],
  },
  access: {
    read: allow(POLICY.sessionNotes.read),
    create: allow(POLICY.sessionNotes.create),
    update: allow(POLICY.sessionNotes.update),
    delete: allow(POLICY.sessionNotes.delete),
  },
  defaultSort: '-createdAt',
  disableBulkEdit: true,
  lockDocuments: false,
  fields: [
    {
      name: 'booking',
      type: 'relationship',
      relationTo: 'bookings',
      required: true,
      index: true,
      access: serverWritten,
    },
    {
      // Copied from the booking when the note is written, so the person's erasure finds it.
      name: 'person',
      type: 'relationship',
      relationTo: 'people',
      required: true,
      index: true,
      access: serverWritten,
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
      access: serverWritten,
    },
    {
      // The body, sealed: a flattened JWE (dir, A256GCM) whose header names the key it was sealed
      // under (`kid`). Never returned by a read; opened only by src/lib/notes for the author.
      name: 'sealed',
      type: 'json',
      required: true,
      hidden: true,
      access: serverWritten,
    },
    {
      // The key the body is sealed under, so a rotation finds what it still has to re-seal.
      name: 'keyId',
      type: 'text',
      required: true,
      index: true,
      maxLength: 16,
      hidden: true,
      access: serverWritten,
    },
  ],
}
