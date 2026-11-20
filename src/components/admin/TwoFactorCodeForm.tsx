'use client'

import { Button } from '@payloadcms/ui'
import { useRef, useState, type FormEvent } from 'react'

import { isRecoveryCodeShape } from '@/lib/auth/recoveryCodeShape'
import { TWO_FACTOR_COPY as COPY } from '@/plugins/totpCopy'

import styles from './TwoFactor.module.css'

/** The two codes the two-factor views ask for. */
const KINDS = {
  code: {
    id: 'two-factor-code',
    label: COPY.codeLabel,
    // payload-totp's endpoints read `token`.
    key: 'token',
    inputMode: 'numeric',
    autoComplete: 'one-time-code',
    autoCapitalize: undefined,
    tidy: (value: string) => value.replace(/\s/g, ''),
    problem: (value: string) => (/^\d{6}$/.test(value) ? undefined : COPY.codeFormat),
    // A wrong code is selected, so the next one replaces it.
    selectOnError: true,
  },
  recovery: {
    id: 'recovery-code',
    label: COPY.recoveryLabel,
    key: 'code',
    inputMode: 'text',
    autoComplete: 'off',
    autoCapitalize: 'characters',
    tidy: (value: string) => value.trim(),
    problem: (value: string) => (isRecoveryCodeShape(value) ? undefined : COPY.recoveryFormat),
    // A recovery code stays as typed, so a slip can be corrected.
    selectOnError: false,
  },
} as const

type Props = {
  kind?: keyof typeof KINDS
  /** The endpoint for this step: payload-totp's verify or setup, or the recovery endpoint. */
  endpoint: string
  /** Where to go once the code is accepted: a path already checked (src/lib/auth/safeBack.ts). */
  next: string
  submitLabel: string
  buttonStyle?: 'primary' | 'secondary'
  /** Sent with the code while setting up: the new secret the QR code holds. */
  secret?: string
  /** Called with the response instead of moving on to `next`, when the page has a next step. */
  onAccepted?: (data: Record<string, unknown>) => void
}

/**
 * One labelled field for a code, in place of payload-totp's six unlabelled boxes (the kit's
 * single code field, src/brand/AUDIT.md #33). An error appears under the field and is read out,
 * and the field keeps focus. A code in the wrong form is caught here, so it does not count
 * towards the lockout.
 */
export function TwoFactorCodeForm({
  kind = 'code',
  endpoint,
  next,
  submitLabel,
  buttonStyle = 'primary',
  secret,
  onAccepted,
}: Props) {
  const settings = KINDS[kind]
  const errorId = `${settings.id}-error`
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(false)

  function fail(message: string) {
    setError(message)
    input.current?.focus()
    if (settings.selectOnError) input.current?.select()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const value = settings.tidy(input.current?.value ?? '')
    const problem = settings.problem(value)
    if (problem) return fail(problem)
    setError(undefined)
    setPending(true)
    let accepted = false
    let data: { ok?: boolean; message?: string } = {}
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [settings.key]: value, ...(secret ? { secret } : {}) }),
      })
      data = (await response.json().catch(() => ({}))) as typeof data
      accepted = response.ok && data.ok === true
      if (!accepted) fail(data.message ?? COPY.failed)
    } catch {
      fail(COPY.offline)
    } finally {
      if (!accepted) setPending(false)
    }
    if (!accepted) return
    if (onAccepted) return onAccepted(data)
    // A full load, so that the sign-in is read again.
    location.replace(next)
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className="field-type text">
        <label className="field-label" htmlFor={settings.id}>
          {settings.label}
        </label>
        <input
          ref={input}
          id={settings.id}
          name={settings.key}
          inputMode={settings.inputMode}
          autoComplete={settings.autoComplete}
          autoCapitalize={settings.autoCapitalize}
          spellCheck={false}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        {error ? (
          <p id={errorId} role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
      </div>
      <Button type="submit" buttonStyle={buttonStyle} disabled={pending}>
        {submitLabel}
      </Button>
    </form>
  )
}
