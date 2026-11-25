import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import styles from '@/components/account/privacy/privacy.module.css'
import { CandidateMark } from '@/components/blocks/PageBlocks'
import { CLOSED_COPY, PRIVACY_COPY_STATUS } from '@/lib/accounts/privacy/copy'
import { PRIVACY_PATH } from '@/lib/accounts/privacy/outcome'
import { getAccountSession } from '@/lib/accounts/privacy/seams'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: { absolute: CLOSED_COPY.title },
  robots: { index: false, follow: false },
}

/**
 * `/account/privacy/closed`: where closing the account leads (docs/20 §7.6). By then the person
 * has no session, so the page reads nothing about anyone: fixed words only. It still reads the
 * session first, and a person who is signed in is sent back to the privacy page, so it never
 * tells a signed-in person their account is closed.
 */
export default async function ClosedPage() {
  if (await getAccountSession()) redirect(PRIVACY_PATH)
  return (
    <div className={`iiic-page-narrow ${styles.page}`}>
      <CandidateMark status={PRIVACY_COPY_STATUS} />
      <h1>{CLOSED_COPY.heading}</h1>
      <div className={`iiic-alert iiic-alert-green ${styles.outcome}`} role="status">
        {CLOSED_COPY.lead}
      </div>
      <p>{CLOSED_COPY.keeps}</p>
      <p>
        <Link className="iiic-link" href="/">
          {CLOSED_COPY.home}
        </Link>
      </p>
    </div>
  )
}
