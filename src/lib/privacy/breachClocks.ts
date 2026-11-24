import { addHours } from 'date-fns'

import { BOARD_REPORT_WITHIN_HOURS, CERT_IN_WITHIN_HOURS, type ClockState } from './breaches'
import type { IncidentClocks } from './breaches'

const HOUR_MS = 60 * 60 * 1000

/** CERT-In's 6 hours and the Data Protection Board's 72, from detection (docs/18 §5). Pure. */
export const incidentClocks: IncidentClocks = (detectedAt) => ({
  certInBy: addHours(detectedAt, CERT_IN_WITHIN_HOURS),
  boardBy: addHours(detectedAt, BOARD_REPORT_WITHIN_HOURS),
})

type Instant = Date | string | null | undefined

const instant = (value: Instant): Date | undefined => {
  if (!value) return undefined
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/**
 * One clock at a moment (pure): done once its step has a time, early or late; otherwise running
 * with the whole hours left (rounded down, so "0 hours left" means under an hour), or overdue with
 * the whole hours late (rounded up). A clock without a deadline, or whose step does not apply (a
 * breach that is not reportable to CERT-In), is not applicable. Shown as words, never by colour
 * alone (docs/18 §5).
 */
export function clockState(
  clock: { dueAt?: Instant; doneAt?: Instant; applies?: boolean },
  now: Date,
): ClockState {
  if (clock.applies === false) return { state: 'not-applicable' }
  const doneAt = instant(clock.doneAt)
  if (doneAt) return { state: 'done', at: doneAt }
  const dueAt = instant(clock.dueAt)
  if (!dueAt) return { state: 'not-applicable' }
  const left = dueAt.getTime() - now.getTime()
  return left > 0
    ? { state: 'running', dueAt, hoursLeft: Math.floor(left / HOUR_MS) }
    : { state: 'overdue', dueAt, hoursLate: Math.ceil((now.getTime() - dueAt.getTime()) / HOUR_MS) }
}

/** What a privacy request's clocks read from (the stored document's fields). */
export type RequestClockFields = {
  acknowledgeBy?: Instant
  resolveBy?: Instant
  acknowledgedAt?: Instant
  resolution?: { closedAt?: Instant } | null
}

/**
 * A request's two clocks (docs/18 §5): acknowledgement stops when it is acknowledged, or when the
 * request is closed without one; resolution stops when it is closed.
 */
export function requestClocks(
  request: RequestClockFields,
  now: Date,
): { acknowledge: ClockState; resolve: ClockState } {
  const closedAt = request.resolution?.closedAt
  return {
    acknowledge: clockState(
      { dueAt: request.acknowledgeBy, doneAt: request.acknowledgedAt ?? closedAt },
      now,
    ),
    resolve: clockState({ dueAt: request.resolveBy, doneAt: closedAt }, now),
  }
}

/** What an incident's clocks read from (the stored document's fields). */
export type IncidentClockFields = {
  status?: string | null
  personalData?: { affected?: boolean | null } | null
  certIn?: { reportable?: boolean | null; dueAt?: Instant; reportedAt?: Instant } | null
  board?: { dueAt?: Instant; detailedReportAt?: Instant } | null
}

/**
 * An incident's two clocks (docs/18 §5): CERT-In's, when it is marked a listed incident, until it
 * is reported; the Board's, when personal data was affected, until the detailed report is sent.
 * An incident whose box is not ticked shows its clock as not applicable, and the Privacy view says
 * so in words, so an open incident nobody has assessed is still visible (the runbook asks for the
 * assessment within the first hour).
 */
export function incidentClockStates(
  incident: IncidentClockFields,
  now: Date,
): { certIn: ClockState; board: ClockState } {
  return {
    certIn: clockState(
      {
        applies: incident.certIn?.reportable === true,
        dueAt: incident.certIn?.dueAt,
        doneAt: incident.certIn?.reportedAt,
      },
      now,
    ),
    board: clockState(
      {
        applies: incident.personalData?.affected === true,
        dueAt: incident.board?.dueAt,
        doneAt: incident.board?.detailedReportAt,
      },
      now,
    ),
  }
}
