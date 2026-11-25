import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createLocalReq, getPayload } from 'payload'

import styles from '@/components/account/signIn/signIn.module.css'
import { AddressForm } from '@/components/account/signIn/SignInForms'
import { CandidateMark } from '@/components/blocks/PageBlocks'
import { getAccountSession } from '@/lib/accounts/session'
import { safeNext } from '@/lib/accounts/signIn/cookie'
import { LOGIN_COPY, PRIVACY_NOTICE, SIGN_IN_COPY_STATUS } from '@/lib/accounts/signIn/copy'
import { deploymentGate } from '@/lib/accounts/signIn/gate'
import { whatsappCodesOpen } from '@/lib/accounts/signIn/issue'
import { turnstileKeys } from '@/lib/enquiryForms/turnstile'
import { env } from '@/lib/env'
import { readFlags } from '@/lib/settings/source'
import config from '@payload-config'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: { absolute: LOGIN_COPY.title },
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

const one = (value: string | string[] | undefined) =>
  typeof value === 'string' ? value : undefined

/**
 * `/login` (docs/20 §4.1, step 1; §4.9): "Sign in to My IIIC", with the email form and, once
 * WhatsApp codes are open, the mobile form beside it. A 404 while `accountsEnabled` is off; on a
 * preview, or without Better Auth's secret, a line saying sign-in is closed here and no form. A
 * person already signed in goes on to My IIIC, unless a step asked them to sign in again
 * (`?again=1`, D-121). Works without JavaScript, except Turnstile's check where its keys are set.
 */
export default async function LoginPage({ searchParams }: Props) {
  const payload = await getPayload({ config })
  if (!(await readFlags(payload)).accountsEnabled) notFound()
  const settings = env()
  const gate = deploymentGate(settings)
  const params = await searchParams
  const next = safeNext(one(params.next))
  const again = one(params.again) === '1'
  if (gate === 'open' && !again && (await getAccountSession())) redirect(next ?? '/account')
  const whatsapp =
    gate === 'open' &&
    (await whatsappCodesOpen(await createLocalReq({}, payload), settings, new Date()))
  const turnstileSiteKey = turnstileKeys(settings)?.siteKey ?? null

  return (
    <section className={`iiic-page-narrow ${styles.page}`}>
      <CandidateMark status={SIGN_IN_COPY_STATUS} />
      <h1>{again ? LOGIN_COPY.againHeading : LOGIN_COPY.heading}</h1>
      {gate === 'preview' ? (
        <p className="iiic-alert iiic-alert-yellow" role="status">
          {LOGIN_COPY.closedPreview}
        </p>
      ) : gate === 'no-secret' ? (
        <p className="iiic-alert iiic-alert-yellow" role="status">
          {LOGIN_COPY.notOpen}
        </p>
      ) : (
        <>
          <p className={styles.lead}>{again ? LOGIN_COPY.again : LOGIN_COPY.lead}</p>
          <AddressForm
            channel="email"
            turnstileSiteKey={turnstileSiteKey}
            {...(next ? { next } : {})}
          />
          {whatsapp ? (
            <div className={styles.divider}>
              <h2>{LOGIN_COPY.whatsappHeading}</h2>
              <AddressForm
                channel="whatsapp"
                turnstileSiteKey={turnstileSiteKey}
                {...(next ? { next } : {})}
              />
            </div>
          ) : null}
          <p className={`iiic-help ${styles.small}`}>
            <Link className="iiic-link" href={PRIVACY_NOTICE.href}>
              {PRIVACY_NOTICE.label}
            </Link>
          </p>
        </>
      )}
    </section>
  )
}
