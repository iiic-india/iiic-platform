'use client'

import { Button, toast, useConfig } from '@payloadcms/ui'
import { useEffect, useRef, useState } from 'react'

import { formatIstDate, formatIstTime } from '@/lib/time/ist'

import styles from './Notes.module.css'
import { NOTES_COPY as COPY } from './notesCopy'

type Summary = { id: number; bookingId: number; createdAt: string; updatedAt: string }
type Opened = { id: number; body: string; createdAt: string; updatedAt: string }

type Props = {
  scope: { bookingId: number } | { personId: number }
  initial: Summary[]
  available: boolean
  /** The signed-in practitioner writes on this booking (never on a person's record). */
  writes: boolean
}

const when = (iso: string) => {
  const at = new Date(iso)
  return `${formatIstDate(at)}, ${formatIstTime(at)}`
}

/**
 * The author's own session notes (D-11; docs/18 §3): the dates of their notes, "Open" for one at a
 * time (each opening is audited on the server before the words come back), and "Add a note" on
 * their own booking. It sits inside the record's form, so it is not a form itself. No autosave and
 * no browser storage: a draft lives only in this panel until Save, and an opened note's words
 * leave memory when it is closed.
 */
export function NotesPanel({ scope, initial, available, writes }: Props) {
  const {
    config: {
      routes: { api },
      serverURL,
    },
  } = useConfig()
  const [notes, setNotes] = useState(initial)
  const [opened, setOpened] = useState<Opened | null>(null)
  const [editing, setEditing] = useState<'new' | number | null>(null)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const openedHeading = useRef<HTMLHeadingElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  const base = `${serverURL}${api}/notes`

  useEffect(() => {
    if (opened && editing === null) openedHeading.current?.focus()
  }, [opened, editing])
  useEffect(() => {
    if (editing !== null) field.current?.focus()
  }, [editing])

  async function call(path: string, body?: Record<string, unknown>) {
    const response = await fetch(`${base}/${path}`, {
      method: body ? 'POST' : 'GET',
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    })
    const result = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (!response.ok) throw new Error(String(result.message ?? COPY.errors.failed))
    return result
  }

  async function run(work: () => Promise<void>) {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      await work()
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : COPY.errors.failed)
    }
    setPending(false)
  }

  const refresh = async () => {
    const query =
      'bookingId' in scope ? `bookingId=${scope.bookingId}` : `personId=${scope.personId}`
    const result = await call(`list?${query}`)
    setNotes((result.notes as Summary[]) ?? [])
  }

  const open = (id: number) =>
    run(async () => {
      setEditing(null)
      const result = await call('open', { noteId: id })
      setOpened(result.note as Opened)
    })

  const save = () =>
    run(async () => {
      if (!draft.trim()) throw new Error(COPY.errors.invalid)
      if (editing === 'new' && 'bookingId' in scope) {
        await call('write', { bookingId: scope.bookingId, body: draft })
      } else if (typeof editing === 'number') {
        await call('update', { noteId: editing, body: draft })
      }
      setEditing(null)
      setDraft('')
      setOpened(null)
      await refresh()
      toast.success(COPY.saved)
    })

  const close = () => {
    setOpened(null)
    setEditing(null)
    setDraft('')
    setError(null)
  }

  const headingId = 'bookingId' in scope ? 'notes-booking' : 'notes-person'

  return (
    <section className={styles.panel} aria-labelledby={headingId}>
      <h2 className={styles.heading} id={headingId}>
        {COPY.title}
      </h2>
      {!available ? (
        <p className={styles.intro}>{COPY.unavailable}</p>
      ) : (
        <>
          <p className={styles.intro}>{COPY.intro}</p>
          {notes.length === 0 ? (
            <p>{'bookingId' in scope ? COPY.none : COPY.noneForPerson}</p>
          ) : (
            <ul className={styles.list}>
              {notes.map((note) => (
                <li className={styles.item} key={note.id}>
                  <span className={styles.when}>
                    {COPY.written} {when(note.createdAt)}
                    {note.updatedAt !== note.createdAt
                      ? `; ${COPY.updated} ${when(note.updatedAt)}`
                      : ''}
                  </span>
                  <Button
                    buttonStyle="secondary"
                    disabled={pending}
                    margin={false}
                    onClick={() => void open(note.id)}
                    size="medium"
                    type="button"
                  >
                    {COPY.open}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {opened && editing === null ? (
            <div className={styles.note}>
              <h3 id="notes-opened" ref={openedHeading} tabIndex={-1}>
                {COPY.written} {when(opened.createdAt)}
              </h3>
              <p className={styles.body}>{opened.body}</p>
              <div className={styles.row}>
                <Button
                  buttonStyle="secondary"
                  margin={false}
                  onClick={close}
                  size="medium"
                  type="button"
                >
                  {COPY.close}
                </Button>
                <Button
                  buttonStyle="secondary"
                  margin={false}
                  onClick={() => {
                    setDraft(opened.body)
                    setEditing(opened.id)
                  }}
                  size="medium"
                  type="button"
                >
                  {COPY.edit}
                </Button>
              </div>
            </div>
          ) : null}

          {editing !== null ? (
            <div className={styles.note}>
              <label className={styles.label} htmlFor="notes-draft">
                {COPY.bodyLabel}
              </label>
              <textarea
                aria-describedby={error ? 'notes-hint notes-error' : 'notes-hint'}
                aria-invalid={error ? true : undefined}
                className={styles.textarea}
                id="notes-draft"
                maxLength={20_000}
                onChange={(event) => setDraft(event.target.value)}
                ref={field}
                value={draft}
              />
              <p className={styles.hint} id="notes-hint">
                {COPY.bodyHint}
              </p>
              <div className={styles.row}>
                <Button
                  buttonStyle="primary"
                  disabled={pending}
                  margin={false}
                  onClick={() => void save()}
                  size="medium"
                  type="button"
                >
                  {COPY.save}
                </Button>
                <Button
                  buttonStyle="secondary"
                  margin={false}
                  onClick={close}
                  size="medium"
                  type="button"
                >
                  {COPY.cancel}
                </Button>
              </div>
            </div>
          ) : writes ? (
            <Button
              buttonStyle="primary"
              disabled={pending}
              margin={false}
              onClick={() => {
                setOpened(null)
                setDraft('')
                setEditing('new')
              }}
              size="medium"
              type="button"
            >
              {COPY.add}
            </Button>
          ) : null}

          {error ? (
            <p className={styles.error} id="notes-error" role="alert">
              {error}
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
