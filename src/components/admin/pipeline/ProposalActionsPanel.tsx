'use client'

import { Button, toast, useConfig } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

import { PROPOSAL_PANEL_COPY as COPY } from './copy'
import styles from './Pipeline.module.css'

type Props = {
  proposalId: number
  isOffice: boolean
  feesMayPrint: boolean
  /** The client has it and may still answer (PROPOSAL_MOVES). */
  answerable: boolean
}

type Refusal = { message: string; details: string[] }

/** What an endpoint said when it said no, as the admin shows it. */
async function refusalOf(response: Response, fallback: string): Promise<Refusal> {
  const body = (await response.json().catch(() => ({}))) as { message?: string; details?: string[] }
  return {
    message: body.message ?? fallback,
    details: Array.isArray(body.details) ? body.details : [],
  }
}

function RefusalNote({ id, refusal }: { id: string; refusal: Refusal | null }) {
  if (!refusal) return null
  return (
    <div className={styles.error} id={id} role="alert">
      <p className={styles.error}>{refusal.message}</p>
      {refusal.details.length > 0 ? (
        <ul>
          {refusal.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/**
 * The buttons on a proposal: preview the working copy, create a version, record the client's
 * answer. It sits inside the proposal's own form, so it is not a form itself; each action is a
 * button that calls its endpoint, and a refusal is shown beside it and announced.
 */
export function ProposalActionsPanel({ proposalId, isOffice, feesMayPrint, answerable }: Props) {
  const {
    config: {
      routes: { admin, api },
      serverURL,
    },
  } = useConfig()
  const router = useRouter()
  const [pending, setPending] = useState<'version' | 'answer' | null>(null)
  const [versionRefusal, setVersionRefusal] = useState<Refusal | null>(null)
  const [answerRefusal, setAnswerRefusal] = useState<Refusal | null>(null)
  const [answer, setAnswer] = useState<'accepted' | 'declined' | ''>('')
  const [note, setNote] = useState('')
  const answerGroup = useRef<HTMLFieldSetElement>(null)
  const base = `${serverURL}${api}/proposals/${proposalId}`

  async function createVersion() {
    if (pending) return
    setPending('version')
    setVersionRefusal(null)
    try {
      const response = await fetch(`${base}/versions`, { method: 'POST', credentials: 'include' })
      if (response.ok) {
        const body = (await response.json()) as { id: number; number: number }
        toast.success(COPY.created(body.number))
        router.push(`${admin}/collections/proposal-versions/${body.id}`)
        return
      }
      setVersionRefusal(await refusalOf(response, COPY.failed))
    } catch {
      setVersionRefusal({ message: COPY.offline, details: [] })
    }
    setPending(null)
  }

  async function recordAnswer() {
    if (pending) return
    if (!answer) {
      answerGroup.current?.querySelector('input')?.focus()
      return
    }
    setPending('answer')
    setAnswerRefusal(null)
    try {
      const response = await fetch(`${base}/answer`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer, note: note.trim() || undefined }),
      })
      if (response.ok) {
        toast.success(COPY.answer.recorded)
        router.refresh()
        setPending(null)
        return
      }
      setAnswerRefusal(await refusalOf(response, COPY.failed))
    } catch {
      setAnswerRefusal({ message: COPY.offline, details: [] })
    }
    setPending(null)
  }

  return (
    <>
      {feesMayPrint ? (
        <div className={styles.panelRow}>
          <a href={`${base}/preview`} rel="noopener" target="_blank">
            {COPY.previewDraft}
          </a>
          <span className={styles.hint}>{COPY.previewHelp}</span>
        </div>
      ) : null}
      {isOffice ? (
        <div className={styles.panelRow}>
          <Button
            aria-describedby="proposal-create-help"
            buttonStyle="primary"
            disabled={pending !== null}
            margin={false}
            onClick={() => void createVersion()}
            size="medium"
            type="button"
          >
            {pending === 'version' ? COPY.creating : COPY.createVersion}
          </Button>
          <span className={styles.hint} id="proposal-create-help">
            {COPY.createHelp}
          </span>
          <RefusalNote id="proposal-create-error" refusal={versionRefusal} />
        </div>
      ) : null}
      {isOffice && answerable ? (
        <fieldset className={styles.fieldset} ref={answerGroup}>
          <legend>{COPY.answer.heading}</legend>
          <p className={styles.hint}>{COPY.answer.help}</p>
          <div role="radiogroup" aria-label={COPY.answer.choose}>
            {(['accepted', 'declined'] as const).map((value) => (
              <label className={styles.radio} key={value}>
                <input
                  checked={answer === value}
                  name={`proposal-${proposalId}-answer`}
                  onChange={() => setAnswer(value)}
                  type="radio"
                  value={value}
                />
                {COPY.answer[value]}
              </label>
            ))}
          </div>
          <label className={styles.label} htmlFor="proposal-answer-note">
            {COPY.answer.note}
          </label>
          <textarea
            aria-describedby="proposal-answer-note-help"
            className={styles.textarea}
            id="proposal-answer-note"
            maxLength={1000}
            onChange={(event) => setNote(event.target.value)}
            value={note}
          />
          <p className={styles.hint} id="proposal-answer-note-help">
            {COPY.answer.noteHelp}
          </p>
          <div>
            <Button
              buttonStyle="secondary"
              disabled={pending !== null || !answer}
              margin={false}
              onClick={() => void recordAnswer()}
              size="medium"
              type="button"
            >
              {pending === 'answer' ? COPY.answer.recording : COPY.answer.submit}
            </Button>
          </div>
          <RefusalNote id="proposal-answer-error" refusal={answerRefusal} />
        </fieldset>
      ) : null}
    </>
  )
}
