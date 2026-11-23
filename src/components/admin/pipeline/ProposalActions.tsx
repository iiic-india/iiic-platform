import Link from 'next/link'
import type { UIFieldServerComponent } from 'payload'

import { POLICY } from '@/access/policy'
import { hasRole, isActive } from '@/access/roles'
import { mayPrintFees } from '@/lib/pipeline/proposal/fees'
import { idOf } from '@/lib/pipeline/proposal/status'
import { PROPOSAL_MOVES, type ProposalStatus } from '@/lib/pipeline/values'
import { readFlags } from '@/lib/settings/source'

import { PROPOSAL_PANEL_COPY as COPY } from './copy'
import styles from './Pipeline.module.css'
import { ProposalActionsPanel } from './ProposalActionsPanel'

/**
 * At the top of a proposal (docs/05 "Send a proposal"; docs/17 §5): its status, the preview of
 * the working copy, "Create version", the latest version, and, once the client has it, the form
 * that records their answer. Shown to staff who have entered their two-factor code: the preview
 * to those who read proposals, the actions to the office (owner or operator). Every endpoint
 * checks again (src/lib/pipeline/proposal/endpoints.ts).
 */
export const ProposalActions: UIFieldServerComponent = async ({ id, payload, req }) => {
  const user = req.user
  if (!user || (user as { _strategy?: string })._strategy !== 'totp' || !isActive(user)) return null
  if (!hasRole(user, ...POLICY.proposals.read.roles)) return null
  if (id === undefined || id === null) {
    return (
      <section aria-labelledby="proposal-actions-heading" className={styles.panel}>
        <h2 className={styles.panelHeading} id="proposal-actions-heading">
          {COPY.heading}
        </h2>
        <p className={styles.hint}>{COPY.unsaved}</p>
      </section>
    )
  }

  const proposal = await payload.findByID({
    collection: 'proposals',
    id,
    depth: 0,
    select: { status: true, currentVersion: true, sentVersion: true },
    disableErrors: true,
    overrideAccess: false,
    req,
  })
  if (!proposal) return null
  const status = (proposal.status ?? 'draft') as ProposalStatus
  const numberOf = async (versionId: number | null) => {
    if (versionId === null) return null
    const version = await payload.findByID({
      collection: 'proposal-versions',
      id: versionId,
      depth: 0,
      select: { number: true },
      disableErrors: true,
      overrideAccess: false,
      req,
    })
    return version ? { id: version.id, number: version.number } : null
  }
  const current = await numberOf(idOf(proposal.currentVersion))
  const sent = await numberOf(idOf(proposal.sentVersion))
  const feesMayPrint = mayPrintFees(await readFlags(payload))
  const admin = payload.config.routes.admin

  return (
    <section aria-labelledby="proposal-actions-heading" className={styles.panel}>
      <h2 className={styles.panelHeading} id="proposal-actions-heading">
        {COPY.heading}
      </h2>
      <p>
        {COPY.status}: <strong>{COPY.statuses[status]}</strong>
      </p>
      {current ? (
        <p>
          <Link href={`${admin}/collections/proposal-versions/${current.id}`}>
            {COPY.currentVersion(current.number)}
          </Link>
          {sent ? ` ${COPY.sentVersion(sent.number)}` : ''}
        </p>
      ) : (
        <p className={styles.hint}>{COPY.noVersion}</p>
      )}
      {feesMayPrint ? null : <p className={styles.hint}>{COPY.feesHidden}</p>}
      <ProposalActionsPanel
        answerable={PROPOSAL_MOVES[status].includes('accepted')}
        feesMayPrint={feesMayPrint}
        isOffice={hasRole(user, ...POLICY.proposals.update.roles)}
        proposalId={Number(id)}
      />
    </section>
  )
}
