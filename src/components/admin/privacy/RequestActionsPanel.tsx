'use client'

import { Button, toast, useConfig } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import styles from './Privacy.module.css'
import { PRIVACY_COPY } from './privacyCopy'

const COPY = PRIVACY_COPY.actions

type PlanLine = { entity: string; count: number; why?: string }
type Plan = { deletes: PlanLine[]; keeps: PlanLine[] }

type Props = {
  requestId: number
  type: 'erasure' | 'access'
  status: string
  verified: boolean
  hasExport: boolean
  isOwner: boolean
}

/**
 * A privacy request's own actions, on its record (docs/05, Privacy; docs/18 §5): for an erasure,
 * the plan of what is deleted and kept, and an owner's Confirm erasure with the two-factor code;
 * for an access request, an owner makes the export with the code and downloads it. It sits inside
 * the record's form, so it is not a form itself. Nothing changes without the explicit button and
 * the code; the result is shown only once the server has answered.
 */
export function RequestActionsPanel({
  requestId,
  type,
  status,
  verified,
  hasExport,
  isOwner,
}: Props) {
  const {
    config: {
      routes: { api },
      serverURL,
    },
  } = useConfig()
  const router = useRouter()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const planHeading = useRef<HTMLHeadingElement>(null)
  const base = `${serverURL}${api}/privacy`

  useEffect(() => {
    if (plan) planHeading.current?.focus()
  }, [plan])

  async function post(path: string, body: Record<string, unknown>) {
    const response = await fetch(`${base}/${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    const result = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (!response.ok) throw new Error(String(result.message ?? PRIVACY_COPY.errors.failed))
    return result
  }

  async function run(work: () => Promise<void>) {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      await work()
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : PRIVACY_COPY.errors.failed)
    }
    setPending(false)
  }

  const showPlan = () =>
    run(async () => {
      const result = await post('erasure-plan', { requestId })
      setPlan(result.plan as Plan)
    })

  const confirm = () =>
    run(async () => {
      await post('confirm-erasure', { requestId, code })
      setCode('')
      toast.success(COPY.confirmed)
      router.refresh()
    })

  const makeExport = () =>
    run(async () => {
      await post('export', { requestId, code })
      setCode('')
      toast.success(COPY.exportMade)
      router.refresh()
    })

  const codeField = (
    <div className={styles.field}>
      <label className={styles.label} htmlFor="privacy-code">
        {COPY.code}
      </label>
      <input
        aria-describedby={error ? 'privacy-error' : undefined}
        aria-invalid={error ? true : undefined}
        autoComplete="one-time-code"
        className={styles.input}
        id="privacy-code"
        inputMode="numeric"
        maxLength={8}
        onChange={(event) => setCode(event.target.value)}
        value={code}
      />
    </div>
  )

  return (
    <section className={styles.panel} aria-labelledby="privacy-actions">
      <h2 className={styles.heading} id="privacy-actions">
        {type === 'erasure' ? COPY.title : COPY.exportTitle}
      </h2>
      {!verified ? (
        <p>{COPY.verifyFirst}</p>
      ) : type === 'erasure' ? (
        <>
          <Button
            buttonStyle="secondary"
            disabled={pending}
            margin={false}
            onClick={() => void showPlan()}
            size="medium"
            type="button"
          >
            {pending && !plan ? COPY.planning : COPY.plan}
          </Button>
          {plan ? (
            <div>
              <h3 id="privacy-plan" ref={planHeading} tabIndex={-1}>
                {COPY.deletes}
              </h3>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">{COPY.what}</th>
                    <th scope="col">{COPY.count}</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.deletes.map((line) => (
                    <tr key={line.entity}>
                      <th scope="row">{line.entity}</th>
                      <td data-label={COPY.count}>{line.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h3>{COPY.keeps}</h3>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">{COPY.what}</th>
                    <th scope="col">{COPY.count}</th>
                    <th scope="col">{COPY.why}</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.keeps.map((line) => (
                    <tr key={line.entity}>
                      <th scope="row">{line.entity}</th>
                      <td data-label={COPY.count}>{line.count}</td>
                      <td data-label={COPY.why}>{line.why}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {isOwner && status === 'awaitingOwner' ? (
            <div className={styles.panel}>
              <h3>{COPY.confirmTitle}</h3>
              <p className={styles.warning}>{COPY.confirmWarning}</p>
              <div className={styles.row}>
                {codeField}
                <Button
                  buttonStyle="primary"
                  disabled={pending || !plan || code.trim().length < 6}
                  margin={false}
                  onClick={() => void confirm()}
                  size="medium"
                  type="button"
                >
                  {pending ? COPY.working : COPY.confirm}
                </Button>
              </div>
              {!plan ? <p className={styles.hint}>{COPY.readPlanFirst}</p> : null}
            </div>
          ) : (
            <p className={styles.hint}>{COPY.ownerConfirms}</p>
          )}
        </>
      ) : (
        <>
          {hasExport ? (
            <p>
              {COPY.exportReady}{' '}
              <a href={`${base}/export-file?requestId=${requestId}&format=html`}>
                {COPY.downloadPage}
              </a>
              {' · '}
              <a href={`${base}/export-file?requestId=${requestId}&format=json`}>
                {COPY.downloadJson}
              </a>
            </p>
          ) : null}
          {isOwner ? (
            status === 'closed' ? null : (
              <>
                <p>{COPY.exportIntro}</p>
                <div className={styles.row}>
                  {codeField}
                  <Button
                    buttonStyle="primary"
                    disabled={pending || code.trim().length < 6}
                    margin={false}
                    onClick={() => void makeExport()}
                    size="medium"
                    type="button"
                  >
                    {pending ? COPY.working : COPY.exportMake}
                  </Button>
                </div>
              </>
            )
          ) : (
            <p className={styles.hint}>{COPY.exportOwnerOnly}</p>
          )}
        </>
      )}
      {error ? (
        <p className={styles.error} id="privacy-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}
