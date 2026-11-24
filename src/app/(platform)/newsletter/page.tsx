import type { Metadata } from 'next'
import { getPayload } from 'payload'

import { CandidateMark } from '@/components/blocks/PageBlocks'
import { turnstileKeys } from '@/lib/enquiryForms/turnstile'
import { env } from '@/lib/env'
import {
  CONFIRM_COPY,
  NEWSLETTER_COPY_STATUS,
  SIGNUP_COPY,
  UNSUBSCRIBE_COPY,
} from '@/lib/newsletter/copy'
import { currentNotice } from '@/lib/privacy/consents'
import config from '@payload-config'

import { FocusOnArrival } from './FocusOnArrival'
import styles from './newsletter.module.css'
import { SignupForm } from './SignupForm'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: SIGNUP_COPY.title,
  alternates: { canonical: '/newsletter' },
}

type Tone = 'green' | 'yellow' | 'red'

/** What the page says after a form, by the state the route sent it on with. */
const OUTCOMES: Record<string, { text: string; tone: Tone; form: boolean }> = {
  sent: { text: SIGNUP_COPY.sent, tone: 'green', form: false },
  busy: { text: SIGNUP_COPY.busy, tone: 'yellow', form: true },
  'check-failed': { text: SIGNUP_COPY.checkFailed, tone: 'yellow', form: true },
  closed: { text: SIGNUP_COPY.closed, tone: 'yellow', form: false },
  failed: { text: SIGNUP_COPY.failed, tone: 'red', form: true },
  confirmed: { text: CONFIRM_COPY.done, tone: 'green', form: false },
  already: { text: CONFIRM_COPY.already, tone: 'green', form: false },
  'invalid-link': { text: CONFIRM_COPY.invalid, tone: 'yellow', form: true },
  expired: { text: CONFIRM_COPY.expired, tone: 'yellow', form: true },
  'confirm-failed': { text: CONFIRM_COPY.failed, tone: 'red', form: false },
  unsubscribed: { text: UNSUBSCRIBE_COPY.done, tone: 'green', form: false },
  'unsubscribe-failed': { text: UNSUBSCRIBE_COPY.failed, tone: 'red', form: false },
}

const OUTCOME_ID = 'newsletter-outcome'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/**
 * `/newsletter` (docs/19 §8; D-10): the signup on its own, and where every newsletter form and
 * link lands with its outcome, read out first. Works without JavaScript.
 */
export default async function NewsletterPage({ searchParams }: Props) {
  const raw = (await searchParams).state
  const state = typeof raw === 'string' ? raw : undefined
  const outcome = state ? OUTCOMES[state] : undefined
  const invalid = state === 'invalid'
  const payload = await getPayload({ config })
  const notice = await currentNotice(payload, 'marketingEmail', 'en-IN')

  return (
    <section className={`iiic-page-narrow ${styles.page}`}>
      <CandidateMark status={NEWSLETTER_COPY_STATUS} />
      <h1>{SIGNUP_COPY.heading}</h1>
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
      {!outcome || outcome.form ? (
        <>
          <p>{SIGNUP_COPY.lead}</p>
          <SignupForm
            notice={notice?.text ?? null}
            source="/newsletter"
            invalid={invalid}
            turnstileSiteKey={turnstileKeys(env())?.siteKey ?? null}
          />
        </>
      ) : null}
    </section>
  )
}
