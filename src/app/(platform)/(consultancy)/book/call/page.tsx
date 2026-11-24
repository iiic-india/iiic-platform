import { BookingPage, bookingMetadata } from '@/components/booking/BookingPage'

/** /book/call: the proposal call, in the consultancy register (docs/02, docs/03 F3). */
export const metadata = bookingMetadata('call')

export default function BookCallPage() {
  return <BookingPage type="call" />
}
