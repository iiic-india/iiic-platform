'use client'

import { Button, ConfirmationModal, toast, useModal } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

import { CERTIFICATES_COPY as COPY } from './certificatesCopy'
import styles from './Certificates.module.css'

type Props = {
  /** The route, such as `/api/certificates/12/revoke`. */
  path: string
  /** What the button says: verb and object (src/brand/VOICE.md). */
  submitLabel: string
  confirmHeading: string
  confirmBody: string
  /** The heading that names the form, for its accessible name. */
  labelledBy: string
  /** The form's fields, drawn on the server with their labels. */
  children: ReactNode
}

/**
 * Revoke or reissue as a form (docs/18 §4): the browser checks the fields, Payload's confirm
 * modal asks once, then the fields post as JSON to the route, which checks the user, the role and
 * the code again. A refusal shows as an error summary that takes focus; a success says what is
 * done and the page is read again. The button cannot be pressed twice while the request runs.
 */
export function CertificateActionForm({
  path,
  submitLabel,
  confirmHeading,
  confirmBody,
  labelledBy,
  children,
}: Props) {
  const router = useRouter()
  const { openModal } = useModal()
  const modalSlug = `certificate-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const form = useRef<HTMLFormElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])

  async function send() {
    if (pending || !form.current) return
    setPending(true)
    setError(null)
    setDone(null)
    const body = Object.fromEntries(new FormData(form.current).entries())
    try {
      const response = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const answer = (await response.json().catch(() => ({}))) as { message?: string }
      if (response.ok) {
        setDone(answer.message ?? null)
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
    <>
      <form
        aria-labelledby={labelledBy}
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault()
          if (!pending) openModal(modalSlug)
        }}
        ref={form}
      >
        {error ? (
          <div className={styles.errorSummary} ref={errorRef} role="alert" tabIndex={-1}>
            <p className={styles.errorTitle}>{COPY.errorTitle}</p>
            <p>{error}</p>
          </div>
        ) : null}
        {children}
        <div className={styles.actions}>
          <Button
            buttonStyle="primary"
            disabled={pending}
            margin={false}
            size="medium"
            type="submit"
          >
            {pending ? COPY.working : submitLabel}
          </Button>
        </div>
        <div aria-live="polite" role="status">
          {done ? <p className={styles.done}>{done}</p> : null}
        </div>
      </form>
      <ConfirmationModal
        body={confirmBody}
        cancelLabel={COPY.cancel}
        confirmLabel={submitLabel}
        confirmingLabel={COPY.working}
        heading={confirmHeading}
        modalSlug={modalSlug}
        onConfirm={send}
      />
    </>
  )
}
