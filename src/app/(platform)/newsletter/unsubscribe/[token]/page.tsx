import type { Metadata } from 'next'

import { CandidateMark } from '@/components/blocks/PageBlocks'
import { verifySignedLink } from '@/lib/automations/operations/core'
import { NEWSLETTER_COPY_STATUS, UNSUBSCRIBE_COPY } from '@/lib/newsletter/copy'
import { SignedLinkToken } from '@/lib/newsletter/rules'

import styles from '../../newsletter.module.css'

export const dynamic = 'force-dynamic'

// A page reached by a private link: never listed, and the link is not passed on.
export const metadata: Metadata = {
  title: UNSUBSCRIBE_COPY.title,
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

type Props = { params: Promise<{ token: string }> }

/**
 * The visible unsubscribe link every issue carries (docs/19 §8; docs/13 §5). Opening it changes
 * nothing; its one button takes the address off the list at once
 * (src/app/api/newsletter/unsubscribe/route.ts). No question, no "are you sure", no offer.
 */
export default async function UnsubscribePage({ params }: Props) {
  const { token } = await params
  const shape = SignedLinkToken.safeParse(token)
  const link = shape.success ? await verifySignedLink('unsubscribe', shape.data) : null

  return (
    <section className={`iiic-page-narrow ${styles.page}`}>
      <CandidateMark status={NEWSLETTER_COPY_STATUS} />
      <h1>{UNSUBSCRIBE_COPY.heading}</h1>
      {link?.ok ? (
        <form className={styles.form} method="post" action="/api/newsletter/unsubscribe">
          <p>{UNSUBSCRIBE_COPY.lead}</p>
          <input type="hidden" name="token" value={token} />
          <button className="iiic-btn iiic-btn-primary" type="submit">
            {UNSUBSCRIBE_COPY.button}
          </button>
        </form>
      ) : (
        <p className={styles.outcome}>{UNSUBSCRIBE_COPY.invalid}</p>
      )}
    </section>
  )
}
