import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createLocalReq, getPayload } from 'payload'
import { cache } from 'react'

import styles from '@/components/account/signIn/signIn.module.css'
import { AccountForm, CodeForm, NewCodeForm } from '@/components/account/signIn/SignInForms'
import { StepHeading } from '@/components/account/signIn/StepHeading'
import { CandidateMark } from '@/components/blocks/PageBlocks'
import { newestRecord, under18Holds } from '@/lib/accounts/lifecycle'
import { declineAccount, startWithAnotherAddress } from '@/lib/accounts/signIn/actions'
import type { Attempt } from '@/lib/accounts/signIn/cookie'
import { ACCOUNT_COPY, SIGN_IN_COPY_STATUS, VERIFY_COPY } from '@/lib/accounts/signIn/copy'
import { maskIdentifier } from '@/lib/accounts/signIn/identifier'
import { currentAttempt } from '@/lib/accounts/signIn/steps'
import { currentNotice } from '@/lib/privacy/consents'
import { readFlags } from '@/lib/settings/source'
import { DEFAULT_LANGUAGE } from '@/lib/site/languages'
import config from '@payload-config'

export const dynamic = 'force-dynamic'

/** The sign-in in progress in this browser, read once for the page and its title. */
const step = cache(async (): Promise<{ attempt: Attempt | null }> => {
  const payload = await getPayload({ config })
  if (!(await readFlags(payload)).accountsEnabled) notFound()
  // A sign-in's attempt only: a second detail's travels in a cookie of its own (D-129).
  return { attempt: await currentAttempt(await createLocalReq({}, payload), new Date()) }
})

export async function generateMetadata(): Promise<Metadata> {
  const { attempt } = await step()
  return {
    title: { absolute: attempt?.provenAt ? ACCOUNT_COPY.title : VERIFY_COPY.title },
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  }
}

/** Without a sign-in in progress here: "Start again", and nothing else (docs/20 §4.4). */
function StartAgain() {
  return (
    <>
      <StepHeading>{VERIFY_COPY.startAgainHeading}</StepHeading>
      <p className={styles.lead}>{VERIFY_COPY.startAgain}</p>
      <Link className="iiic-btn iiic-btn-primary" href="/login">
        {VERIFY_COPY.startAgainLink}
      </Link>
    </>
  )
}

/**
 * `/login/verify` (docs/20 §4.1, steps 2 and 3): the code, then, for an address with no account,
 * the account step. Read from the sign-in cookie, which only step 1 sets; the address shows
 * masked and never travels in the page's address. Works without JavaScript.
 */
export default async function VerifyPage() {
  const { attempt } = await step()
  if (!attempt) {
    return (
      <section className={`iiic-page-narrow ${styles.page}`}>
        <StartAgain />
      </section>
    )
  }

  if (attempt.provenAt) {
    const payload = await getPayload({ config })
    const req = await createLocalReq({}, payload)
    const [notice, newest, under18] = await Promise.all([
      currentNotice(payload, 'account', DEFAULT_LANGUAGE, new Date()),
      newestRecord(req, attempt.channel, attempt.address),
      under18Holds(req, attempt.channel, attempt.address),
    ])
    return (
      <section className={`iiic-page-narrow ${styles.page}`}>
        <CandidateMark status={SIGN_IN_COPY_STATUS} />
        <StepHeading>{ACCOUNT_COPY.heading}</StepHeading>
        {under18 ? (
          <>
            <p className="iiic-alert iiic-alert-yellow" role="status">
              {ACCOUNT_COPY.under18}
            </p>
            <form action={declineAccount} className={styles.small}>
              <button className="iiic-btn iiic-btn-secondary" type="submit">
                {ACCOUNT_COPY.decline}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className={styles.lead}>{ACCOUNT_COPY.lead}</p>
            {notice ? null : (
              <p className="iiic-alert iiic-alert-yellow" role="status">
                {ACCOUNT_COPY.noticeMissing}
              </p>
            )}
            <AccountForm
              suggestedName={newest?.fullName ?? null}
              notice={notice ? { id: notice.id, text: notice.text } : null}
            />
          </>
        )}
      </section>
    )
  }

  return (
    <section className={`iiic-page-narrow ${styles.page}`}>
      <CandidateMark status={SIGN_IN_COPY_STATUS} />
      <StepHeading>{VERIFY_COPY.heading}</StepHeading>
      <p className={styles.lead}>
        {VERIFY_COPY.sent(maskIdentifier(attempt.channel, attempt.address))}
      </p>
      <CodeForm />
      <div className={styles.secondary}>
        <NewCodeForm />
        <form action={startWithAnotherAddress}>
          <button className="iiic-btn iiic-btn-ghost" type="submit">
            {VERIFY_COPY.different}
          </button>
        </form>
      </div>
    </section>
  )
}
