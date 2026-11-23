import type { Metadata } from 'next'
import Link from 'next/link'
import { createLocalReq, getPayload } from 'payload'

import { CandidateMark } from '@/components/blocks/PageBlocks'
import { CONFIRM_COPY, NEWSLETTER_COPY_STATUS } from '@/lib/newsletter/copy'
import { linkLive } from '@/lib/newsletter/rules'
import { findByToken } from '@/lib/newsletter/subscriptions'
import { idOf } from '@/lib/privacy/consentLedger'
import config from '@payload-config'

import styles from '../../newsletter.module.css'

export const dynamic = 'force-dynamic'

// A page reached by a private link: never listed, and the link is not passed on.
export const metadata: Metadata = {
  title: CONFIRM_COPY.title,
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

type Props = { params: Promise<{ token: string }> }

/**
 * The double opt-in's landing (docs/19 §8; D-10). Opening the link changes nothing: the page
 * shows the notice the person saw at signup and one button, whose POST confirms
 * (src/app/api/newsletter/confirm/route.ts), so a link scanner confirms nobody.
 */
export default async function ConfirmPage({ params }: Props) {
  const { token } = await params
  const payload = await getPayload({ config })
  const req = await createLocalReq({}, payload)
  const entry = await findByToken(req, token)

  const message = !entry
    ? CONFIRM_COPY.invalid
    : entry.status === 'confirmed'
      ? CONFIRM_COPY.already
      : entry.status !== 'pending' || !linkLive(entry.confirmExpiresAt, new Date())
        ? CONFIRM_COPY.expired
        : null

  const noticeId = entry ? idOf(entry.notice) : null
  const notice =
    !message && noticeId !== null
      ? await payload.findByID({
          collection: 'consent-versions',
          id: noticeId,
          depth: 0,
          disableErrors: true,
          overrideAccess: true,
        })
      : null

  return (
    <section className={`iiic-page-narrow ${styles.page}`}>
      <CandidateMark status={NEWSLETTER_COPY_STATUS} />
      <h1>{CONFIRM_COPY.heading}</h1>
      {message ? (
        <>
          <p className={styles.outcome}>{message}</p>
          {entry?.status !== 'confirmed' ? (
            <Link className="iiic-btn iiic-btn-secondary" href="/newsletter">
              {CONFIRM_COPY.signupAgain}
            </Link>
          ) : null}
        </>
      ) : (
        <form className={styles.form} method="post" action="/api/newsletter/confirm">
          <p>{CONFIRM_COPY.lead}</p>
          {notice?.text ? <p className={`iiic-help ${styles.notice}`}>{notice.text}</p> : null}
          <input type="hidden" name="token" value={token} />
          <button className="iiic-btn iiic-btn-primary" type="submit">
            {CONFIRM_COPY.button}
          </button>
        </form>
      )}
    </section>
  )
}
