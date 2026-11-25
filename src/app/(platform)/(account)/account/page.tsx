import type { Metadata } from 'next'
import Link from 'next/link'

import styles from '@/components/account/account.module.css'
import { BookingDetails } from '@/components/account/BookingDetails'
import { MY_IIIC, MY_IIIC_COPY_STATUS, OVERVIEW_COPY } from '@/components/account/copy'
import { CandidateMark } from '@/components/blocks/PageBlocks'
import { Scope } from '@/components/blocks/Scope'
import { isCounselling, listOwnBookings } from '@/lib/accounts/bookings'
import { accountRequest, openMyIiic, ownFirstName } from '@/lib/accounts/scope'

export const metadata: Metadata = {
  title: MY_IIIC,
  robots: { index: false, follow: false },
}

/**
 * /account, My IIIC's overview (docs/20 §7.1): the person's first name from their own record,
 * their next booking as its confirmation shows it with "Add to your calendar" and "Change or
 * cancel", and the sections with one line each. Nothing is recommended here (D-124): a
 * recommendation is a bridge, and bridges come with their own rules (D-18). When the next booking
 * is a counselling one, the page ends with the scope statement and the crisis numbers
 * (docs/08 §7), and nothing else is offered beside it.
 */
export default async function OverviewPage() {
  const account = await openMyIiic('/account')
  const req = await accountRequest(account)
  const [name, upcoming] = await Promise.all([
    ownFirstName(req, account),
    listOwnBookings(req, account, 'upcoming', new Date()),
  ])
  const next = upcoming[0] ?? null

  return (
    <div className={`iiic-page ${styles.page} ${styles.stack}`}>
      <CandidateMark status={MY_IIIC_COPY_STATUS} />
      <div>
        <h1 className="iiic-marked">{OVERVIEW_COPY.heading(name)}</h1>
        <p className="iiic-lede">{OVERVIEW_COPY.lede}</p>
      </div>

      <section aria-labelledby="next-booking">
        <h2 id="next-booking">{OVERVIEW_COPY.nextHeading}</h2>
        {next ? (
          <div className="iiic-panel">
            <BookingDetails booking={next} />
            <div className="iiic-row">
              <Link
                className="iiic-btn iiic-btn-secondary"
                href={`/account/bookings/${encodeURIComponent(next.reference)}`}
                prefetch={false}
              >
                {next.canReschedule || next.canCancel
                  ? OVERVIEW_COPY.change
                  : OVERVIEW_COPY.openBooking}
              </Link>
            </div>
          </div>
        ) : (
          <div className="iiic-empty">
            <h3>{OVERVIEW_COPY.emptyHeading}</h3>
            <p>{OVERVIEW_COPY.empty}</p>
          </div>
        )}
      </section>

      <section aria-labelledby="sections">
        <h2 id="sections">{OVERVIEW_COPY.sectionsHeading}</h2>
        <ul>
          {OVERVIEW_COPY.sections.map((section) => (
            <li key={section.href}>
              <Link className="iiic-link" href={section.href} prefetch={false}>
                {section.label}
              </Link>
              : {section.line}
            </li>
          ))}
        </ul>
      </section>

      {next && isCounselling(next) ? <Scope /> : null}
    </div>
  )
}
