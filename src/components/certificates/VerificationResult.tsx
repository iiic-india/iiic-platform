import Link from 'next/link'

import type { VerificationView } from '@/lib/certificates/contract'
import { CERTIFICATE_AWAITS, CERTIFICATE_STATEMENT } from '@/lib/certificates/statement'
import { VERIFY_PATH } from '@/lib/certificates/token'
import { VERIFY_COPY as COPY } from '@/lib/certificates/verifyCopy'
import { formatIstDate } from '@/lib/time/ist'

import styles from './verify.module.css'

/** A day kept as YYYY-MM-DD (India time), written as VOICE.md writes dates: 6 November 2026. */
export function dayText(day: string): string {
  return formatIstDate(new Date(`${day}T12:00:00+05:30`))
}

/** The address that checks a certificate by its ID. */
export const checkIdHref = (id: string) => `${VERIFY_PATH}?id=${encodeURIComponent(id)}`

/**
 * What IIIC's record shows of one certificate (docs/18 §4): its ID, Valid or Revoked (with the
 * day, and the new ID for a reissue), the name (initials by a typed ID), the programme, the days,
 * and the fixed statement. Never the reason, a contact detail or the PDF. The status is written in
 * words as well as shown by the badge's colour.
 */
export function VerificationResult({
  view,
  by,
}: {
  view: VerificationView
  by: 'token' | 'id'
}) {
  if (!view.found) {
    return (
      <section aria-labelledby="verify-result" className={styles.result}>
        <h2 id="verify-result">{COPY.notFoundHeading}</h2>
        <p className={styles.note}>{by === 'id' ? COPY.notFoundById : COPY.notFoundByToken}</p>
        {by === 'token' ? (
          <p>
            <Link className="iiic-link" href={VERIFY_PATH}>
              {COPY.typeTheId}
            </Link>
          </p>
        ) : null}
      </section>
    )
  }

  const revoked = view.status === 'revoked'
  return (
    <section aria-labelledby="verify-result" className={styles.result}>
      <h2 id="verify-result">{COPY.resultHeading(view.certificateId)}</h2>
      <p className={styles.status}>
        <span className={`iiic-badge ${revoked ? 'iiic-badge-red' : 'iiic-badge-green'}`}>
          {revoked ? COPY.revoked : COPY.valid}
        </span>
      </p>
      <p className={styles.note}>
        {revoked
          ? COPY.revokedNote(view.revokedOn ? dayText(view.revokedOn) : null)
          : COPY.validNote}
        {revoked && view.replacedBy ? (
          <>
            {' '}
            {COPY.replacedBy} <strong>{view.replacedBy}</strong>.{' '}
            <Link className="iiic-link" href={checkIdHref(view.replacedBy)}>
              {COPY.checkReplacement(view.replacedBy)}
            </Link>
          </>
        ) : null}
      </p>
      <dl className={styles.record}>
        <dt>{COPY.fields.id}</dt>
        <dd>{view.certificateId}</dd>
        <dt>{COPY.fields.status}</dt>
        <dd>{revoked ? COPY.revoked : COPY.valid}</dd>
        <dt>{COPY.fields.name}</dt>
        <dd>{view.name}</dd>
        <dt>{COPY.fields.programme}</dt>
        <dd>{view.programmeName}</dd>
        {view.programmeDetails ? (
          <>
            <dt>{COPY.fields.details}</dt>
            <dd>{view.programmeDetails}</dd>
          </>
        ) : null}
        <dt>{COPY.fields.completedOn}</dt>
        <dd>{dayText(view.completedOn)}</dd>
        <dt>{COPY.fields.issuedOn}</dt>
        <dd>{dayText(view.issuedOn)}</dd>
      </dl>
      {by === 'id' ? <p className={styles.note}>{COPY.initialsNote}</p> : null}
      <Statement />
    </section>
  )
}

/** The fixed statement every certificate prints (statement.ts), marked until the review (I-22). */
export function Statement() {
  return (
    <div className={styles.statement}>
      <p>
        <span className="iiic-badge" data-draft={CERTIFICATE_AWAITS}>
          {COPY.draftMark} ({CERTIFICATE_AWAITS})
        </span>
      </p>
      <h3>{COPY.statementHeading}</h3>
      <div className="iiic-prose">
        {CERTIFICATE_STATEMENT.map((sentence) => (
          <p key={sentence}>{sentence}</p>
        ))}
      </div>
    </div>
  )
}
