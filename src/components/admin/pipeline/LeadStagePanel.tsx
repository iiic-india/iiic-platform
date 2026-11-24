'use client'

import { Button, toast, useConfig } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { type KeyboardEvent, useState } from 'react'

import { BOARD_COPY as COPY, LEAD_STAGE_COPY } from './copy'
import styles from './Pipeline.module.css'

type Props = {
  leadId: number
  moves: { value: string; label: string }[]
  /** The stages that need a reason (Lost, Closed). */
  reasonStages: string[]
}

/**
 * The lead page's "Move to stage". It sits inside the lead's own form, so it is not a form
 * itself: a labelled select, the reason when the stage needs one, and a button that calls the
 * board's endpoint. Enter in the reason moves the lead instead of saving the form. After the move
 * the page is read again and says where the lead went; a refusal is shown beside the button and
 * announced, and the choice stays.
 */
export function LeadStagePanel({ leadId, moves, reasonStages }: Props) {
  const {
    config: {
      routes: { api },
      serverURL,
    },
  } = useConfig()
  const router = useRouter()
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const needsReason = reasonStages.includes(to)
  const ids = {
    to: `lead-${leadId}-stage-to`,
    reason: `lead-${leadId}-stage-reason`,
    reasonHelp: `lead-${leadId}-stage-reason-help`,
    error: `lead-${leadId}-stage-error`,
  }

  async function move() {
    if (pending || !to) return
    setPending(true)
    setError(null)
    try {
      const response = await fetch(`${serverURL}${api}/pipeline/move`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, to, reason: needsReason ? reason : undefined }),
      })
      const body = (await response.json().catch(() => ({}))) as {
        message?: string
        label?: string
      }
      if (response.ok) {
        toast.success(LEAD_STAGE_COPY.moved(body.label ?? ''))
        setTo('')
        setReason('')
        setPending(false)
        router.refresh()
        return
      }
      setError(body.message ?? COPY.move.failed)
    } catch {
      setError(COPY.move.offline)
    }
    setPending(false)
  }

  function onReasonKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    void move()
  }

  return (
    <div className={styles.move}>
      <label className={styles.label} htmlFor={ids.to}>
        {COPY.move.label}
      </label>
      <select
        aria-describedby={error ? ids.error : undefined}
        aria-invalid={error ? true : undefined}
        className={styles.select}
        id={ids.to}
        onChange={(event) => setTo(event.target.value)}
        value={to}
      >
        <option value="">{COPY.move.choose}</option>
        {moves.map((move) => (
          <option key={move.value} value={move.value}>
            {move.label}
          </option>
        ))}
      </select>
      {needsReason ? (
        <>
          <label className={styles.label} htmlFor={ids.reason}>
            {COPY.move.reason}
          </label>
          <input
            aria-describedby={error ? `${ids.reasonHelp} ${ids.error}` : ids.reasonHelp}
            className={styles.input}
            id={ids.reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            onKeyDown={onReasonKey}
            required
            type="text"
            value={reason}
          />
          <p className={styles.hint} id={ids.reasonHelp}>
            {COPY.move.reasonHelp}
          </p>
        </>
      ) : null}
      <Button
        buttonStyle="secondary"
        disabled={pending || !to}
        margin={false}
        onClick={() => void move()}
        size="small"
        type="button"
      >
        {pending ? COPY.move.moving : COPY.move.submit}
      </Button>
      {error ? (
        <p className={styles.error} id={ids.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
