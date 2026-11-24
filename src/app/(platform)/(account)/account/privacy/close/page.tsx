import type { Metadata } from 'next'
import Link from 'next/link'
import { getPayload } from 'payload'

import { OutcomeNote } from '@/components/account/privacy/OutcomeNote'
import styles from '@/components/account/privacy/privacy.module.css'
import { SignInAgain } from '@/components/account/privacy/SignInAgain'
import { CandidateMark } from '@/components/blocks/PageBlocks'
import { closeAccountAction } from '@/lib/accounts/privacy/actions'
import { ACCOUNT_NOTICE_TODO, CLOSE_COPY, PRIVACY_COPY_STATUS } from '@/lib/accounts/privacy/copy'
import { CLOSE_PATH, PRIVACY_PATH, readOutcome } from '@/lib/accounts/privacy/outcome'
import { signedInRecently } from '@/lib/accounts/privacy/rules'
import { requireAccount } from '@/lib/accounts/privacy/seams'
import { currentNotice } from '@/lib/privacy/consents'
import config from '@payload-config'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: { absolute: CLOSE_COPY.title },
  robots: { index: false, follow: false },
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/** The privacy notice, beside what IIIC keeps. */
const PRIVACY_NOTICE_HREF = '/privacy'

/**
 * `/account/privacy/close` (docs/20 §7.5, §7.6): what closing the account does and what IIIC
 * keeps, the consent it withdraws, then "Close my account" and "No, thanks" at equal weight
 * (CLAUDE.md #9: closing is as plain as opening). Only within ten minutes of signing in (D-121):
 * an older session is offered "Sign in again" first. Closing itself is builder A's
 * `CloseAccount`, through the action.
 */
export default async function ClosePage({ searchParams }: Props) {
  const account = await requireAccount({ next: CLOSE_PATH })
  const outcome = readOutcome(await searchParams)
  const payload = await getPayload({ config })
  const notice = await currentNotice(payload, 'account', 'en-IN')
  const recent = signedInRecently(account, new Date())

  return (
    <div className={`iiic-page-narrow ${styles.page}`}>
      <CandidateMark status={PRIVACY_COPY_STATUS} />
      <h1>{CLOSE_COPY.heading}</h1>
      <OutcomeNote outcome={outcome} section="close" />
      <p className="iiic-lede">{CLOSE_COPY.lead}</p>

      <h2>{CLOSE_COPY.does}</h2>
      <ul className={styles.list}>
        {CLOSE_COPY.doesList.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <h2>{CLOSE_COPY.keeps}</h2>
      <p>{CLOSE_COPY.keepsText}</p>
      <p>{CLOSE_COPY.erasure}</p>
      <p>
        <Link className="iiic-link" href={PRIVACY_NOTICE_HREF}>
          {CLOSE_COPY.privacyNotice}
        </Link>
      </p>

      <h2>{CLOSE_COPY.notice}</h2>
      {notice ? (
        <p className={styles.notice}>{notice.text}</p>
      ) : (
        <p>
          <span className="iiic-todo">[[{ACCOUNT_NOTICE_TODO}]]</span>
        </p>
      )}

      {recent ? (
        <form action={closeAccountAction} className={styles.offer}>
          <div className="iiic-row">
            <button className="iiic-btn iiic-btn-primary" type="submit">
              {CLOSE_COPY.button}
            </button>
            <Link className="iiic-btn iiic-btn-secondary" href={PRIVACY_PATH}>
              {CLOSE_COPY.decline}
            </Link>
          </div>
        </form>
      ) : (
        <div className={styles.offer}>
          {/* Said once: the note above says it when the button was pressed too late. */}
          {outcome?.code === 'sign-in-again' ? null : <p>{CLOSE_COPY.recent}</p>}
          <div className="iiic-row">
            <SignInAgain back="close" />
            <Link className="iiic-btn iiic-btn-secondary" href={PRIVACY_PATH}>
              {CLOSE_COPY.decline}
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
