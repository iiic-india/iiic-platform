'use client'

import { Button } from '@payloadcms/ui'
import { useRef, useState, type FormEvent } from 'react'

import { TWO_FACTOR_COPY as COPY } from '@/plugins/totpCopy'

import styles from './TwoFactor.module.css'

type Props = {
  /** payload-totp's endpoint for this step: `/api/verify-totp` or `/api/setup-totp`. */
  endpoint: string
  /** Where to go once the code is accepted: a path already checked (src/lib/auth/safeBack.ts). */
  next: string
  submitLabel: string
  /** Sent with the code while setting up: the new secret the QR code holds. */
  secret?: string
}

const FIELD = 'two-factor-code'
const ERROR = 'two-factor-code-error'

/**
 * One labelled field for the six-digit code, in place of payload-totp's six unlabelled boxes
 * (the kit's single code field, src/brand/AUDIT.md #33). An error appears under the field and
 * is read out, and the field keeps focus with its text selected, so the next code replaces it.
 */
export function TwoFactorCodeForm({ endpoint, next, submitLabel, secret }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string>()
  // A new key each time, so the same message is read out again.
  const [attempt, setAttempt] = useState(0)
  const [pending, setPending] = useState(false)

  function fail(message: string) {
    setError(message)
    setAttempt((count) => count + 1)
    input.current?.focus()
    input.current?.select()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const token = (input.current?.value ?? '').replace(/\s/g, '')
    // Checked here first, so a mistyped code does not count towards the lockout.
    if (!/^\d{6}$/.test(token)) return fail(COPY.codeFormat)
    setError(undefined)
    setPending(true)
    let accepted = false
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(secret ? { token, secret } : { token }),
      })
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string }
      accepted = response.ok && data.ok === true
      if (!accepted) fail(data.message ?? COPY.failed)
    } catch {
      fail(COPY.offline)
    } finally {
      if (!accepted) setPending(false)
    }
    // A full load, so that the sign-in is read again with the code.
    if (accepted) location.replace(next)
  }

  return (
    <form className={styles.form} method="post" onSubmit={submit} noValidate>
      <div className="field-type text">
        <label className="field-label" htmlFor={FIELD}>
          {COPY.codeLabel}
        </label>
        <input
          ref={input}
          id={FIELD}
          name="token"
          inputMode="numeric"
          autoComplete="one-time-code"
          spellCheck={false}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? ERROR : undefined}
        />
        {error ? (
          <p key={attempt} id={ERROR} role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
      </div>
      <Button type="submit" disabled={pending}>
        {submitLabel}
      </Button>
    </form>
  )
}
