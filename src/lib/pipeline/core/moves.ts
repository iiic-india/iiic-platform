import type { PayloadRequest } from 'payload'

import { POLICY } from '@/access/policy'
import { err, ok, type Result } from '@/lib/result'
import type { Lead } from '@/payload-types'

import type { MoveLead, PipelineError } from '../leads'
import {
  REASON_STAGES,
  STAGE_MOVES,
  STAGES_BY_KIND,
  type LeadKind,
  type LeadStage,
} from '../stages'
import { asPlatform, staffWithCode } from './actor'

/**
 * Moving a lead along its board (docs/17 §3; src/lib/pipeline/leads.ts, MoveLead). This is the
 * only way a lead's stage changes: no role writes the field in the admin's form or the API
 * (src/collections/Leads.ts). The leads' hook does what every move does: holds it to
 * STAGE_MOVES, stamps `stageChangedAt` and `closedAt`, writes the `stageChange` activity and
 * emits `lead.stageChanged`. This module answers the question first, as a typed Result. Free of
 * `server-only`: the enquiries' hook closes a spam enquiry's lead through it.
 */

/** Whether a lead of a kind may move from one stage to another. */
export function canMoveLead(kind: LeadKind, from: LeadStage, to: LeadStage): boolean {
  return (STAGE_MOVES[kind][from] ?? []).includes(to)
}

/** Whether `stage` comes before `than` on the kind's board. */
export function isEarlier(kind: LeadKind, stage: LeadStage, than: LeadStage): boolean {
  const order: readonly LeadStage[] = STAGES_BY_KIND[kind]
  const at = order.indexOf(stage)
  return at >= 0 && at < order.indexOf(than)
}

/**
 * Moves a lead without asking who is moving it: the caller has checked. `by` is whose move it
 * is, for the activity; null for the platform's own (P2, P5).
 */
export async function applyMove(
  req: PayloadRequest,
  input: { leadId: number; to: LeadStage; reason?: string; by: number | null },
): Promise<Result<Lead, PipelineError>> {
  const lead = (await req.payload.findByID({
    collection: 'leads',
    id: input.leadId,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })) as Lead | null
  if (!lead) return err({ code: 'not-found' })
  const from = lead.stage as LeadStage
  if (!canMoveLead(lead.kind as LeadKind, from, input.to)) {
    return err({ code: 'bad-move', from, to: input.to })
  }
  const reason = input.reason?.trim()
  const needsReason = (REASON_STAGES as readonly LeadStage[]).includes(input.to)
  if (needsReason && !reason) return err({ code: 'reason-required' })
  await asPlatform(req, input.by, () =>
    req.payload.update({
      collection: 'leads',
      id: lead.id,
      data: { stage: input.to, ...(needsReason ? { endReason: reason } : {}) },
      depth: 0,
      overrideAccess: true,
      req,
    }),
  )
  // Read again: the move's activity has stamped the lead since.
  const moved = (await req.payload.findByID({
    collection: 'leads',
    id: lead.id,
    depth: 0,
    overrideAccess: true,
    req,
  })) as Lead
  return ok(moved)
}

/**
 * MoveLead (src/lib/pipeline/leads.ts): a move by a member of the staff needs an owner or an
 * operator who has entered the two-factor code, and is theirs; the platform's own pass `by: null`.
 */
export const moveLead: MoveLead = async (req, input) => {
  if (input.by !== null) {
    if (!staffWithCode(req.user, POLICY.leads.update.roles) || req.user?.id !== input.by) {
      return err({ code: 'not-allowed' })
    }
  }
  return applyMove(req, input)
}
