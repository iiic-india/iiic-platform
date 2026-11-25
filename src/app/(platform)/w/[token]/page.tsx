import type { Metadata } from 'next'
import Link from 'next/link'
import { createLocalReq, getPayload } from 'payload'

import { FocusOnArrival } from '@/app/(platform)/newsletter/FocusOnArrival'
import styles from '@/app/(platform)/newsletter/newsletter.module.css'
import { CandidateMark } from '@/components/blocks/PageBlocks'
import { verifySignedLink } from '@/lib/automations/operations/core'
import { NEWSLETTER_COPY_STATUS, WITHDRAW_COPY } from '@/lib/newsletter/copy'
import { SignedLinkToken } from '@/lib/newsletter/rules'
import { consentsInForce } from '@/lib/newsletter/withdrawals'
import { ENDED_IN_MY_IIIC } from '@/lib/privacy/purposes'
import { formatIstDate } from '@/lib/time/ist'
import config from '@payload-config'

export const dynamic = 'force-dynamic'

// A page reached by a private link: never listed, and the link is not passed on.
export const metadata: Metadata = {
  title: WITHDRAW_COPY.title,
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

type Props = {
  params: Promise<{ token: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const OUTCOME_ID = 'withdraw-outcome'

/**
 * `/w/[token]` (docs/19 §8; docs/08 §3): the link at the foot of every transactional email. The
 * person's consents in force, each with when it was given and a button that withdraws it at
 * once (src/app/(platform)/w/[token]/withdraw/route.ts). The token is the core's signed link for
 * `withdraw`, naming the person; no sign-in, nothing else about them is shown.
 */
export default async function WithdrawPage({ params, searchParams }: Props) {
  const { token } = await params
  const state = (await searchParams).state
  const shape = SignedLinkToken.safeParse(token)
  const link = shape.success ? await verifySignedLink('withdraw', shape.data) : null

  if (!link?.ok) {
    return (
      <section className={`iiic-page-narrow ${styles.page}`}>
        <CandidateMark status={NEWSLETTER_COPY_STATUS} />
        <h1>{WITHDRAW_COPY.heading}</h1>
        <p className={styles.outcome}>{WITHDRAW_COPY.invalid}</p>
      </section>
    )
  }

  const payload = await getPayload({ config })
  const req = await createLocalReq({}, payload)
  const consents = await consentsInForce(req, link.value.subjectId)
  const outcome =
    state === 'done'
      ? { text: WITHDRAW_COPY.done, tone: 'green' }
      : state === 'failed'
        ? { text: WITHDRAW_COPY.failed, tone: 'red' }
        : null

  return (
    <section className={`iiic-page-narrow ${styles.page}`}>
      <CandidateMark status={NEWSLETTER_COPY_STATUS} />
      <h1>{WITHDRAW_COPY.heading}</h1>
      {outcome ? (
        <>
          <div
            className={`iiic-alert iiic-alert-${outcome.tone} ${styles.outcome}`}
            role="status"
            tabIndex={-1}
            id={OUTCOME_ID}
          >
            {outcome.text}
          </div>
          <FocusOnArrival id={OUTCOME_ID} />
        </>
      ) : null}
      {consents.length === 0 ? (
        <p>{WITHDRAW_COPY.none}</p>
      ) : (
        <>
          <p>{WITHDRAW_COPY.lead}</p>
          <ul className={styles.list}>
            {consents.map((consent) => (
              <li key={consent.purpose}>
                <span>
                  <strong>{consent.label}</strong>
                  <br />
                  <span className="iiic-help">
                    {WITHDRAW_COPY.givenOn} {formatIstDate(new Date(consent.grantedAt))}
                  </span>
                </span>
                {ENDED_IN_MY_IIIC.includes(consent.purpose) ? (
                  // Withdrawing the account consent is closing the account, in My IIIC (D-113).
                  <Link className="iiic-btn iiic-btn-outline" href="/account/privacy">
                    {WITHDRAW_COPY.inMyIiic}
                  </Link>
                ) : (
                  <form method="post" action={`/w/${token}/withdraw`}>
                    <input type="hidden" name="purpose" value={consent.purpose} />
                    <button
                      className="iiic-btn iiic-btn-outline"
                      type="submit"
                      aria-label={`${WITHDRAW_COPY.button}: ${consent.label}`}
                    >
                      {WITHDRAW_COPY.button}
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
