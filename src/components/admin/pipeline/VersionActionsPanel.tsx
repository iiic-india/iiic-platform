'use client'

import { Button, toast, useConfig } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { CopyButton } from '../CopyButton'
import { VERSION_PANEL_COPY as COPY } from './copy'
import styles from './Pipeline.module.css'

type Props = {
  versionId: number
  isOffice: boolean
  /** This version's link is the one the client holds, and it opens. */
  linkOpen: boolean
  /** The proposal has not been answered, so a version can still go out. */
  sendable: boolean
}

type Refusal = { message: string; details: string[] }

/**
 * The buttons on a version: preview, the PDF, send, withdraw the link. After a send the link is
 * shown once, with a copy button, for the office to pass on if the email did not go: it is not
 * stored anywhere, so a reload loses it (docs/17 §5). The panel sits inside the record's form, so
 * each action is a button, not a form.
 */
export function VersionActionsPanel({ versionId, isOffice, linkOpen, sendable }: Props) {
  const {
    config: {
      routes: { api },
      serverURL,
    },
  } = useConfig()
  const router = useRouter()
  const [pending, setPending] = useState<'send' | 'withdraw' | null>(null)
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const [sent, setSent] = useState<{ linkUrl: string; mailed: boolean } | null>(null)
  const result = useRef<HTMLDivElement>(null)
  const base = `${serverURL}${api}/proposal-versions/${versionId}`

  // The outcome of a send takes the focus, so it is read out and the link is at hand.
  useEffect(() => {
    if (sent) result.current?.focus()
  }, [sent])

  async function call(action: 'send' | 'withdraw') {
    if (pending) return
    setPending(action)
    setRefusal(null)
    try {
      const response = await fetch(`${base}/${action}`, { method: 'POST', credentials: 'include' })
      const body = (await response.json().catch(() => ({}))) as {
        message?: string
        details?: string[]
        linkUrl?: string
        mailed?: boolean
      }
      if (response.ok) {
        if (action === 'send' && body.linkUrl) {
          // No refresh here: the link lives only in this answer, so the panel keeps it in view.
          setSent({ linkUrl: body.linkUrl, mailed: body.mailed === true })
          toast.success(COPY.sent)
        } else {
          toast.success(COPY.withdrawn)
          router.refresh()
        }
        setPending(null)
        return
      }
      setRefusal({
        message: body.message ?? COPY.failed,
        details: Array.isArray(body.details) ? body.details : [],
      })
    } catch {
      setRefusal({ message: COPY.offline, details: [] })
    }
    setPending(null)
  }

  return (
    <>
      <div className={styles.panelRow}>
        <a href={`${base}/preview`} rel="noopener" target="_blank">
          {COPY.preview}
        </a>
        <a href={`${base}/pdf`} rel="noopener" target="_blank">
          {COPY.pdf}
        </a>
        <span className={styles.hint}>{COPY.openHelp}</span>
      </div>
      {isOffice && sendable ? (
        <div className={styles.panelRow}>
          <Button
            buttonStyle="primary"
            disabled={pending !== null}
            margin={false}
            onClick={() => void call('send')}
            size="medium"
            type="button"
          >
            {pending === 'send' ? COPY.sending : COPY.send}
          </Button>
          <span className={styles.hint}>{COPY.sendHelp}</span>
        </div>
      ) : null}
      {isOffice && linkOpen ? (
        <div className={styles.panelRow}>
          <Button
            buttonStyle="secondary"
            disabled={pending !== null}
            margin={false}
            onClick={() => void call('withdraw')}
            size="medium"
            type="button"
          >
            {pending === 'withdraw' ? COPY.withdrawing : COPY.withdraw}
          </Button>
          <span className={styles.hint}>{COPY.withdrawHelp}</span>
        </div>
      ) : null}
      {refusal ? (
        <div className={styles.error} role="alert">
          <p className={styles.error}>{refusal.message}</p>
          {refusal.details.length > 0 ? (
            <ul>
              {refusal.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {sent ? (
        <div aria-labelledby="version-sent-heading" ref={result} role="region" tabIndex={-1}>
          <h3 id="version-sent-heading">{COPY.sent}</h3>
          <p>{sent.mailed ? COPY.mailed : COPY.notMailed}</p>
          <p className={styles.label}>{COPY.link}</p>
          <p className={styles.link}>{sent.linkUrl}</p>
          <p className={styles.hint}>{COPY.linkHelp}</p>
          <CopyButton copied={COPY.copied} label={COPY.copy} value={sent.linkUrl} />
        </div>
      ) : null}
    </>
  )
}
