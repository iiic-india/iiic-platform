'use client'

import { Button, toast, useConfig } from '@payloadcms/ui'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import styles from './Views.module.css'

type Copy = {
  export: string
  exportIntro: string
  code: string
  codeHint: string
  exportSubmit: string
  exported: string
  exportFailed: string
  offline: string
}

/**
 * The audit log as a CSV (docs/18 §6): the owner types their two-factor code, which the route
 * checks in the same request before it reads the log (a wrong code counts towards the lockout).
 * The filter shown on the page goes with it. A refusal shows as an error that takes focus.
 */
export function AuditExport({
  filter,
  copy,
}: {
  filter: Record<string, string | undefined>
  copy: Copy
}) {
  const {
    config: {
      routes: { api },
      serverURL,
    },
  } = useConfig()
  const errorRef = useRef<HTMLDivElement>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const form = event.currentTarget
    const code = String(new FormData(form).get('code') ?? '')
    setPending(true)
    setError(null)
    try {
      const response = await fetch(`${serverURL}${api}/admin-views/audit-log-csv`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...filter, code }),
      })
      if (response.ok) {
        const blob = await response.blob()
        const name =
          /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1] ??
          'audit-log.csv'
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = name
        link.click()
        URL.revokeObjectURL(url)
        form.reset()
        toast.success(copy.exported)
      } else {
        const answer = (await response.json().catch(() => ({}))) as { message?: string }
        setError(answer.message ?? copy.exportFailed)
      }
    } catch {
      setError(copy.offline)
    }
    setPending(false)
  }

  return (
    <form
      aria-labelledby="audit-export"
      className={styles.panel}
      onSubmit={(event) => void submit(event)}
    >
      <h3 className={styles.heading} id="audit-export">
        {copy.export}
      </h3>
      <p>{copy.exportIntro}</p>
      {error ? (
        <div className={styles.errorSummary} ref={errorRef} role="alert" tabIndex={-1}>
          <p>{error}</p>
        </div>
      ) : null}
      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="audit-code">
            {copy.code}
          </label>
          <input
            aria-describedby="audit-code-hint"
            autoComplete="one-time-code"
            className={styles.input}
            id="audit-code"
            inputMode="numeric"
            maxLength={8}
            name="code"
            pattern="[0-9 ]*"
            required
          />
          <p className={styles.hint} id="audit-code-hint">
            {copy.codeHint}
          </p>
        </div>
        <Button buttonStyle="primary" disabled={pending} size="medium" type="submit">
          {copy.exportSubmit}
        </Button>
      </div>
    </form>
  )
}
