'use client'

import { Button, toast } from '@payloadcms/ui'
import { useState, type FormEvent } from 'react'

import styles from './VerifyTwoFactor.module.css'

type Props = { adminRoute: string; apiRoute: string; back?: string; serverURL: string }

/** Only a path inside the admin, so the page cannot be used to send someone elsewhere. */
function safeBack(back: string | undefined, adminRoute: string): string {
  return back?.startsWith(adminRoute) && !back.startsWith('//') ? back : adminRoute
}

/**
 * The code form and, behind "Lost your authenticator?", the recovery-code form. Built from
 * Payload's admin Button and field styles.
 */
export function VerifyTwoFactorForms({ adminRoute, apiRoute, back, serverURL }: Props) {
  const [pending, setPending] = useState(false)

  async function post(path: string, body: Record<string, string>) {
    const response = await fetch(`${serverURL}${apiRoute}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string }
    return { ok: response.ok && data.ok !== false, message: data.message }
  }

  async function submit(
    event: FormEvent<HTMLFormElement>,
    send: (value: string) => Promise<{ ok: boolean; message?: string }>,
    next: string,
  ) {
    event.preventDefault()
    const form = event.currentTarget
    const value = String(new FormData(form).get('value') ?? '').trim()
    setPending(true)
    const result = await send(value)
    if (result.ok) {
      // A full load, so that the sign-in is read again with the code.
      location.replace(next)
      return
    }
    toast.error(result.message ?? 'That did not work. Try again.')
    form.reset()
    setPending(false)
  }

  return (
    <div className={styles.forms}>
      <form
        onSubmit={(event) =>
          submit(event, (token) => post('/verify-totp', { token }), safeBack(back, adminRoute))
        }
      >
        <div className="field-type text">
          <label className="field-label" htmlFor="two-factor-code">
            Code
          </label>
          <input
            id="two-factor-code"
            name="value"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            pattern="\d{6}"
            required
          />
        </div>
        <Button type="submit" disabled={pending}>
          Sign in
        </Button>
      </form>

      <details className={styles.recovery}>
        <summary>Lost your authenticator?</summary>
        <p>
          Use one of the recovery codes you saved. Each works once, and you then set up a new
          authenticator.
        </p>
        <form
          onSubmit={(event) =>
            submit(
              event,
              (code) => post('/users/recover-two-factor', { code }),
              `${adminRoute}/setup-totp`,
            )
          }
        >
          <div className="field-type text">
            <label className="field-label" htmlFor="recovery-code">
              Recovery code
            </label>
            <input
              id="recovery-code"
              name="value"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
            />
          </div>
          <Button type="submit" buttonStyle="secondary" disabled={pending}>
            Use recovery code
          </Button>
        </form>
      </details>
    </div>
  )
}
