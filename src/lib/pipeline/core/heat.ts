import type { Where } from 'payload'

import {
  STALE_STAGES,
  UNTOUCHED_STAGE,
  type LeadKind,
  type LeadStage,
} from '../stages'
import {
  STALE_AFTER_DAYS,
  UNTOUCHED_HOURS,
  type HeatOf,
  type LeadHeat,
  type StaleWhere,
} from '../staleness'

/**
 * Untouched and stale leads, worked out from a lead's own fields when it is read (docs/17 §7;
 * src/lib/pipeline/staleness.ts), so the board and Today show them at once. Pure, and free of
 * `server-only`.
 */

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function instant(value: string | null | undefined): Date | null {
  if (!value) return null
  const at = new Date(value)
  return Number.isNaN(at.getTime()) ? null : at
}

/** The time a lead's quiet spell is counted from: its last activity, else its move, else its making. */
export function quietSince(lead: {
  createdAt: string
  stageChangedAt?: string | null
  lastActivityAt?: string | null
}): Date | null {
  return instant(lead.lastActivityAt) ?? instant(lead.stageChangedAt) ?? instant(lead.createdAt)
}

function staleStage(kind: LeadKind, stage: LeadStage): boolean {
  return (STALE_STAGES[kind] as readonly LeadStage[] | undefined)?.includes(stage) ?? false
}

/**
 * A lead's heat at `now`: untouched in New with no staff action, amber from 24 hours after it was
 * made and red from 48 (P3); stale in an active stage once its quiet spell is seven days long (P4);
 * fine otherwise, and always fine in a final stage.
 */
export const heatOf: HeatOf = (lead, now): LeadHeat => {
  if (lead.stage === UNTOUCHED_STAGE) {
    if (lead.touchedAt) return { state: 'fine' }
    const made = instant(lead.createdAt)
    if (!made) return { state: 'fine' }
    const waited = now.getTime() - made.getTime()
    if (waited >= UNTOUCHED_HOURS.red * HOUR) return { state: 'untouched', level: 'red', since: made }
    if (waited >= UNTOUCHED_HOURS.amber * HOUR) {
      return { state: 'untouched', level: 'amber', since: made }
    }
    return { state: 'fine' }
  }
  if (!staleStage(lead.kind, lead.stage)) return { state: 'fine' }
  const since = quietSince(lead)
  if (!since) return { state: 'fine' }
  return now.getTime() - since.getTime() >= STALE_AFTER_DAYS * DAY
    ? { state: 'stale', since }
    : { state: 'fine' }
}

/** The cut-off a quiet spell must reach by `now` to be stale. */
export function staleCutoff(now: Date): string {
  return new Date(now.getTime() - STALE_AFTER_DAYS * DAY).toISOString()
}

/**
 * The leads stale at `now` (the board's "Needs attention", Today): in a stale stage of their own
 * kind, with the last activity, else the stage change, else the making, at least seven days old.
 * The same reading as heatOf.
 */
export const staleWhere: StaleWhere = (now) => {
  const cutoff = staleCutoff(now)
  const quiet: Where = {
    or: [
      { lastActivityAt: { less_than_equal: cutoff } },
      {
        and: [
          { lastActivityAt: { exists: false } },
          { stageChangedAt: { less_than_equal: cutoff } },
        ],
      },
      {
        and: [
          { lastActivityAt: { exists: false } },
          { stageChangedAt: { exists: false } },
          { createdAt: { less_than_equal: cutoff } },
        ],
      },
    ],
  }
  return {
    and: [
      {
        or: (Object.keys(STALE_STAGES) as LeadKind[]).map((kind) => ({
          and: [{ kind: { equals: kind } }, { stage: { in: [...STALE_STAGES[kind]] } }],
        })),
      },
      quiet,
    ],
  }
}

/** The leads waiting on a first action at `now`: in New, untouched, made 24 hours ago or more. */
export function untouchedWhere(now: Date): Where {
  return {
    and: [
      { stage: { equals: UNTOUCHED_STAGE } },
      { touchedAt: { exists: false } },
      {
        createdAt: {
          less_than_equal: new Date(now.getTime() - UNTOUCHED_HOURS.amber * HOUR).toISOString(),
        },
      },
    ],
  }
}

/** Every lead that needs someone at `now`: untouched or stale. */
export function needsAttentionWhere(now: Date): Where {
  return { or: [untouchedWhere(now), staleWhere(now)] }
}
