import Link from 'next/link'
import type { AdminViewServerProps } from 'payload'

import { loadProof } from '@/lib/adminViews/proof'
import { formatIstDate, formatIstTime } from '@/lib/time/ist'

import { MarkRead } from './MarkRead'
import { guardView, ViewFrame } from './ViewFrame'
import styles from './Views.module.css'
import { VIEWS_COPY } from './viewsCopy'

const COPY = VIEWS_COPY.proof

const when = (value: string) => {
  const at = new Date(value)
  return Number.isNaN(at.getTime()) ? '' : `${formatIstDate(at)}, ${formatIstTime(at)}`
}

/**
 * Proof moderation (docs/05, Proof; docs/18 §6): the queues and each one's next step. Feedback is
 * marked read here and read in full on its record; reviews and case studies are moved on their
 * records, where the collections check consent, the client's approval and who publishes. The
 * owner-only step (publishing) is offered to owners only. The user, the code and the role are
 * checked before anything is read.
 */
export async function ProofView(props: AdminViewServerProps) {
  const allowed = guardView(props, 'proof')
  const { req } = props.initPageResult
  const admin = req.payload.config.routes.admin
  const loaded = allowed ? await loadProof(req) : null
  const data = loaded?.ok ? loaded.value : null

  return (
    <ViewFrame allowed={data !== null} props={props} title={COPY.title} who={COPY.who}>
      {data ? (
        <>
          <p className={styles.intro}>{COPY.intro}</p>
          <section aria-labelledby="proof-feedback" className={styles.section}>
            <h2 id="proof-feedback">
              {COPY.feedback}: {data.feedback.length}
            </h2>
            {data.feedback.length === 0 ? (
              <p>{COPY.feedbackNone}</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">{COPY.received}</th>
                    <th scope="col">{COPY.rating}</th>
                    <th scope="col">{COPY.step}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.feedback.map((item) => (
                    <tr key={item.id}>
                      <th scope="row">
                        <Link
                          className={styles.target}
                          href={`${admin}/collections/feedback/${item.id}`}
                        >
                          {when(item.submittedAt)}
                        </Link>
                      </th>
                      <td data-label={COPY.rating}>{COPY.ratingOf(item.rating)}</td>
                      <td>
                        <MarkRead
                          done={COPY.marked}
                          failed={COPY.markFailed}
                          id={item.id}
                          label={COPY.markRead}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section aria-labelledby="proof-reviews" className={styles.section}>
            <h2 id="proof-reviews">{COPY.reviews}</h2>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{COPY.status}</th>
                  <th scope="col">{COPY.count}</th>
                </tr>
              </thead>
              <tbody>
                {data.reviews.counts.map((row) => (
                  <tr key={row.status}>
                    <th scope="row">
                      <Link
                        className={styles.target}
                        href={`${admin}/collections/testimonials?where[status][equals]=${row.status}`}
                      >
                        {row.label}
                      </Link>
                    </th>
                    <td data-label={COPY.count}>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3>{COPY.reviewsWaiting}</h3>
            {data.reviews.waiting.length === 0 ? (
              <p>{COPY.reviewsNone}</p>
            ) : (
              <ul className={styles.list}>
                {data.reviews.waiting.map((review) => (
                  <li key={review.id}>
                    <Link
                      className={styles.target}
                      href={`${admin}/collections/testimonials/${review.id}`}
                    >
                      {review.title}
                    </Link>{' '}
                    ({review.status})
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="proof-case-studies" className={styles.section}>
            <h2 id="proof-case-studies">{COPY.caseStudies}</h2>
            {data.caseStudies.length === 0 ? (
              <p>{COPY.caseStudiesNone}</p>
            ) : (
              <ul className={styles.list}>
                {data.caseStudies.map((study) => (
                  <li key={study.id}>
                    <Link
                      className={styles.target}
                      href={`${admin}/collections/case-studies/${study.id}`}
                    >
                      {study.title}
                    </Link>{' '}
                    ({study.label})
                    {data.publishes && study.status === 'approved'
                      ? `: ${COPY.ownerPublishes}`
                      : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </ViewFrame>
  )
}
