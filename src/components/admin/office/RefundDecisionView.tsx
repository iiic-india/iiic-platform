import { Gutter } from '@payloadcms/ui'
import Link from 'next/link'
import type { DocumentViewServerProps } from 'payload'

import { formatPaise, formatWhen } from '@/lib/office/copy'
import { isOfficeUser, may } from '@/lib/office/who'
import { REFUND_REASONS, REFUND_STATUSES } from '@/lib/payments/states'

import { OfficeActionForm } from './OfficeActionForm'
import styles from './Office.module.css'
import { OFFICE_VIEW_COPY as COPY } from './officeViewCopy'
import { labelOf, requireStaffWithCode } from './shared'

const idOf = (value: number | { id: number } | null | undefined): number | null =>
  typeof value === 'number' ? value : (value?.id ?? null)

/**
 * A refund's "Decision" tab (docs/05, Money; docs/16 §5): an owner with their code approves or
 * declines a refund that waits for them (above the threshold, or every refund while none is
 * set), with both answers at equal weight; the office sends a refund the gateway refused again.
 * The user, the code and the role are checked first; the endpoints check them again.
 */
export async function RefundDecisionView({ initPageResult, doc }: DocumentViewServerProps) {
  const { req } = initPageResult
  requireStaffWithCode(req)
  const admin = req.payload.config.routes.admin
  if (!isOfficeUser(req.user)) {
    return (
      <Gutter className={styles.view}>
        <p>{COPY.officeOnly}</p>
      </Gutter>
    )
  }
  const id = Number((doc as { id?: unknown } | undefined)?.id)
  const refund = Number.isInteger(id)
    ? await req.payload.findByID({
        collection: 'refunds',
        id,
        depth: 0,
        disableErrors: true,
        overrideAccess: false,
        req,
      })
    : null
  if (!refund) {
    return (
      <Gutter className={styles.view}>
        <p>{COPY.notFound}</p>
      </Gutter>
    )
  }
  const bookingId = idOf(refund.booking as number | { id: number } | null)

  return (
    <Gutter className={styles.view}>
      <h2 id="refund-decision">{COPY.refundTitle}</h2>
      <dl className={styles.facts}>
        <dt>{COPY.amount}</dt>
        <dd>{formatPaise(refund.amountPaise)}</dd>
        <dt>{COPY.reasonLabel}</dt>
        <dd>{labelOf(REFUND_REASONS, refund.reason)}</dd>
        <dt>{COPY.status}</dt>
        <dd>{labelOf(REFUND_STATUSES, refund.status)}</dd>
        <dt>{COPY.requested}</dt>
        <dd>{formatWhen(refund.createdAt)}</dd>
        {bookingId !== null ? (
          <>
            <dt>{COPY.booking}</dt>
            <dd>
              <Link href={`${admin}/collections/bookings/${bookingId}/office`}>{COPY.open}</Link>
            </dd>
          </>
        ) : null}
      </dl>

      {refund.status === 'awaitingApproval' ? (
        may(req.user, 'owner') ? (
          <section className={styles.panel}>
            <OfficeActionForm
              labelledBy="refund-decision"
              path={`/refunds/${refund.id}/decide`}
              submitLabel={COPY.decideSubmit}
            >
              <fieldset className={styles.fieldset}>
                <legend className={styles.legend}>{COPY.decisionLegend}</legend>
                <label className={styles.choice}>
                  <input name="decision" required type="radio" value="approve" />
                  <span>{COPY.approve}</span>
                </label>
                <label className={styles.choice}>
                  <input name="decision" required type="radio" value="decline" />
                  <span>{COPY.decline}</span>
                </label>
              </fieldset>
            </OfficeActionForm>
          </section>
        ) : (
          <p className={styles.panel}>{COPY.waitsForOwner}</p>
        )
      ) : refund.status === 'failed' ? (
        <section className={styles.panel}>
          <p className={styles.intro}>{COPY.failedNote(refund.failureCode)}</p>
          <OfficeActionForm
            labelledBy="refund-decision"
            path={`/refunds/${refund.id}/send`}
            submitLabel={COPY.resendSubmit}
          >
            {null}
          </OfficeActionForm>
        </section>
      ) : (
        <p className={styles.panel}>{COPY.nothingToDecide}</p>
      )}
    </Gutter>
  )
}
