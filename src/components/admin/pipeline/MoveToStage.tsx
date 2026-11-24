'use client'

import { Button, useConfig } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'

import { BOARD_COPY as COPY } from './copy'
import styles from './Pipeline.module.css'

type Props = {
  leadId: number
  kind: string
  moves: { value: string; label: string }[]
  /** The stages that need a reason (Lost, Closed). */
  reasonStages: string[]
}

/**
 * "Move to stage" on a card (docs/17 §12 C): a labelled select and a button, a plain form that
 * works from the keyboard and needs no drag. The reason field appears, labelled, when the stage
 * chosen needs one. After the move the board is read again with the moved lead named in the
 * address, so the board puts the focus back on its card and announces where it went
 * (FocusMoved). A refusal is shown beside the button and announced; the choice stays.
 */
export function MoveToStage({ leadId, kind, moves, reasonStages }: Props) {
  const {
    config: {
      routes: { admin, api },
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
    to: `move-${leadId}-to`,
    reason: `move-${leadId}-reason`,
    reasonHelp: `move-${leadId}-reason-help`,
    error: `move-${leadId}-error`,
  }

  async function move(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
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
      const body = (await response.json().catch(() => ({}))) as { message?: string }
      if (response.ok) {
        router.replace(`${admin}/pipeline?kind=${kind}&moved=${leadId}`)
        router.refresh()
        return
      }
      setError(body.message ?? COPY.move.failed)
    } catch {
      setError(COPY.move.offline)
    }
    setPending(false)
  }

  return (
    <form className={styles.move} onSubmit={(event) => void move(event)}>
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
        size="small"
        type="submit"
      >
        {pending ? COPY.move.moving : COPY.move.submit}
      </Button>
      {error ? (
        <p className={styles.error} id={ids.error} role="alert">
          {error}
        </p>
      ) : null}
    </form>
  )
}
