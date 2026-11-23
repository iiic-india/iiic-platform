'use client'

import { Button, ConfirmationModal, toast, useModal } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import type { CertificatePreview, IssuedCertificate } from '@/lib/certificates/contract'

import styles from './Certificates.module.css'
import { CERTIFICATES_COPY as COPY } from './certificatesCopy'

type Recipient = { personId: number; fullName: string; nameAsPrinted: string }
type Found = { personId: number; fullName: string }
type EventOption = { id: number; label: string }

/** The issue's limit (src/lib/certificates/contract.ts, `issueInput`). */
const MAX_RECIPIENTS = 200

const CONFIRM_SLUG = 'certificates-issue-confirm'

async function call<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
  try {
    const response = await fetch(path, {
      credentials: 'include',
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
    const answer = (await response.json().catch(() => ({}))) as T & { message?: string }
    if (response.ok) return { ok: true, value: answer }
    return { ok: false, message: answer.message ?? COPY.failed }
  } catch {
    return { ok: false, message: COPY.offline }
  }
}

/**
 * The issue form (docs/18 §4): the programme line, its details and the completion day; the
 * recipients, found by name or added from an event's bookings, each with the name as it should
 * print; Preview, which stores nothing; and Issue, confirmed once in Payload's modal. Every call
 * goes to a route that checks the user, the role and the code itself. A refusal shows in an
 * error summary that takes focus; nothing is kept in the browser.
 */
export function IssueForm({ events, canIssue }: { events: EventOption[]; canIssue: boolean }) {
  const router = useRouter()
  const { openModal } = useModal()
  const errorRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLHeadingElement>(null)
  const issueForm = useRef<HTMLFormElement>(null)
  const [programmeName, setProgrammeName] = useState('')
  const [programmeDetails, setProgrammeDetails] = useState('')
  const [completedOn, setCompletedOn] = useState('')
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Found[] | null>(null)
  const [eventId, setEventId] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [pending, setPending] = useState<'search' | 'event' | 'preview' | 'issue' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pages, setPages] = useState<CertificatePreview[] | null>(null)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])

  useEffect(() => {
    if (pages) previewRef.current?.focus()
  }, [pages])

  const body = () => ({
    programmeName,
    programmeDetails: programmeDetails.trim() ? programmeDetails : undefined,
    completedOn,
    recipients: recipients.map(({ personId, nameAsPrinted }) => ({ personId, nameAsPrinted })),
  })

  /** Adds people not on the list yet; says who was there already and when the list is full. */
  function add(people: Found[]) {
    const listed = new Set(recipients.map(({ personId }) => personId))
    const fresh = people.filter(({ personId }) => !listed.has(personId))
    const repeated = people.find(({ personId }) => listed.has(personId))
    const room = Math.max(MAX_RECIPIENTS - recipients.length, 0)
    if (fresh.length > room) setNote(COPY.tooMany)
    else if (repeated && people.length === 1) setNote(COPY.alreadyAdded(repeated.fullName))
    else setNote(null)
    setPages(null)
    setRecipients([
      ...recipients,
      ...fresh.slice(0, room).map((person) => ({ ...person, nameAsPrinted: person.fullName })),
    ])
  }

  async function search(event: FormEvent) {
    event.preventDefault()
    if (pending || query.trim().length < 2) return
    setPending('search')
    setError(null)
    const answer = await call<{ people: Found[] }>(
      `/api/certificates/recipients?q=${encodeURIComponent(query.trim())}`,
    )
    if (answer.ok) setFound(answer.value.people)
    else setError(answer.message)
    setPending(null)
  }

  async function addEvent() {
    if (pending || !eventId) return
    setPending('event')
    setError(null)
    const answer = await call<{ people: Found[] }>(
      `/api/certificates/recipients?event=${encodeURIComponent(eventId)}`,
    )
    if (!answer.ok) setError(answer.message)
    else if (answer.value.people.length === 0) setNote(COPY.eventEmpty)
    else add(answer.value.people)
    setPending(null)
  }

  async function preview(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    setPending('preview')
    setError(null)
    setDone(null)
    const answer = await call<{ pages: CertificatePreview[] }>('/api/certificates/preview', {
      method: 'POST',
      body: JSON.stringify(body()),
    })
    if (answer.ok) setPages(answer.value.pages)
    else setError(answer.message)
    setPending(null)
  }

  async function issue() {
    if (pending) return
    setPending('issue')
    setError(null)
    const answer = await call<{ issued: IssuedCertificate[]; message: string }>(
      '/api/certificates/issue',
      { method: 'POST', body: JSON.stringify(body()) },
    )
    if (answer.ok) {
      setDone(answer.value.message)
      toast.success(answer.value.message)
      setRecipients([])
      setPages(null)
      router.refresh()
    } else {
      setError(answer.message)
    }
    setPending(null)
  }

  const setPrinted = (personId: number, nameAsPrinted: string) => {
    setPages(null)
    setRecipients((current) =>
      current.map((recipient) =>
        recipient.personId === personId ? { ...recipient, nameAsPrinted } : recipient,
      ),
    )
  }

  return (
    <div className={styles.form}>
      {error ? (
        <div className={styles.errorSummary} ref={errorRef} role="alert" tabIndex={-1}>
          <p className={styles.errorTitle}>{COPY.errorTitle}</p>
          <p>{error}</p>
        </div>
      ) : null}

      <form
        className={styles.form}
        id="certificates-issue"
        onSubmit={(e) => void preview(e)}
        ref={issueForm}
      >
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>{COPY.programmeLegend}</legend>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="programme-name">
              {COPY.programmeName}
            </label>
            <input
              aria-describedby="programme-name-hint"
              className={styles.input}
              id="programme-name"
              maxLength={160}
              onChange={(e) => {
                setPages(null)
                setProgrammeName(e.target.value)
              }}
              required
              value={programmeName}
            />
            <p className={styles.hint} id="programme-name-hint">
              {COPY.programmeNameHint}
            </p>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="programme-details">
              {COPY.programmeDetails}
            </label>
            <input
              aria-describedby="programme-details-hint"
              className={styles.input}
              id="programme-details"
              maxLength={200}
              onChange={(e) => {
                setPages(null)
                setProgrammeDetails(e.target.value)
              }}
              value={programmeDetails}
            />
            <p className={styles.hint} id="programme-details-hint">
              {COPY.programmeDetailsHint}
            </p>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="completed-on">
              {COPY.completedOn}
            </label>
            <input
              className={styles.input}
              id="completed-on"
              onChange={(e) => {
                setPages(null)
                setCompletedOn(e.target.value)
              }}
              required
              type="date"
              value={completedOn}
            />
          </div>
        </fieldset>
      </form>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>{COPY.recipientsLegend}</legend>
        <p className={styles.hint}>{COPY.recipientsHint}</p>
        <form aria-label={COPY.findPerson} onSubmit={(e) => void search(e)} role="search">
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="find-person">
                {COPY.findPerson}
              </label>
              <input
                aria-describedby="find-person-hint"
                autoComplete="off"
                className={styles.input}
                id="find-person"
                maxLength={100}
                minLength={2}
                onChange={(e) => setQuery(e.target.value)}
                type="search"
                value={query}
              />
              <p className={styles.hint} id="find-person-hint">
                {COPY.findPersonHint}
              </p>
            </div>
            <Button
              buttonStyle="secondary"
              disabled={pending !== null}
              margin={false}
              type="submit"
            >
              {pending === 'search' ? COPY.searching : COPY.search}
            </Button>
          </div>
        </form>
        <div aria-live="polite" role="status">
          {found && found.length === 0 ? <p className={styles.hint}>{COPY.noMatches}</p> : null}
          {note ? <p className={styles.hint}>{note}</p> : null}
        </div>
        {found && found.length > 0 ? (
          <ul className={styles.list}>
            {found.map((person) => (
              <li key={person.personId}>
                <Button
                  buttonStyle="secondary"
                  margin={false}
                  onClick={() => add([person])}
                  size="medium"
                >
                  {COPY.addPerson(person.fullName)}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}

        {events.length > 0 ? (
          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="from-event">
                {COPY.fromEvent}
              </label>
              <select
                className={styles.input}
                id="from-event"
                onChange={(e) => setEventId(e.target.value)}
                value={eventId}
              >
                <option value="">{COPY.noEvent}</option>
                {events.map((event) => (
                  <option key={event.id} value={String(event.id)}>
                    {event.label}
                  </option>
                ))}
              </select>
            </div>
            <Button
              buttonStyle="secondary"
              disabled={pending !== null || !eventId}
              margin={false}
              onClick={() => void addEvent()}
            >
              {COPY.addEvent}
            </Button>
          </div>
        ) : null}

        <h3>{COPY.recipientCount(recipients.length)}</h3>
        {recipients.length === 0 ? (
          <p className={styles.hint}>{COPY.noRecipients}</p>
        ) : (
          <ol className={styles.list}>
            {recipients.map((recipient) => (
              <li className={styles.recipient} key={recipient.personId}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor={`printed-${recipient.personId}`}>
                    {COPY.nameAsPrinted}
                  </label>
                  <input
                    aria-describedby={`record-${recipient.personId}`}
                    className={styles.input}
                    form="certificates-issue"
                    id={`printed-${recipient.personId}`}
                    maxLength={120}
                    onChange={(e) => setPrinted(recipient.personId, e.target.value)}
                    required
                    value={recipient.nameAsPrinted}
                  />
                  <p className={styles.hint} id={`record-${recipient.personId}`}>
                    {COPY.personOnRecord} {recipient.fullName}
                  </p>
                </div>
                <div className={styles.actions}>
                  <Button
                    buttonStyle="secondary"
                    margin={false}
                    onClick={() => {
                      setPages(null)
                      setRecipients((current) =>
                        current.filter(({ personId }) => personId !== recipient.personId),
                      )
                    }}
                    size="medium"
                  >
                    {COPY.remove(recipient.nameAsPrinted || recipient.fullName)}
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </fieldset>

      <div className={styles.actions}>
        <Button
          buttonStyle="primary"
          disabled={pending !== null || recipients.length === 0}
          margin={false}
          // The recipients' fields sit outside the form element and join it by its id.
          onClick={() => issueForm.current?.requestSubmit()}
        >
          {pending === 'preview' ? COPY.previewing : COPY.preview}
        </Button>
      </div>

      {pages ? (
        <section aria-labelledby="certificates-preview">
          <h2 id="certificates-preview" ref={previewRef} tabIndex={-1}>
            {COPY.previewTitle}
          </h2>
          <p className={styles.hint}>{COPY.previewNote(pages.length, recipients.length)}</p>
          <div className={styles.pages}>
            {pages.map((page, index) => {
              const name = recipients[index]?.nameAsPrinted ?? ''
              return (
                <figure key={`${index}-${name}`}>
                  <iframe
                    className={styles.page}
                    sandbox=""
                    srcDoc={page.html}
                    title={COPY.previewFrame(name)}
                  />
                  {page.waitingFor.length ? (
                    <figcaption className={styles.hint}>
                      {COPY.previewWaiting(page.waitingFor)}
                    </figcaption>
                  ) : null}
                </figure>
              )
            })}
          </div>
          {canIssue ? (
            <div className={styles.actions}>
              <Button
                buttonStyle="primary"
                disabled={pending !== null}
                margin={false}
                onClick={() => openModal(CONFIRM_SLUG)}
              >
                {pending === 'issue' ? COPY.issuing : COPY.issue(recipients.length)}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      <div aria-live="polite" role="status">
        {done ? <p className={styles.done}>{done}</p> : null}
      </div>

      <ConfirmationModal
        body={COPY.issueConfirm(recipients.length)}
        cancelLabel={COPY.cancel}
        confirmLabel={COPY.issue(recipients.length)}
        confirmingLabel={COPY.issuing}
        heading={COPY.issueConfirmTitle}
        modalSlug={CONFIRM_SLUG}
        onConfirm={issue}
      />
    </div>
  )
}
