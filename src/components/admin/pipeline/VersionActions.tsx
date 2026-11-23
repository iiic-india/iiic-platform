import Link from 'next/link'
import type { UIFieldServerComponent } from 'payload'

import { POLICY } from '@/access/policy'
import { hasRole, isActive } from '@/access/roles'
import { mayPrintFees } from '@/lib/pipeline/proposal/fees'
import { idOf, linkOpens } from '@/lib/pipeline/proposal/status'
import { readFlags } from '@/lib/settings/source'

import { PROPOSAL_PANEL_COPY, VERSION_PANEL_COPY as COPY } from './copy'
import styles from './Pipeline.module.css'
import { VersionActionsPanel } from './VersionActionsPanel'

/**
 * At the top of a proposal version (docs/05 "Send a proposal"; docs/17 §5): its preview and PDF,
 * how its link stands (sent, opened, replaced, withdrawn), "Send to the client" and "Withdraw the
 * link". Shown to staff who have entered their two-factor code: preview and PDF to those who read
 * proposals, sending and withdrawing to the office. Every endpoint checks again.
 */
export const VersionActions: UIFieldServerComponent = async ({ id, payload, req }) => {
  const user = req.user
  if (!user || (user as { _strategy?: string })._strategy !== 'totp' || !isActive(user)) return null
  if (!hasRole(user, ...POLICY.proposalVersions.read.roles)) return null
  if (id === undefined || id === null) return null

  const version = await payload.findByID({
    collection: 'proposal-versions',
    id,
    depth: 0,
    select: { proposal: true, number: true, sending: true, tracking: true },
    disableErrors: true,
    overrideAccess: false,
    req,
  })
  if (!version) return null
  const proposalId = idOf(version.proposal)
  const proposal =
    proposalId === null
      ? null
      : await payload.findByID({
          collection: 'proposals',
          id: proposalId,
          depth: 0,
          select: { status: true, sentVersion: true, reference: true },
          disableErrors: true,
          overrideAccess: false,
          req,
        })
  if (!proposal) return null

  const sentAt = version.sending?.sentAt
  const open = linkOpens(proposal, { id: version.id, sending: version.sending })
  const views = version.tracking?.viewCount ?? 0
  const feesMayPrint = mayPrintFees(await readFlags(payload))
  const status = proposal.status ?? 'draft'
  // A proposal the client has answered takes no new send; a draft or a sent one does.
  const sendable = status !== 'accepted' && status !== 'declined'

  return (
    <section aria-labelledby="version-actions-heading" className={styles.panel}>
      <h2 className={styles.panelHeading} id="version-actions-heading">
        {COPY.heading}
      </h2>
      <p>
        <Link href={`${payload.config.routes.admin}/collections/proposals/${proposal.id}`}>
          {proposal.reference ?? PROPOSAL_PANEL_COPY.heading}
        </Link>
        {' · '}
        {PROPOSAL_PANEL_COPY.status}: <strong>{PROPOSAL_PANEL_COPY.statuses[status]}</strong>
      </p>
      {sentAt ? (
        <p>
          {version.sending?.supersededAt
            ? COPY.replaced
            : version.sending?.linkRevokedAt
              ? COPY.revoked
              : views > 0
                ? COPY.opened(views)
                : COPY.notOpened}
        </p>
      ) : (
        <p className={styles.hint}>{COPY.notSentYet}</p>
      )}
      {feesMayPrint ? null : <p className={styles.hint}>{PROPOSAL_PANEL_COPY.feesHidden}</p>}
      <VersionActionsPanel
        feesMayPrint={feesMayPrint}
        isOffice={hasRole(user, ...POLICY.proposals.update.roles)}
        linkOpen={open}
        sendable={sendable}
        versionId={version.id}
      />
    </section>
  )
}
