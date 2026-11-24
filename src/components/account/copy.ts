import { INVOICE_KINDS } from '@/lib/payments/states'
import { CONTACT } from '@/lib/site/contact'

/**
 * Every string My IIIC's records show (en-IN), in one place (CLAUDE.md, Conventions; docs/20
 * §7.1 to §7.4): the section links, the overview, bookings, documents and invoices. Written to
 * src/brand/VOICE.md's interface patterns (verb and object on actions, nouns on labels, errors
 * that say what happened and what to do, empty states that say what will appear and why) and
 * candidate copy until IIIC approves it (I-41). The booking's own words (labels, statuses, the
 * refund lines) are the manage page's (src/components/booking/copy.ts), so a booking reads the
 * same wherever it is opened. No price, no offer, no recommendation (D-21, D-124), nothing
 * clinical.
 */

export const MY_IIIC = 'My IIIC'

/** "Bookings · My IIIC": the page named in the title (docs/20 §4.1, accessible authentication). */
export const titleOf = (page: string) => `${page} · ${MY_IIIC}`

export const NAV_COPY = {
  label: MY_IIIC,
  sections: [
    { href: '/account', label: 'Overview' },
    { href: '/account/bookings', label: 'Bookings' },
    { href: '/account/documents', label: 'Documents' },
    { href: '/account/invoices', label: 'Invoices' },
    { href: '/account/privacy', label: 'Privacy' },
  ],
  signOut: 'Sign out',
} as const

export const OVERVIEW_COPY = {
  heading: (firstName: string | null) => (firstName ? `Hello, ${firstName}` : 'Hello'),
  lede: 'Your bookings with IIIC, your certificates and your invoices, in one place.',
  nextHeading: 'Your next booking',
  openBooking: 'See this booking',
  change: 'Change or cancel',
  sectionsHeading: 'What is here',
  sections: [
    {
      href: '/account/bookings',
      label: 'Bookings',
      line: 'Upcoming and past bookings. Move or cancel one where its rules allow.',
    },
    {
      href: '/account/documents',
      label: 'Documents',
      line: 'Your certificates of completion, to download or to check online.',
    },
    {
      href: '/account/invoices',
      label: 'Invoices',
      line: 'Invoices and credit notes for your bookings.',
    },
    {
      href: '/account/privacy',
      label: 'Privacy',
      line: 'What you have agreed to, requests about your data, and closing your account.',
    },
  ],
  emptyHeading: 'No upcoming bookings',
  empty:
    'Bookings made with the email address or mobile number you signed in with appear here, including ones made before you had an account.',
} as const

export const BOOKINGS_COPY = {
  heading: 'Bookings',
  upcoming: 'Upcoming',
  past: 'Past',
  columns: { booking: 'Booking', what: 'What', when: 'When', status: 'Status' },
  noTimeYet: 'A time IIIC will agree with you',
  emptyUpcoming:
    'No upcoming bookings. Bookings made with the email address or mobile number you signed in with appear here.',
  emptyPast: 'No past bookings yet.',
} as const

export const BOOKING_COPY = {
  allBookings: 'All bookings',
  joinOnline: 'Open the meeting link',
  movedTo: 'This booking moved to a new time.',
  seeNew: 'See the new booking',
  noTimes: `No free times are open online right now. To move this booking, call ${CONTACT.phone} or write to ${CONTACT.email}.`,
  notYoursHeading: 'Not your booking?',
  notYours:
    'If this booking is not yours, ask IIIC to correct your records. Nothing is changed until IIIC has looked at it.',
  notYoursLink: 'Ask for a correction',
  errorSummary: 'Check this',
  failed: 'Something went wrong on our side. Nothing was changed. Please try again.',
  errors: {
    'choose-time': 'Choose a new time.',
    'slot-taken': 'That time was just taken, or is no longer offered. Pick another time.',
    'outside-policy': `This booking cannot be changed online now. Call ${CONTACT.phone} or write to ${CONTACT.email}.`,
    'not-found': 'This booking is not in your account.',
    'invalid-input': 'That answer could not be read. Try again.',
    'closed-here': `This preview of the site changes no bookings. Write to ${CONTACT.email} instead.`,
  } as Record<string, string>,
} as const

/** What the person reads for an error code a booking change answered with. */
export function bookingError(code: string): string {
  return BOOKING_COPY.errors[code] ?? BOOKING_COPY.failed
}

export const DOCUMENTS_COPY = {
  heading: 'Documents',
  lede: 'Your certificates of completion from IIIC.',
  columns: {
    id: 'Certificate ID',
    programme: 'Programme',
    completed: 'Completed',
    status: 'Status',
    actions: 'Files',
  },
  status: { valid: 'Valid', revoked: 'Revoked' } as Record<string, string>,
  download: 'Download the PDF',
  check: 'Check it online',
  forId: (id: string) => `, certificate ${id}`,
  empty:
    'No certificates yet. A certificate of completion appears here once IIIC issues one to you.',
} as const

export const INVOICES_COPY = {
  heading: 'Invoices',
  lede: 'Invoices and credit notes for your bookings, as IIIC issued them.',
  columns: {
    number: 'Number',
    kind: 'Document',
    date: 'Date',
    status: 'Status',
    total: 'Total',
    actions: 'File',
  },
  kind: Object.fromEntries(INVOICE_KINDS.map((kind) => [kind.value, kind.label])) as Record<
    string,
    string
  >,
  status: { issued: 'Issued', void: 'Voided' } as Record<string, string>,
  download: 'Download the PDF',
  forNumber: (number: string) => `, ${number}`,
  pdfByReply: `For the PDF of one of these, reply to the email it came with, or call ${CONTACT.phone}.`,
  noNumber: 'Not numbered yet',
  empty:
    'No invoices yet. Invoices and credit notes for your bookings appear here once IIIC issues them.',
} as const
