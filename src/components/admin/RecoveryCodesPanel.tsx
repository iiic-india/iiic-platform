'use client'

import { Button, CopyToClipboard, toast, useConfig } from '@payloadcms/ui'
import { useState } from 'react'

import styles from './RecoveryCodes.module.css'

// VOICE.md: numbers one to nine in words in running text.
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

function unusedLine(unused: number): string {
  if (unused === 0) {
    return 'If you lose your authenticator, a recovery code lets you sign in once and set up a new one. You have none yet.'
  }
  const count = unused < WORDS.length ? WORDS[unused] : String(unused)
  const codes = unused === 1 ? 'recovery code' : 'recovery codes'
  return `You have ${count} unused ${codes}. Creating new codes cancels them.`
}

/** The dashboard panel for recovery codes, built from Payload's admin components. */
export function RecoveryCodesPanel({ unused }: { unused: number }) {
  const {
    config: {
      routes: { api },
      serverURL,
    },
  } = useConfig()
  const [codes, setCodes] = useState<string[] | null>(null)
  const [pending, setPending] = useState(false)

  async function create() {
    setPending(true)
    const response = await fetch(`${serverURL}${api}/users/recovery-codes`, {
      method: 'POST',
      credentials: 'include',
    })
    const data = (await response.json().catch(() => ({}))) as {
      codes?: string[]
      message?: string
    }
    setPending(false)
    if (response.ok && data.codes) setCodes(data.codes)
    else toast.error(data.message ?? 'No codes were created. Try again.')
  }

  return (
    <section className={styles.panel} aria-labelledby="recovery-codes-heading">
      <h2 id="recovery-codes-heading" className={styles.heading}>
        Recovery codes
      </h2>
      {codes ? (
        <>
          <p>
            Save these codes somewhere safe now: they are shown only this once. Each works once.
          </p>
          <ol className={styles.codes}>
            {codes.map((code) => (
              <li key={code}>
                <code>{code}</code>
              </li>
            ))}
          </ol>
          <CopyToClipboard value={codes.join('\n')} />
        </>
      ) : (
        <>
          <p>{unusedLine(unused)}</p>
          <Button
            buttonStyle={unused === 0 ? 'primary' : 'secondary'}
            disabled={pending}
            onClick={create}
          >
            {unused === 0 ? 'Create recovery codes' : 'Create new codes'}
          </Button>
        </>
      )}
    </section>
  )
}
