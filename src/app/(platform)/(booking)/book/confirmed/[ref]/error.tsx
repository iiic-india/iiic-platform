'use client'

import { BookingError } from '@/components/booking/BookingError'

/** The 500 on the confirmation, in the booking's register (docs/11 §5.2). */
export default function ConfirmedError({ error }: { error: Error & { digest?: string } }) {
  return <BookingError error={error} />
}
