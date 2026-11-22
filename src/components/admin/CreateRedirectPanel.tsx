'use client'

import { Button, toast, useConfig } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import styles from './CreateRedirect.module.css'
import { REDIRECTS_COPY as COPY } from './redirectsCopy'

type Props = { id: number | string; path: string; suggestions: string[] }

/**
 * "Create redirect" for one 404 log entry: the page to send visitors to, and one button that
 * makes the redirect and marks the entry resolved (src/lib/redirects/createFromMissing.ts). It
 * sits inside the entry's form, so it is not a form itself: Enter in the field creates the
 * redirect rather than saving the entry. Afterwards it returns to the list, where the entry shows
 * as redirected.
 */
export function CreateRedirectPanel({ id, path, suggestions }: Props) {
  const {
    config: {
      routes: { admin, api },
      serverURL,
    },
  } = useConfig()
  const router = useRouter()
  const [to, setTo] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    if (pending || !to.trim()) return
    setPending(true)
    setError(null)
    try {
      const response = await fetch(`${serverURL}${api}/missing-pages/${id}/redirect`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: to.trim() }),
      })
      const body = (await response.json().catch(() => ({}))) as { message?: string }
      if (response.ok) {
        toast.success(COPY.created)
        router.push(`${admin}/collections/missing-pages`)
        return
      }
      setError(body.message ?? COPY.failed)
    } catch {
      setError(COPY.offline)
    }
    setPending(false)
  }

  return (
    <section className={styles.panel} aria-labelledby="create-redirect-heading">
      <h2 className={styles.heading} id="create-redirect-heading">
        {COPY.heading}
      </h2>
      <p className={styles.intro}>{COPY.intro(path)}</p>
      <label className={styles.label} htmlFor="create-redirect-to">
        {COPY.label}
      </label>
      <div className={styles.row}>
        <input
          aria-describedby={
            error ? 'create-redirect-hint create-redirect-error' : 'create-redirect-hint'
          }
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          className={styles.input}
          id="create-redirect-to"
          list="create-redirect-pages"
          onChange={(event) => setTo(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            void create()
          }}
          spellCheck={false}
          type="text"
          value={to}
        />
        <Button
          buttonStyle="primary"
          disabled={pending || !to.trim()}
          margin={false}
          onClick={() => void create()}
          size="medium"
          type="button"
        >
          {pending ? COPY.creating : COPY.create}
        </Button>
      </div>
      <datalist id="create-redirect-pages">
        {suggestions.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
      <p className={styles.hint} id="create-redirect-hint">
        {COPY.hint}
      </p>
      {error ? (
        <p className={styles.error} id="create-redirect-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}
