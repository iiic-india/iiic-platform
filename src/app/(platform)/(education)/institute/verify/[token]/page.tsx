import type { Metadata } from 'next'

import { VerificationResult } from '@/components/certificates/VerificationResult'
import styles from '@/components/certificates/verify.module.css'
import { VERIFY_COPY as COPY } from '@/lib/certificates/verifyCopy'
import { verifyByToken } from '@/lib/certificates/wiring'

/**
 * Never indexed (D-67) and never cached: the address carries the token only the holder's PDF
 * prints, and the page shows a person's name. No referrer leaves it (the site's headers).
 */
export const metadata: Metadata = {
  title: COPY.title,
  description: COPY.description,
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ token: string }> }

/**
 * /institute/verify/<token> (docs/18 §4): what a certificate's QR code opens. The token is held to
 * its shape, hashed and looked up (src/lib/certificates/verify.ts); the page shows what IIIC's
 * record says with the full name, or one plain "No certificate matches".
 */
export default async function VerifyByTokenPage({ params }: Props) {
  const { token } = await params
  const view = await verifyByToken(token)
  return (
    <section className={`iiic-page-narrow ${styles.page}`}>
      <h1>{COPY.heading}</h1>
      <VerificationResult by="token" view={view} />
    </section>
  )
}
