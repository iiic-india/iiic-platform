import type { Metadata } from 'next'

import styles from '@/components/account/account.module.css'
import { BookingTable } from '@/components/account/BookingTable'
import { BOOKINGS_COPY, titleOf } from '@/components/account/copy'
import { Scope } from '@/components/blocks/Scope'
import { isCounselling, listOwnBookings } from '@/lib/accounts/bookings'
import { accountRequest, openMyIiic } from '@/lib/accounts/scope'

export const metadata: Metadata = {
  title: titleOf(BOOKINGS_COPY.heading),
  robots: { index: false, follow: false },
}

/**
 * /account/bookings (docs/20 §7.2): upcoming bookings (soonest first) and past ones (latest
 * first) of every one of the account's records, each opening its own page. A page that lists a
 * counselling booking ends with the scope statement and the crisis numbers (docs/08 §7).
 */
export default async function BookingsPage() {
  const account = await openMyIiic('/account/bookings')
  const req = await accountRequest()
  const now = new Date()
  const [upcoming, past] = await Promise.all([
    listOwnBookings(req, account, 'upcoming', now),
    listOwnBookings(req, account, 'past', now),
  ])
  const counselling = [...upcoming, ...past].some(isCounselling)

  return (
    <div className={`iiic-page ${styles.page} ${styles.stack}`}>
      <h1 className="iiic-marked">{BOOKINGS_COPY.heading}</h1>
      <section aria-labelledby="upcoming">
        <h2 id="upcoming">{BOOKINGS_COPY.upcoming}</h2>
        <BookingTable
          bookings={upcoming}
          label={BOOKINGS_COPY.upcoming}
          empty={BOOKINGS_COPY.emptyUpcoming}
        />
      </section>
      <section aria-labelledby="past">
        <h2 id="past">{BOOKINGS_COPY.past}</h2>
        <BookingTable bookings={past} label={BOOKINGS_COPY.past} empty={BOOKINGS_COPY.emptyPast} />
      </section>
      {counselling ? <Scope /> : null}
    </div>
  )
}
