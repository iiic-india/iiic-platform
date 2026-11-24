import type { UIFieldServerComponent } from 'payload'

import { mayOpen } from '@/access/views'
import { countNotesForOwner, listOwnNotes, notesAvailable } from '@/lib/notes/notes'
import { formatIstDate } from '@/lib/time/ist'

import styles from './Notes.module.css'
import { NOTES_COPY as COPY } from './notesCopy'
import { NotesPanel } from './NotesPanel'

/**
 * Session notes on a person's record (docs/18 §3): an owner sees how many exist and when the
 * latest was written, never who wrote them or what they say; a practitioner sees their own notes
 * for this person, dated, each opened on its own and audited. The operator sees nothing of notes.
 */
export const PersonNotes: UIFieldServerComponent = async ({ id, req }) => {
  if (id === undefined || id === null) return null
  const personId = Number(id)

  const counted = await countNotesForOwner(req, personId)
  const own = mayOpen(req.user, 'notes') ? await listOwnNotes(req, { personId }) : null
  const ownNotes = own?.ok ? own.value : []

  if (!counted.ok && ownNotes.length === 0) return null
  return (
    <>
      {counted.ok ? (
        <section className={styles.panel} aria-labelledby="notes-count">
          <h2 className={styles.heading} id="notes-count">
            {COPY.title}
          </h2>
          <p className={styles.intro}>
            {counted.value.count === 0 || !counted.value.latestAt
              ? COPY.forOwnerNone
              : COPY.forOwner(counted.value.count, formatIstDate(new Date(counted.value.latestAt)))}
          </p>
        </section>
      ) : null}
      {ownNotes.length ? (
        <NotesPanel
          available={notesAvailable()}
          initial={ownNotes}
          scope={{ personId }}
          writes={false}
        />
      ) : null}
    </>
  )
}
