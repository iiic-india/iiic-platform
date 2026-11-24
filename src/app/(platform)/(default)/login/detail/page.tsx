import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createLocalReq, getPayload } from 'payload'

import styles from '@/components/account/signIn/signIn.module.css'
import {
  DetailAddressForm,
  DetailCodeForm,
  NewCodeForm,
} from '@/components/account/signIn/SignInForms'
import { StepHeading } from '@/components/account/signIn/StepHeading'
import { CandidateMark } from '@/components/blocks/PageBlocks'
import { requireAccount } from '@/lib/accounts/session'
import { startAnotherDetail } from '@/lib/accounts/signIn/actions'
import {
  DETAIL_COPY,
  LOGIN_COPY,
  SIGN_IN_COPY_STATUS,
  VERIFY_COPY,
} from '@/lib/accounts/signIn/copy'
import { maskIdentifier } from '@/lib/accounts/signIn/identifier'
import { whatsappCodesOpen } from '@/lib/accounts/signIn/issue'
import { currentAttempt } from '@/lib/accounts/signIn/steps'
import { env } from '@/lib/env'
import { readFlags } from '@/lib/settings/source'
import config from '@payload-config'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: { absolute: DETAIL_COPY.title },
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/**
 * `/login/detail` (docs/20 §4.6): a second detail's code step, for a signed-in person. The
 * sign-in cookie travels to /login/* only (docs/20 §10), so the privacy page in My IIIC asks for
 * the code (`requestDetailCode`) and sends the person here; this page also takes the address
 * itself (`?channel=email` or `whatsapp`, the missing one by default). Works without JavaScript.
 */
export default async function DetailPage({ searchParams }: Props) {
  const payload = await getPayload({ config })
  if (!(await readFlags(payload)).accountsEnabled) notFound()
  const account = await requireAccount({ next: '/account/privacy' })
  const now = new Date()
  const req = await createLocalReq({}, payload)
  const attempt = await currentAttempt(req, now)
  const pending =
    attempt?.purpose === 'addDetail' && attempt.accountId === account.accountId ? attempt : null

  if (pending) {
    return (
      <section className={`iiic-page-narrow ${styles.page}`}>
        <CandidateMark status={SIGN_IN_COPY_STATUS} />
        <StepHeading>{DETAIL_COPY.heading}</StepHeading>
        <p className={styles.lead}>
          {VERIFY_COPY.sent(maskIdentifier(pending.channel, pending.address))}
        </p>
        <DetailCodeForm />
        <div className={styles.secondary}>
          <NewCodeForm />
          <form action={startAnotherDetail}>
            <button className="iiic-btn iiic-btn-ghost" type="submit">
              {VERIFY_COPY.different}
            </button>
          </form>
        </div>
      </section>
    )
  }

  const asked = (await searchParams).channel
  const missing = account.verified.email ? 'whatsapp' : 'email'
  const channel = asked === 'email' || asked === 'whatsapp' ? asked : missing
  const open = channel === 'email' || (await whatsappCodesOpen(req, env(), now))
  const proven = channel === 'email' ? account.verified.email : account.verified.mobile

  return (
    <section className={`iiic-page-narrow ${styles.page}`}>
      <CandidateMark status={SIGN_IN_COPY_STATUS} />
      <StepHeading focus={false}>
        {channel === 'email' ? LOGIN_COPY.emailLabel : LOGIN_COPY.mobileLabel}
      </StepHeading>
      {proven ? (
        <p className="iiic-alert iiic-alert-green" role="status">
          {DETAIL_COPY.alreadyYours}
        </p>
      ) : open ? (
        <>
          <p className={styles.lead}>{DETAIL_COPY.lead}</p>
          <DetailAddressForm channel={channel} />
        </>
      ) : (
        <p className="iiic-alert iiic-alert-yellow" role="status">
          {LOGIN_COPY.whatsappClosed}
        </p>
      )}
      <p className={styles.small}>
        <Link className="iiic-link" href="/account/privacy">
          {DETAIL_COPY.backToPrivacy}
        </Link>
      </p>
    </section>
  )
}
