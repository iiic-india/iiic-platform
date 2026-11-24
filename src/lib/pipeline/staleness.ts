import type { PayloadRequest, Where } from 'payload'

import type { LeadKind, LeadStage } from './stages'
import type { UntouchedLevel } from './values'

/**
 * How a lead that needs someone shows itself (docs/17 §7), as contracts for builder A: the
 * first-reply clock on a lead still in New (P3) and staleness on an active one (P4). Both are
 * worked out from the lead's own fields when it is read, so the board and Today show them without
 * waiting for a job; the alerts job only raises each event once for M6. The hours and days are
 * docs/05's and docs/06's; M6's automation settings may take them over.
 */

/** P3 (docs/05 Today: "amber after 24 h, red after 48 h"). */
export const UNTOUCHED_HOURS = { amber: 24, red: 48 } as const satisfies Record<
  UntouchedLevel,
  number
>

/** P4 (docs/05 Pipeline: "no activity in seven days in an active stage"). */
export const STALE_AFTER_DAYS = 7

/** What a lead's own fields say, for a lead not in a final stage. */
export type LeadHeat =
  | { state: 'fine' }
  | { state: 'untouched'; level: UntouchedLevel; since: Date } // in New, no one has acted
  | { state: 'stale'; since: Date } // active, quiet since its last activity

/**
 * A lead's heat at `now`: untouched while in New with no `touchedAt`, counted from `createdAt`;
 * stale in a STALE_STAGES stage once `lastActivityAt` (else `stageChangedAt`, else `createdAt`)
 * is seven days old; otherwise fine. A final stage is always fine.
 */
export type HeatOf = (
  lead: {
    kind: LeadKind
    stage: LeadStage
    createdAt: string
    touchedAt?: string | null
    stageChangedAt?: string | null
    lastActivityAt?: string | null
  },
  now: Date,
) => LeadHeat

/** The query for the leads stale at `now`, for the board's "Stale" view and Today (M5). */
export type StaleWhere = (now: Date) => Where

/**
 * The alerts job (`P3-P4-lead-alerts`): raises `lead.untouched` at amber and again at red, and
 * `lead.stale` once per quiet spell (keyed by the last activity it was raised for), recording
 * each in the lead's `alerts` so a second run raises nothing. Returns how many it raised.
 */
export type RaiseLeadAlerts = (
  req: PayloadRequest,
  now: Date,
) => Promise<{ untouched: number; stale: number }>
