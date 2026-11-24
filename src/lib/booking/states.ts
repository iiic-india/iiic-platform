/**
 * The states of a booking and of its payment, and the moves between them (docs/03 F3;
 * docs/16-booking-and-payments-design.md §3). The collection's select options and the database's
 * double-booking guard are built from these lists, so a state is added here and nowhere else.
 * The rules that make a move (who may, when) belong to the booking builder; this file holds the
 * vocabulary and the table of allowed moves only.
 */

export const BOOKING_STATUSES = [
  { value: 'requested', label: 'Requested' },
  { value: 'held', label: 'Held' },
  { value: 'pendingPayment', label: 'Pending payment' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'noShow', label: 'No-show' },
  { value: 'cancelledByClient', label: 'Cancelled by the client' },
  { value: 'cancelledByIiic', label: 'Cancelled by IIIC' },
  { value: 'rescheduled', label: 'Rescheduled' },
  // A hold whose time ran out before payment (B4): it no longer blocks the slot. Proposed in
  // docs/16 §3; docs/04's list has no word for it.
  { value: 'expired', label: 'Hold expired' },
] as const

export type BookingStatus = (typeof BOOKING_STATUSES)[number]['value']

/**
 * The states that keep a practitioner's time taken (docs/04, Rules the schema enforces): the
 * exclusion constraint covers exactly these (src/migrations, `bookings_no_overlap`). A time
 * request blocks nothing until a time is set on it, because the constraint covers only rows
 * with a start and an end.
 */
export const SLOT_BLOCKING_STATUSES = [
  'requested',
  'held',
  'pendingPayment',
  'confirmed',
] as const satisfies readonly BookingStatus[]

/** The states a booking may be created in: a time request, a hold, or confirmed at once. */
export const INITIAL_BOOKING_STATUSES = [
  'requested',
  'held',
  'confirmed',
] as const satisfies readonly BookingStatus[]

/** Every move a booking may make. A state that is not a key is final. */
export const BOOKING_MOVES = {
  requested: ['confirmed', 'cancelledByClient', 'cancelledByIiic'],
  held: ['pendingPayment', 'expired', 'cancelledByClient'],
  pendingPayment: ['confirmed', 'expired', 'cancelledByClient'],
  // A payment that arrives after its hold ran out confirms the booking only while the slot is
  // still free; the database decides (docs/03 F3, edge cases).
  expired: ['confirmed'],
  confirmed: ['completed', 'noShow', 'cancelledByClient', 'cancelledByIiic', 'rescheduled'],
} as const satisfies Partial<Record<BookingStatus, readonly BookingStatus[]>>

/**
 * Where the money on a booking stands (docs/03 F3: "Payment on a confirmed booking is tracked
 * separately"). `notRequired` is a free service; docs/03 lists the other four, and the partial
 * refund the refund rule can give.
 */
export const BOOKING_PAYMENT_STATUSES = [
  { value: 'notRequired', label: 'No payment' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'linkSent', label: 'Payment link sent' },
  { value: 'paid', label: 'Paid' },
  { value: 'partRefunded', label: 'Partly refunded' },
  { value: 'refunded', label: 'Refunded' },
] as const

export type BookingPaymentStatus = (typeof BOOKING_PAYMENT_STATUSES)[number]['value']

/** Who a booking is for (docs/03 F3 step 3), as Find your path asks it. */
export const BOOKING_FOR = [
  { value: 'yourself', label: 'Themselves' },
  { value: 'family', label: 'Their family' },
  { value: 'organisation', label: 'Their organisation' },
] as const

/** Where a booking takes place (D-03), as the client chose where the service offers both. */
export const BOOKING_FORMATS = [
  { value: 'online', label: 'Online' },
  { value: 'office', label: 'At the office' },
] as const

/** The kinds of booking Release 1 takes (docs/03 F3); a course seat waits for Release 2. */
export const BOOKING_TYPES = [
  { value: 'session', label: 'Session' },
  { value: 'call', label: 'Call' },
  { value: 'info', label: 'Info session' },
] as const

export type BookingType = (typeof BOOKING_TYPES)[number]['value']
