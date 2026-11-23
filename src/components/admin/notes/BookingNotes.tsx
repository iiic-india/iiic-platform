import type { UIFieldServerComponent } from 'payload'

import { listOwnNotes, notesAvailable, ownsBooking } from '@/lib/notes/notes'

import { NotesPanel } from './NotesPanel'

/**
 * The "Session notes" panel on a booking (docs/18 §3), shown only to the booking's own
 * practitioner (or to an author with notes on it): the notes module checks the user, the code and
 * the role before anything is read, then reads with the author's own access. Everyone else sees
 * nothing at all, not even that notes exist.
 */
export const BookingNotes: UIFieldServerComponent = async ({ id, req }) => {
  if (id === undefined || id === null) return null
  const bookingId = Number(id)
  const writes = await ownsBooking(req, bookingId)
  if (!writes.ok) return null
  const notes = await listOwnNotes(req, { bookingId })
  if (!notes.ok || (!writes.value && notes.value.length === 0)) return null
  return (
    <NotesPanel
      available={notesAvailable()}
      initial={notes.value}
      scope={{ bookingId }}
      writes={writes.value}
    />
  )
}
