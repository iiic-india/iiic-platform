import type { Endpoint, PayloadHandler, PayloadRequest } from 'payload'
import { z } from 'zod'

import { POLICY } from '@/access/policy'
import { hasRole, isActive } from '@/access/roles'
import type { MoveLead } from '@/lib/pipeline/leads'
import { inTransaction } from '@/lib/pipeline/proposal/guard'
import { interimMoveLead } from '@/lib/pipeline/proposal/interim'
import { LEAD_STAGES, type LeadStage } from '@/lib/pipeline/stages'

import { stageLabel } from './board'
import { MOVE_MESSAGES } from './copy'

/**
 * The board's "Move to stage" (docs/17 §3, §12 C): `POST /api/pipeline/move` with the lead, the
 * stage and, for Lost or Closed, why it ended. It checks the user, the role and the two-factor code
 * first (CLAUDE.md #6), parses the body with Zod, and moves the lead through `MoveLead` in one
 * transaction, which holds the move to STAGE_MOVES and writes the stage-change activity. The
 * answer carries the lead's id and new stage only. Imported by the Payload config, so not marked
 * `server-only`.
 *
 * At the merge (the lead): `moveLead` is builder A's (src/lib/pipeline/core/moves.ts), which also
 * emits `lead.stageChanged`, in place of the interim stand-in.
 */

const json = (body: Record<string, unknown>, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

const STAGE_VALUES = LEAD_STAGES.map(({ value }) => value) as [LeadStage, ...LeadStage[]]

export const MoveRequest = z.object({
  leadId: z.coerce.number().int().positive(),
  to: z.enum(STAGE_VALUES),
  reason: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => (value ? value : undefined)),
})

type Staff = { id: number; collection?: string; _strategy?: string } & Parameters<typeof hasRole>[0]

/** An owner or operator who has entered their code, or the answer that says why not. */
function moverOf(req: PayloadRequest): Staff | Response {
  const user = req.user as Staff | null | undefined
  if (!user || user.collection !== 'users' || user._strategy !== 'totp' || !isActive(user)) {
    return json({ code: 'sign-in', message: MOVE_MESSAGES.signIn }, 401)
  }
  if (!hasRole(user, ...POLICY.leads.update.roles)) {
    return json({ code: 'not-allowed', message: MOVE_MESSAGES.role }, 403)
  }
  return user
}

const STATUS = { 'not-found': 404, 'not-allowed': 403, 'bad-move': 409, 'reason-required': 422 }

export function makeMoveHandler(moveLead: MoveLead): PayloadHandler {
  return async (req) => {
    const mover = moverOf(req)
    if (mover instanceof Response) return mover
    const body = MoveRequest.safeParse(await req.json?.().catch(() => null))
    if (!body.success) return json({ code: 'invalid', message: MOVE_MESSAGES.invalid }, 400)
    const { leadId, to, reason } = body.data
    const moved = await inTransaction(req, () =>
      moveLead(req, { leadId, to, reason, by: mover.id }),
    )
    if (!moved.ok) {
      const code = moved.error.code
      if (code in STATUS) {
        const known = code as keyof typeof STATUS
        return json({ code, message: MOVE_MESSAGES[known] }, STATUS[known])
      }
      return json({ code: 'invalid', message: MOVE_MESSAGES.invalid }, 400)
    }
    return json({ id: moved.value.id, stage: moved.value.stage, label: stageLabel(to) })
  }
}

export const pipelineEndpoints: Endpoint[] = [
  { path: '/pipeline/move', method: 'post', handler: makeMoveHandler(interimMoveLead) },
]
