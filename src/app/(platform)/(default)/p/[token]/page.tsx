import type { Metadata } from 'next'
import { createLocalReq, getPayload } from 'payload'

import { env } from '@/lib/env'
import { actsHere } from '@/lib/messaging/deployment'
import { PROPOSAL_PAGE } from '@/lib/pipeline/proposal/copy'
import { linkPdfPath } from '@/lib/pipeline/proposal/tokens'
import { proposals } from '@/lib/pipeline/proposal/wiring'
import { mailHref, telHref } from '@/lib/site/contact'
import config from '@payload-config'

// Read on every request, never cached anywhere: the token is the key (docs/17 §5).
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 15

/**
 * Never indexed, never followed, never in the sitemap, and the address sent to no one: the page
 * says so itself, and the analytics beacon leaves `/p/` out (src/lib/analytics/beacon.ts).
 */
export const metadata: Metadata = {
  title: PROPOSAL_PAGE.metaTitle,
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
}

type Props = { params: Promise<{ token: string }> }

/**
 * A proposal's tracked link (docs/17 §5; src/lib/pipeline/proposal/track.ts): the proposal's
 * title, the client and the reference, and a link to the PDF. Reading this page counts nothing,
 * so a mail scanner that fetches it moves nothing; only the PDF's own address counts an opening.
 * A replaced, withdrawn, declined, expired or unknown link gets one page that says only that the
 * link no longer opens a proposal and how to reach IIIC. No sign-in: the token is the key. No
 * amount appears here. A preview, which shares production's database, looks nothing up (reading
 * can expire a proposal) and shows the closed page (D-102).
 */
export default async function ProposalLinkPage({ params }: Props) {
  const { token } = await params
  const found = actsHere(env().VERCEL_ENV)
    ? await proposals().read(await createLocalReq({}, await getPayload({ config })), token)
    : null

  if (!found?.ok) {
    return (
      <section className="iiic-page-narrow">
        <h1>{PROPOSAL_PAGE.closedTitle}</h1>
        <p>{PROPOSAL_PAGE.closedLine}</p>
        <ul>
          <li>
            <a href={mailHref(PROPOSAL_PAGE.email)}>{PROPOSAL_PAGE.email}</a>
          </li>
          <li>
            <a href={telHref(PROPOSAL_PAGE.phone)}>{PROPOSAL_PAGE.phone}</a>
          </li>
        </ul>
      </section>
    )
  }

  const { title, clientName, reference } = found.value
  return (
    <section className="iiic-page-narrow">
      <p className="iiic-kicker">{PROPOSAL_PAGE.kicker}</p>
      <h1>{title}</h1>
      <p className="iiic-lede">{PROPOSAL_PAGE.preparedFor(clientName)}</p>
      <p>{PROPOSAL_PAGE.reference(reference)}</p>
      <p>
        <a className="iiic-btn iiic-btn-primary" href={linkPdfPath(token)} rel="noreferrer">
          {PROPOSAL_PAGE.open}
        </a>
      </p>
      <p>{PROPOSAL_PAGE.openHelp}</p>
      <p>{PROPOSAL_PAGE.questions}</p>
    </section>
  )
}
