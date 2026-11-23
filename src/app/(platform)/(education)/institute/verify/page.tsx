import type { Metadata } from 'next'

import { FocusOnLoad } from '@/components/certificates/FocusOnLoad'
import { VerificationResult } from '@/components/certificates/VerificationResult'
import styles from '@/components/certificates/verify.module.css'
import type { VerificationView } from '@/lib/certificates/contract'
import { typedCertificateId } from '@/lib/certificates/ids'
import { VERIFY_PATH } from '@/lib/certificates/token'
import { VERIFY_COPY as COPY } from '@/lib/certificates/verifyCopy'
import { verifyById } from '@/lib/certificates/wiring'

/**
 * Never indexed (D-67): src/lib/security/headers.ts sends X-Robots-Tag on /institute/verify, and
 * the tag says the same. Read afresh on every request, so a revocation shows at once.
 */
export const metadata: Metadata = {
  title: COPY.title,
  description: COPY.description,
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

type Outcome =
  | { state: 'empty' }
  | { state: 'invalid'; typed: string }
  | { state: 'done'; typed: string; view: VerificationView }

/** The typed ID, checked before any lookup: its format and its check digit (Zod at the edge). */
async function outcomeOf(id: string | string[] | undefined): Promise<Outcome> {
  const typed = typeof id === 'string' ? id.slice(0, 40) : ''
  if (!typed.trim()) return { state: 'empty' }
  if (!typedCertificateId.safeParse(typed).success) return { state: 'invalid', typed }
  return { state: 'done', typed, view: await verifyById(typed) }
}

/**
 * /institute/verify (docs/18 §4): a plain GET form for the ID printed on a certificate, which
 * works without JavaScript. An ID in the wrong form or with a wrong check digit is answered with
 * the error summary, which takes focus, and never looked up. A real ID shows what IIIC's record
 * says, the name as initials; an unknown one, one plain "No certificate matches".
 */
export default async function VerifyByIdPage({ searchParams }: Props) {
  const outcome = await outcomeOf((await searchParams).id)
  const invalid = outcome.state === 'invalid'
  return (
    <section className={`iiic-page-narrow ${styles.page}`}>
      <h1>{COPY.heading}</h1>
      <p className={`iiic-lede ${styles.intro}`}>{COPY.intro}</p>
      {invalid ? (
        <FocusOnLoad className={`iiic-error-summary ${styles.summary}`}>
          <h2>{COPY.errorTitle}</h2>
          <ul>
            <li>
              <a href="#certificate-id">{COPY.idInvalid}</a>
            </li>
          </ul>
        </FocusOnLoad>
      ) : null}
      <form action={VERIFY_PATH} className={styles.form} method="get">
        <label className="iiic-label" htmlFor="certificate-id">
          {COPY.label}
        </label>
        <div className={styles.row}>
          <input
            aria-describedby={
              invalid ? 'certificate-id-error certificate-id-help' : 'certificate-id-help'
            }
            aria-invalid={invalid ? true : undefined}
            autoCapitalize="characters"
            autoComplete="off"
            className={`iiic-field ${styles.field}`}
            defaultValue={outcome.state === 'empty' ? undefined : outcome.typed}
            id="certificate-id"
            maxLength={40}
            name="id"
            spellCheck={false}
            type="text"
          />
          <button className="iiic-btn iiic-btn-primary" type="submit">
            {COPY.button}
          </button>
        </div>
        {invalid ? (
          <p className="iiic-error" id="certificate-id-error">
            {COPY.idInvalid}
          </p>
        ) : null}
        <p className="iiic-help" id="certificate-id-help">
          {COPY.help}
        </p>
      </form>
      {outcome.state === 'done' ? <VerificationResult by="id" view={outcome.view} /> : null}
    </section>
  )
}
