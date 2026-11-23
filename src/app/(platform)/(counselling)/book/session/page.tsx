import { BookingPage, bookingMetadata } from '@/components/booking/BookingPage'

/** /book/session: a counselling session, in the counselling register (docs/02, docs/03 F3). */
export const metadata = bookingMetadata('session')

export default function BookSessionPage() {
  return <BookingPage type="session" />
}
