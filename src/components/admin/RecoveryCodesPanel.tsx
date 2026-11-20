'use client'

import { Button, ConfirmationModal, toast, useConfig, useModal } from '@payloadcms/ui'
import { useEffect, useRef, useState } from 'react'

import { TWO_FACTOR_COPY as COPY } from '@/plugins/totpCopy'

import { CopyButton } from './CopyButton'
import styles from './RecoveryCodes.module.css'

const MODAL = 'create-recovery-codes'

// VOICE.md: numbers one to nine in words in running text.
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

function unusedLine(unused: number): string {
  if (unused === 0) return COPY.codesNone
  const count = unused < WORDS.length ? WORDS[unused] : String(unused)
  const codes = unused === 1 ? 'recovery code' : 'recovery codes'
  return `You have ${count} unused ${codes}. Creating new codes cancels ${unused === 1 ? 'it' : 'them'}.`
}

/** The dashboard panel for recovery codes, built from Payload's admin components. */
export function RecoveryCodesPanel({ unused }: { unused: number }) {
  const {
    config: {
      routes: { api },
      serverURL,
    },
  } = useConfig()
  const { openModal } = useModal()
  const [codes, setCodes] = useState<string[] | null>(null)
  const [pending, setPending] = useState(false)
  const intro = useRef<HTMLParagraphElement>(null)

  // Once the codes appear, focus moves to the line above them, so they are read out next.
  useEffect(() => {
    if (codes) intro.current?.focus()
  }, [codes])

  // Never throws: the confirmation modal waits for it before it closes.
  async function create() {
    setPending(true)
    try {
      const response = await fetch(`${serverURL}${api}/users/recovery-codes`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = (await response.json().catch(() => ({}))) as {
        codes?: string[]
        message?: string
      }
      if (response.ok && data.codes) setCodes(data.codes)
      else toast.error(data.message ?? COPY.codesNotCreated)
    } catch {
      toast.error(COPY.offline)
    } finally {
      setPending(false)
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="recovery-codes-heading">
      <h2 id="recovery-codes-heading" className={styles.heading}>
        {COPY.codesHeading}
      </h2>
      {codes ? (
        <>
          <p ref={intro} tabIndex={-1}>
            {COPY.codesSave}
          </p>
          <ol className={styles.codes}>
            {codes.map((code) => (
              <li key={code}>
                <code>{code}</code>
              </li>
            ))}
          </ol>
          <CopyButton value={codes.join('\n')} label={COPY.copyCodes} copied={COPY.codesCopied} />
        </>
      ) : (
        <>
          <p>{unusedLine(unused)}</p>
          {unused === 0 ? (
            <Button disabled={pending} onClick={create}>
              {COPY.createCodes}
            </Button>
          ) : (
            <>
              {/* Replacing a set cancels the codes someone may have saved, so it asks first. */}
              <Button buttonStyle="secondary" disabled={pending} onClick={() => openModal(MODAL)}>
                {COPY.createNewCodes}
              </Button>
              <ConfirmationModal
                modalSlug={MODAL}
                heading={COPY.newCodesHeading}
                body={COPY.newCodesBody}
                confirmLabel={COPY.createNewCodes}
                cancelLabel={COPY.cancel}
                onConfirm={create}
              />
            </>
          )}
        </>
      )}
    </section>
  )
}
