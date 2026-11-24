'use client'

import { useEffect, useRef, useState } from 'react'

import { cancelAction, manageTimesAction, rescheduleAction } from '@/lib/bookingFlow/actions'
import { whenOf } from '@/lib/bookingFlow/format'
import { formatRupees } from '@/lib/bookingFlow/review'

import { CONFIRMED_COPY, errorMessage, FLOW_COPY, MANAGE_COPY } from './copy'
import { TimePicker, type SlotDays } from './TimePicker'

type Mode = 'view' | 'reschedule' | 'cancel' | 'moved' | 'cancelled'

/** The refund a cancellation would give now, as the page may show it (D-21: no amount while hidden). */
export type RefundPreview =
  | { kind: 'nothing-paid' }
  | { kind: 'none' }
  | { kind: 'amount'; paise: number; awaitsOwner: boolean }
  | { kind: 'some'; awaitsOwner: boolean }

/**
 * Moving and cancelling a booking by its manage link (docs/03 F4; D-16). What the person may do
 * is the server's answer (the reschedule window, the refund rule); the refund is shown before
 * they confirm a cancellation (docs/05, Refund), and "Keep my booking" has the same size and
 * weight as the cancel button (docs/08 §5).
 */
export function ManageBooking({
  token,
  canReschedule,
  canCancel,
  refund,
}: {
  token: string
  canReschedule: boolean
  canCancel: boolean
  refund: RefundPreview
}) {
  const [mode, setMode] = useState<Mode>('view')
  const [days, setDays] = useState<SlotDays | null>(null)
  const [day, setDay] = useState<string | null>(null)
  const [startsAt, setStartsAt] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [moved, setMoved] = useState<{ startsAt: string | null; token: string | null } | null>(null)
  const [cancelled, setCancelled] = useState<{
    refundPaise: number | null
    refunded: boolean
    awaitsOwner: boolean
  } | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (mode !== 'view') heading.current?.focus()
  }, [mode])

  async function openReschedule() {
    setMode('reschedule')
    setProblem(null)
    setDays(null)
    const answer = await manageTimesAction({ token })
    if (answer.ok) {
      setDays(answer.value.days)
      setDay(answer.value.days[0]?.day ?? null)
      if (!answer.value.days.length) setProblem(FLOW_COPY.noTimes)
    } else {
      setDays([])
      setProblem(errorMessage(answer.error.code))
    }
  }

  async function confirmMove() {
    if (!startsAt) {
      setProblem(FLOW_COPY.chooseTime)
      return
    }
    setBusy(true)
    const answer = await rescheduleAction({ token, startsAt })
    setBusy(false)
    if (!answer.ok) {
      setProblem(errorMessage(answer.error.code))
      return
    }
    setMoved({ startsAt: answer.value.startsAt, token: answer.value.manageToken })
    setMode('moved')
  }

  async function confirmCancel() {
    setBusy(true)
    const answer = await cancelAction({ token, reason: reason.trim() || undefined })
    setBusy(false)
    if (!answer.ok) {
      setProblem(errorMessage(answer.error.code))
      return
    }
    setCancelled({
      refundPaise: answer.value.refundPaise,
      refunded: answer.value.refunded,
      awaitsOwner: answer.value.refundAwaitsOwner,
    })
    setMode('cancelled')
  }

  if (mode === 'moved' && moved) {
    return (
      <div className="iiic-panel">
        <h2 ref={heading} tabIndex={-1}>
          {MANAGE_COPY.rescheduled(moved.startsAt ? whenOf(moved.startsAt) : '')}
        </h2>
        {moved.token ? (
          <p>
            <a className="iiic-link" href={`/b/${moved.token}`}>
              {MANAGE_COPY.newLink}
            </a>
            <br />
            <span className="iiic-type-small">{CONFIRMED_COPY.manageHelp}</span>
          </p>
        ) : null}
      </div>
    )
  }

  if (mode === 'cancelled' && cancelled) {
    return (
      <div className="iiic-panel">
        <h2 ref={heading} tabIndex={-1}>
          {MANAGE_COPY.cancelled}
        </h2>
        {cancelled.refunded ? (
          <p>
            {cancelled.refundPaise !== null
              ? MANAGE_COPY.refundAmount(formatRupees(cancelled.refundPaise))
              : MANAGE_COPY.refundSome}{' '}
            {cancelled.awaitsOwner ? MANAGE_COPY.refundOwner : MANAGE_COPY.refundSent}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div>
      {problem ? (
        <div className="iiic-alert iiic-alert-yellow" role="alert">
          {problem}
        </div>
      ) : null}

      {mode === 'view' ? (
        <div className="iiic-row">
          {canReschedule ? (
            <button className="iiic-btn iiic-btn-primary" type="button" onClick={openReschedule}>
              {MANAGE_COPY.reschedule}
            </button>
          ) : null}
          {canCancel ? (
            <button
              className="iiic-btn iiic-btn-secondary"
              type="button"
              onClick={() => {
                setProblem(null)
                setMode('cancel')
              }}
            >
              {MANAGE_COPY.cancel}
            </button>
          ) : null}
        </div>
      ) : null}

      {mode === 'reschedule' ? (
        <div className="iiic-panel">
          <h2 ref={heading} tabIndex={-1}>
            {MANAGE_COPY.rescheduleHeading}
          </h2>
          {days === null ? (
            <p className="iiic-skeleton" role="status">
              {FLOW_COPY.loadingTimes}
            </p>
          ) : days.length ? (
            <TimePicker
              days={days}
              day={day}
              startsAt={startsAt}
              onDay={(value) => {
                setDay(value)
                setStartsAt(null)
              }}
              onTime={setStartsAt}
            />
          ) : null}
          <div className="iiic-row">
            <button
              className="iiic-btn iiic-btn-secondary"
              type="button"
              onClick={() => setMode('view')}
            >
              {FLOW_COPY.back}
            </button>
            <button
              className={`iiic-btn iiic-btn-primary${busy ? ' is-loading' : ''}`}
              type="button"
              aria-busy={busy || undefined}
              onClick={confirmMove}
            >
              {MANAGE_COPY.rescheduleConfirm}
            </button>
          </div>
        </div>
      ) : null}

      {mode === 'cancel' ? (
        <div className="iiic-panel">
          <h2 ref={heading} tabIndex={-1}>
            {MANAGE_COPY.cancelHeading}
          </h2>
          <p>
            {refund.kind === 'nothing-paid'
              ? MANAGE_COPY.nothingPaid
              : refund.kind === 'none'
                ? MANAGE_COPY.noRefund
                : refund.kind === 'amount'
                  ? MANAGE_COPY.refundAmount(formatRupees(refund.paise))
                  : MANAGE_COPY.refundSome}
          </p>
          {(refund.kind === 'amount' || refund.kind === 'some') && refund.awaitsOwner ? (
            <p className="iiic-type-small">{MANAGE_COPY.refundOwner}</p>
          ) : null}
          <div className="iiic-field-wrap">
            <label className="iiic-label" htmlFor="manage-reason">
              {MANAGE_COPY.reasonLabel} {FLOW_COPY.optional}
            </label>
            <textarea
              className="iiic-field"
              id="manage-reason"
              rows={3}
              maxLength={1000}
              value={reason}
              aria-describedby="manage-reason-help"
              onChange={(change) => setReason(change.currentTarget.value)}
            />
            <div className="iiic-help" id="manage-reason-help">
              {MANAGE_COPY.reasonHelp}
            </div>
          </div>
          <div className="iiic-row">
            <button
              className="iiic-btn iiic-btn-secondary"
              type="button"
              onClick={() => setMode('view')}
            >
              {MANAGE_COPY.keep}
            </button>
            <button
              className={`iiic-btn iiic-btn-primary${busy ? ' is-loading' : ''}`}
              type="button"
              aria-busy={busy || undefined}
              onClick={confirmCancel}
            >
              {MANAGE_COPY.cancelConfirm}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
