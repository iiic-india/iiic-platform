import type { UIFieldServerComponent } from 'payload'

import { POLICY } from '@/access/policy'
import { hasRole, isActive } from '@/access/roles'
import {
  LEAD_STAGES,
  type LeadKind,
  type LeadStage as Stage,
  REASON_STAGES,
  STAGE_MOVES,
} from '@/lib/pipeline/stages'

import { BOARD_COPY as COPY, LEAD_STAGE_COPY } from './copy'
import { LeadStagePanel } from './LeadStagePanel'
import styles from './Pipeline.module.css'

const LABELS = Object.fromEntries(LEAD_STAGES.map(({ value, label }) => [value, label])) as Record<
  Stage,
  string
>

/**
 * "Move to stage" on the lead's own page (docs/05 Pipeline; docs/17 §3), beside the board's: the
 * same moves (STAGE_MOVES) through the same endpoint (`POST /api/pipeline/move`), which checks
 * again. The user, an active account, the two-factor code and the role are checked first, before
 * the lead is read; anyone else sees nothing here. The lead is read with the user's own access.
 */
export const LeadStage: UIFieldServerComponent = async ({ id, payload, req }) => {
  const user = req.user
  if (!user || (user as { _strategy?: string })._strategy !== 'totp' || !isActive(user)) return null
  if (!hasRole(user, ...POLICY.leads.update.roles)) return null
  if (id === undefined || id === null) return null

  const lead = await payload.findByID({
    collection: 'leads',
    id,
    depth: 0,
    select: { kind: true, stage: true },
    disableErrors: true,
    overrideAccess: false,
    req,
  })
  if (!lead?.kind || !lead.stage) return null
  const kind = lead.kind as LeadKind
  const stage = lead.stage as Stage
  const moves = STAGE_MOVES[kind][stage] ?? []

  return (
    <section aria-labelledby="lead-stage-heading" className={styles.panel}>
      <h2 className={styles.panelHeading} id="lead-stage-heading">
        {LEAD_STAGE_COPY.heading}
      </h2>
      <p>
        {COPY.stage}: <strong>{LABELS[stage]}</strong>
      </p>
      {moves.length ? (
        <LeadStagePanel
          leadId={Number(id)}
          moves={moves.map((value) => ({ value, label: LABELS[value] }))}
          reasonStages={[...REASON_STAGES]}
        />
      ) : (
        <p className={styles.hint}>{COPY.move.final}</p>
      )}
    </section>
  )
}
