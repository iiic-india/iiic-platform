import type { PayloadRequest } from 'payload'

import type { CancelQueued, Deliver } from '@/lib/messaging/operations'
import type { Result } from '@/lib/result'

import type { Plan } from './types'

/**
 * The two calls of the messaging core the B-series makes (src/lib/messaging/operations.ts; docs/19
 * §3): `deliver` records one row per message key and sends nothing twice, `cancelQueued` cancels
 * what is still queued about a subject. Builder A implements them; the tasks receive them through
 * this port, so the planners and the runner are tested with a fake and the real core is joined
 * with one line (`src/lib/automations/booking/wiring.ts`).
 */
export type MessagingCore = { deliver: Deliver; cancelQueued: CancelQueued }

export type CoreError = { code: 'core-not-wired' }

/** Resolves the core when a task runs. */
export type CoreProvider = () => Promise<Result<MessagingCore, CoreError>>

/** What one task did: codes and counts only, for the job's output and the log. */
export type PlanOutcome = {
  cancelled: number
  /** Messages planned, whether their rows were new or already there. */
  planned: number
  /** Rows written for the first time (a replay writes none). */
  created: number
  /** The core's refusals, by code (`recipient-missing` and the like). */
  refused: string[]
}

/**
 * Runs a plan against the core: cancellations first, so a reschedule's old reminders are gone
 * before the new booking's are recorded; then each message. Pure apart from the core it is given.
 */
export async function runPlan(
  req: PayloadRequest,
  plan: Plan,
  core: MessagingCore,
): Promise<PlanOutcome> {
  let cancelled = 0
  for (const scope of plan.cancel) cancelled += await core.cancelQueued(req, scope)
  let created = 0
  const refused: string[] = []
  for (const message of plan.deliver) {
    const result = await core.deliver(req, message)
    if (result.ok) {
      if (result.value.created) created += 1
    } else {
      refused.push(result.error.code)
    }
  }
  return { cancelled, planned: plan.deliver.length, created, refused }
}
