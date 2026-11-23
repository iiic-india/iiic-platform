import type { FlowType } from '@/lib/bookingFlow/details'

/**
 * Every string the booking flow and the manage page show (en-IN), in one place (CLAUDE.md,
 * Conventions), written to src/brand/VOICE.md's interface patterns: verb and object on actions,
 * nouns on labels, errors that say what happened and how to fix it, no exclamation marks. The
 * flow carries no stories, bridges or Sanskrit line (docs/content/copy-architecture.md §4.12).
 * Facts (prices, policies, hours) are never written here: they come from the admin.
 */

export const STEP_NAMES = {
  choose: 'Choose',
  when: 'When',
  details: 'Details',
  pay: 'Pay',
  done: 'Done',
} as const

export const PAGE_TITLES: Record<FlowType, string> = {
  session: 'Book a session',
  call: 'Book a proposal call',
  info: 'Join a free info session',
}

export const FLOW_COPY = {
  progress: 'Booking progress',
  stepOf: (current: number, total: number) => `Step ${current} of ${total}`,
  back: 'Back',
  next: 'Continue',
  change: 'Change',

  // Step 1
  chooseHeading: {
    session: 'Choose your session',
    call: 'Choose what the call is about',
    info: 'Choose an info session',
  } satisfies Record<FlowType, string>,
  serviceLegend: { session: 'Session', call: 'Topic', info: 'Info session' } satisfies Record<
    FlowType,
    string
  >,
  lengthLegend: 'Length',
  minutes: (minutes: number) => `${minutes} minutes`,
  formatLegend: 'Where',
  formats: { online: 'Online', office: 'At the office' },
  practitionerLegend: 'With',
  full: 'Full',
  free: 'Free',
  totalNote: 'The total includes GST and does not change at a later step.',
  nothingToBook: {
    session: 'Sessions open for booking here once IIIC sets them up in the admin.',
    call: 'Proposal calls open for booking here once IIIC sets them up in the admin.',
    info: 'The next info sessions will appear here once IIIC sets their dates.',
  } satisfies Record<FlowType, string>,

  // Step 2
  whenHeading: 'Choose a day and a time',
  dayLegend: 'Day',
  timeLegend: 'Time',
  timesInIndia: 'Times are in India time (IST).',
  loadingTimes: 'Finding free times…',
  noTimes:
    'No free times are open online right now. Ask for a time that suits you and IIIC will reply with one.',
  rulesMissing:
    'Booking rules for this session are not set yet, so no times can be offered. Ask for a time instead.',
  requestToggle: 'Ask for another time',
  requestHeading: 'Ask for another time',
  requestHelp: 'Tell us the days and times that suit you. IIIC replies with a time.',
  preferredDaysLegend: 'Days that suit you',
  preferredTimesLabel: 'Times that suit you',
  preferredTimesHelp: 'For example: weekday mornings, or after 6 PM.',
  noteLabel: 'Anything we should know to find a time',
  noteHelp: 'Optional. Please do not write about what you want to talk about.',
  pickTimeInstead: 'Pick a free time instead',
  chooseTime: 'Choose a time, or ask for another time.',
  chooseDays: 'Choose at least one day that suits you.',

  // Step 3
  detailsHeading: 'Your details',
  fullName: 'Full name',
  mobile: 'Mobile number',
  mobileHelp: 'We send booking messages here. A number outside India needs its country code.',
  email: 'Email',
  workEmail: 'Work email',
  emailHelp: 'We send your confirmation here.',
  didYouMean: (address: string) => `Did you mean ${address}?`,
  useSuggestion: 'Use this address',
  whoForLegend: 'Who is the session for?',
  whoFor: { yourself: 'Myself', family: 'Someone in my family' },
  ageBandLegend: 'Age of the person the session is for',
  ageBands: { adult: '18 or over', under18: 'Under 18' },
  guardian: 'I am their parent or guardian, and I am booking for them.',
  guardianHelp:
    'Book in your own name. We ask nothing about the child until we can check a guardian’s consent.',
  company: 'Company',
  role: 'Your role',
  teamSize: 'Team size',
  sector: 'Sector',
  optional: '(optional)',
  consentsLegend: 'Your consent',
  consentsHelp:
    'Each box is separate and none is ticked for you. Only booking messages are needed to book.',
  consentMissing:
    'IIIC has not published the booking-messages consent text yet, so bookings cannot be taken online.',

  // Review
  reviewHeading: 'Check your booking',
  reviewWhat: 'What',
  reviewWhen: 'When',
  reviewWhere: 'Where',
  reviewWith: 'With',
  reviewTotal: 'Total',
  reviewTax: (tax: string, rate: string) => `Includes GST of ${tax} (${rate})`,
  reviewRequest: 'A time IIIC will agree with you',
  submit: {
    pay: 'Continue to payment',
    confirm: 'Confirm booking',
    request: 'Send request',
  },
  submitting: 'Sending…',
  payAfter: 'Your time is held while you pay. The total above is all you pay.',
  noPaymentNow: 'No payment is taken now.',

  // Errors
  errorSummary: (count: number) => (count === 1 ? 'Check 1 answer' : `Check ${count} answers`),
  errors: {
    'slot-taken': 'That time was just taken. Pick another time.',
    'outside-hours': 'That time is no longer offered. Pick another time.',
    'hold-expired': 'The time held for you ran out. Pick a time again.',
    'rule-missing': 'This session cannot be booked online yet. Ask for a time instead.',
    'not-found': 'That choice is no longer available. Start again from the first step.',
    full: 'That info session is full. Choose another one.',
    'consent-text-missing':
      'IIIC has not published the booking-messages consent text yet, so bookings cannot be taken online.',
    'payments-off': 'Online payment is not available right now. Please contact IIIC to pay.',
    'not-allowed': 'This change cannot be made online. Please contact IIIC.',
    failed: 'Something went wrong on our side. Nothing was booked. Please try again.',
    'invalid-input': 'Some answers need checking.',
  } as Record<string, string>,
} as const

const FAILED = 'Something went wrong on our side. Nothing was changed. Please try again.'

/** What the person reads for an error code the server answered with. */
export function errorMessage(code: string): string {
  return FLOW_COPY.errors[code] ?? FAILED
}

export const PAY_COPY = {
  heading: 'Pay for your session',
  held: (time: string) => `Your time is held for ${time}.`,
  heldHelp: 'If the time runs out before you pay, it is released for someone else.',
  lastMinute: 'One minute is left to pay before the time is released.',
  total: 'Total',
  pay: (amount: string) => `Pay ${amount}`,
  opening: 'Opening payment…',
  waiting: 'Checking your payment with the payment provider…',
  failed: 'The payment did not go through. No money was taken. You can try again.',
  gatewayDown: 'The payment provider is not answering. We have kept your time a little longer.',
  tryAgain: 'Try again',
  expired: 'The time held for you ran out before the payment arrived. Nothing was taken.',
  // A checkout was opened, so a late payment may still arrive (docs/16 §3): no fresh booking is
  // offered here, so nobody pays twice.
  expiredMayPay:
    'The time held for you ran out. If a payment went through, we confirm this booking if its time is still free, or refund the payment in full if not.',
  startAgain: 'Pick a time again',
  slotLost:
    'Someone else booked this time before your payment arrived. Your payment is being refunded in full to the way you paid, and nothing more is needed from you.',
  confirmed: 'Payment received. Your booking is confirmed.',
  testGateway: 'Test payment (this deployment has no real payment provider)',
  testPay: 'Pay with the test gateway',
  testFail: 'Fail the test payment',
  notYours:
    'This booking was made in another browser. Its details are in the confirmation message.',
} as const

export const CONFIRMED_COPY = {
  heading: {
    confirmed: 'Booked',
    requested: 'Request sent',
    pending: 'Waiting for your payment',
    other: 'Your booking',
  },
  confirmed:
    'You will get a confirmation by email, and a reminder before your session. Keep the reference below.',
  requested:
    'IIIC will reply with a time that suits you. Once you agree on it, your booking is confirmed.',
  pending: 'We have not received your payment yet. This page updates once we do.',
  reference: 'Reference',
  what: 'What',
  when: 'When',
  where: 'Where',
  with: 'With',
  online: 'Online. The link comes in your confirmation.',
  office: 'At the office. The address comes in your confirmation.',
  addToCalendar: 'Add to your calendar (.ics)',
  unknown: 'This address does not open a booking. Check the link in your confirmation message.',
  manage: 'Change or cancel this booking',
  manageHelp: 'Keep this link private: anyone with it can change your booking.',
  notYours:
    'A booking with this reference exists. Its details are in the confirmation message sent to the person who booked.',
  unpaidNote: 'No payment was taken. IIIC will tell you how to pay before your session.',
} as const

export const MANAGE_COPY = {
  heading: 'Your booking',
  status: {
    requested: 'Waiting for a time',
    held: 'Held while payment is made',
    pendingPayment: 'Waiting for payment',
    confirmed: 'Confirmed',
    completed: 'Completed',
    noShow: 'Missed',
    cancelledByClient: 'Cancelled by you',
    cancelledByIiic: 'Cancelled by IIIC',
    rescheduled: 'Moved to a new time',
    expired: 'The hold ran out',
  } as Record<string, string>,
  statusLabel: 'Status',
  notFound:
    'This link does not open a booking. It may have expired after the session, or the booking was moved to a new time and a new link was sent.',
  reschedule: 'Move to another time',
  rescheduleHeading: 'Choose a new time',
  rescheduleConfirm: 'Move my booking',
  rescheduled: (when: string) => `Moved. Your new time is ${when}.`,
  newLink: 'The link for your new booking',
  cannotReschedule:
    'This booking cannot be moved online. Contact IIIC to change it, and they will find a time with you.',
  cancel: 'Cancel booking',
  cancelHeading: 'Cancel this booking',
  refundAmount: (amount: string) => `You get ${amount} back, to the way you paid.`,
  refundSome: 'You get money back under the cancellation rule, to the way you paid.',
  noRefund: 'Nothing is refunded for this cancellation.',
  nothingPaid: 'Nothing has been paid, so there is nothing to refund.',
  refundOwner:
    'An owner at IIIC approves this refund before it is sent. You will hear from us when it is.',
  reasonLabel: 'Why are you cancelling?',
  reasonHelp: 'Optional. Please do not write about what you wanted to talk about.',
  cancelConfirm: 'Cancel my booking',
  keep: 'Keep my booking',
  cancelled: 'Cancelled. The time is free for someone else now.',
  refundSent: 'Your refund has been sent to the way you paid.',
  cannotCancel: 'This booking cannot be cancelled online. Contact IIIC to cancel it.',
  contact: 'Contact IIIC',
} as const
