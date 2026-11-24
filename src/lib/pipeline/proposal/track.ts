import type { PayloadRequest } from 'payload'

import { err, ok, type Result } from '@/lib/result'
import type { Proposal, ProposalVersion } from '@/payload-types'

import type { OpenTrackedLink, ProposalError } from '../proposals'
import type { ProposalDeps } from './deps'
import { expireIfDue } from './expire'
import { inTransaction } from './guard'
import { findProposal, patchVersion } from './load'
import { printSnapshot } from './preview'
import { readSnapshot } from './snapshot'
import { canMove, idOf, linkOpens } from './status'
import { hashLinkToken, isLinkToken } from './tokens'

/**
 * The tracked link (`/p/[token]`; docs/17 §5). The page shows the proposal's title and client and
 * a button to the PDF; only the PDF counts an opening, so a link scanner that fetches the page
 * counts nothing. The first opening moves a sent proposal to viewed and emits `proposal.viewed`
 * once; an opening by signed-in staff or on a preview deployment counts nothing (`countView`,
 * src/lib/pipeline/proposal/viewCounts.ts). A token is looked up by its hash; an unknown,
 * replaced, withdrawn, declined or expired link answers `link-closed` alike, and the page says
 * only that it no longer opens a proposal. No sign-in: the token is the key.
 */

type Opened = { proposal: Proposal; version: ProposalVersion }

/** The version a token opens now, expiring its proposal first if its day has passed. */
async function openVersion(
  req: PayloadRequest,
  token: string,
  now: Date,
  deps: Pick<ProposalDeps, 'emit'>,
): Promise<Result<Opened, ProposalError>> {
  if (!isLinkToken(token)) return err({ code: 'link-closed' })
  const { docs } = await req.payload.find({
    collection: 'proposal-versions',
    where: { linkTokenHash: { equals: hashLinkToken(token) } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req,
  })
  const version = docs[0]
  if (!version) return err({ code: 'link-closed' })
  const found = await findProposal(req, idOf(version.proposal) ?? -1)
  if (!found) return err({ code: 'link-closed' })
  const proposal = await expireIfDue(req, found, now, deps)
  if (!linkOpens(proposal, version)) return err({ code: 'link-closed' })
  return ok({ proposal, version })
}

/** What the link's page shows, without counting: the title, the client and the reference. */
export async function readTrackedLink(
  req: PayloadRequest,
  token: string,
  deps: Pick<ProposalDeps, 'emit' | 'now'>,
): Promise<Result<{ title: string; clientName: string; reference: string }, ProposalError>> {
  return inTransaction(req, async () => {
    const opened = await openVersion(req, token, deps.now(), deps)
    if (!opened.ok) return opened
    const snapshot = readSnapshot(opened.value.version.document)
    if (!snapshot) return err({ code: 'link-closed' })
    return ok({
      title: snapshot.title,
      clientName: snapshot.clientName,
      reference: snapshot.reference,
    })
  })
}

export function makeOpenTrackedLink(deps: ProposalDeps): OpenTrackedLink {
  return async (req, { token, now, countView = true }) => {
    const opened = await inTransaction(req, async () => {
      const result = await openVersion(req, token, now, deps)
      if (!result.ok) return result
      const { proposal, version } = result.value
      const printed = await printSnapshot(req, version.id, deps)
      if (!printed.ok) return printed
      // Staff checking what they sent, or anyone on a preview, is not the client reading it.
      if (!countView) {
        return ok({
          versionId: version.id,
          pdf: printed.value.pdf,
          filename: printed.value.filename,
        })
      }
      const first = !version.tracking?.firstViewedAt
      await patchVersion(req, version.id, {
        tracking: {
          ...(first ? { firstViewedAt: now.toISOString() } : {}),
          lastViewedAt: now.toISOString(),
          viewCount: (version.tracking?.viewCount ?? 0) + 1,
        },
      })
      if (first && proposal.status === 'sent' && canMove('sent', 'viewed')) {
        await req.payload.update({
          collection: 'proposals',
          id: proposal.id,
          data: { status: 'viewed' },
          depth: 0,
          overrideAccess: true,
          req,
        })
        await deps.emit(req, {
          name: 'proposal.viewed',
          proposalId: proposal.id,
          versionId: version.id,
        })
      }
      return ok({ versionId: version.id, pdf: printed.value.pdf, filename: printed.value.filename })
    })
    // Every refusal reads alike to the holder of the link.
    return opened.ok ? opened : err({ code: 'link-closed' })
  }
}
