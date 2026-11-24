'use client'

import { Button, toast, useConfig } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'

import styles from './Office.module.css'
import { OFFICE_VIEW_COPY as COPY } from './officeViewCopy'

type Props = {
  /** The endpoint under the API route, such as `/bookings/12/cancel`. */
  path: string
  /** What the button says: verb and object (src/brand/VOICE.md). */
  submitLabel: string
  /** The form's fields, drawn on the server with their labels. */
  children: ReactNode
  /** The heading that names the form, for its accessible name. */
  labelledBy: string
}

type Answer = { message?: string; link?: string }

/**
 * One office action as a form (docs/16 §12, E): its fields post to the action's endpoint as JSON,
 * which checks the user, the role and the code again on the server. A refusal shows as an error
 * summary that takes focus, so a keyboard or screen-reader user hears it at once; a success shows
 * what is done, and the page is read again so every panel shows where the record stands. The
 * button cannot be pressed twice while the request runs.
 */
export function OfficeActionForm({ path, submitLabel, children, labelledBy }: Props) {
  const {
    config: {
      routes: { api },
      serverURL,
    },
  } = useConfig()
  const router = useRouter()
  const statusId = useId()
  const errorRef = useRef<HTMLDivElement>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Answer | null>(null)

  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    setError(null)
    setDone(null)
    const body = Object.fromEntries(new FormData(event.currentTarget).entries())
    try {
      const response = await fetch(`${serverURL}${api}${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const answer = (await response.json().catch(() => ({}))) as Answer
      if (response.ok) {
        setDone(answer)
        if (answer.message) toast.success(answer.message)
        router.refresh()
      } else {
        setError(answer.message ?? COPY.failed)
      }
    } catch {
      setError(COPY.offline)
    }
    setPending(false)
  }

  return (
    <form aria-labelledby={labelledBy} className={styles.form} onSubmit={(e) => void submit(e)}>
      {error ? (
        <div className={styles.errorSummary} ref={errorRef} role="alert" tabIndex={-1}>
          <p className={styles.errorTitle}>{COPY.errorTitle}</p>
          <p>{error}</p>
        </div>
      ) : null}
      {children}
      <div className={styles.actions}>
        <Button buttonStyle="primary" disabled={pending} margin={false} size="medium" type="submit">
          {pending ? COPY.working : submitLabel}
        </Button>
      </div>
      <div aria-live="polite" id={statusId} role="status">
        {done?.message ? (
          <p className={styles.done}>
            {done.message}
            {done.link ? (
              <>
                {' '}
                <a href={done.link} rel="noreferrer" target="_blank">
                  {done.link}
                </a>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </form>
  )
}
