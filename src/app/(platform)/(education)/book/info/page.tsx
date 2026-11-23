import { BookingPage, bookingMetadata } from '@/components/booking/BookingPage'

/** /book/info: a free info session about the course, in the education register (docs/02). */
export const metadata = bookingMetadata('info')

export default function BookInfoPage() {
  return <BookingPage type="info" />
}
