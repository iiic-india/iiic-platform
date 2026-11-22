/**
 * The words of the office's views in the admin (docs/16 §12, E), in one place for the locale
 * (en-IN), checked against src/brand/VOICE.md: buttons are a verb and its object, labels are
 * nouns, helper text says what happens with the answer. Staff read them; no client does.
 */
export const OFFICE_VIEW_COPY = {
  // Shared
  errorTitle: 'That did not go through',
  failed: 'That did not work. Reload the page and try again.',
  offline: 'The server could not be reached. Check the connection and try again.',
  working: 'Working…',
  officeOnly: 'Only the office (an owner or operator) acts on bookings and refunds here.',
  notFound: 'This record was not found. It may have been removed, or your account cannot read it.',
  indiaTime: 'India time.',

  // The booking
  bookingTitle: 'Office actions',
  bookingIntro:
    'Each action checks the booking again before it changes anything, and every change is in the audit log.',
  reference: 'Reference',
  status: 'Status',
  payment: 'Payment',
  when: 'Time',
  noTime: 'No time yet',
  total: 'Total (all-in)',
  noPrice: 'No price on this booking',

  confirmTitle: 'Confirm the time request',
  preferredDays: 'Preferred days',
  preferredTimes: 'Preferred times',
  note: 'Their note',
  none: 'None given',
  agreedTime: 'Agreed time',
  agreedHint: 'The time you agreed with the client, in India time. The calendar entry follows.',
  practitioner: 'Practitioner',
  choosePractitioner: 'Choose a practitioner',
  confirmSubmit: 'Confirm this time',

  rescheduleTitle: 'Move the booking',
  newTime: 'New time',
  newTimeHint:
    'In India time. Any time ahead that is free for the practitioner; the client’s reschedule window does not apply to the office.',
  rescheduleSubmit: 'Move the booking',

  linkTitle: 'Payment link',
  linkAmount: (amount: string) =>
    `The link asks for ${amount}, the booking’s total. The client sees the amount before paying.`,
  linkAgain: 'Making a new link cancels the one sent before.',
  linkEnds: 'Link ends (optional)',
  linkEndsHint: 'In India time, at least 16 minutes from now. Empty: the gateway’s own limit.',
  linkSubmit: 'Create a payment link',
  linkSubmitAgain: 'Create a new payment link',

  cancelTitle: 'Cancel the booking',
  refundFirst: 'The refund the policy gives now, before you confirm:',
  who: 'Who is cancelling',
  byClient: 'The client asked to cancel',
  byIiic: 'IIIC is cancelling',
  refundOf: (amount: string) => `refund ${amount}`,
  noRefund: 'no refund',
  notFromHere: 'not possible from this state',
  inFull: 'everything paid, as IIIC is cancelling',
  noRule:
    'No refund rule is set for this service yet (I-07), so a cancellation for the client refunds nothing. To give money back, request a refund by hand under Money → Refunds.',
  threshold:
    'A refund above the approval limit in Settings, or any refund while no limit is set, waits for an owner.',
  reason: 'Reason',
  reasonHint: 'Kept on the booking for the office. Write what happened, not what was said in a session.',
  cancelSubmit: 'Cancel the booking',

  refundsTitle: 'Refunds on this booking',
  refundsNone: 'No refunds on this booking.',
  amount: 'Amount',
  record: 'Record',
  open: 'Open',

  // The refund
  refundTitle: 'Decision',
  requested: 'Requested',
  reasonLabel: 'Reason',
  booking: 'Booking',
  decisionLegend: 'Your decision',
  approve: 'Approve the refund',
  decline: 'Decline the refund',
  decideSubmit: 'Record the decision',
  waitsForOwner: 'This refund waits for an owner, who approves or declines it here with their code.',
  failedNote: (code: string | null | undefined) =>
    `The gateway refused this refund${code ? ` (${code})` : ''}. Send it again once the reason is cleared.`,
  resendSubmit: 'Send the refund again',
  nothingToDecide: 'Nothing waits for a decision on this refund.',

  // Working hours
  hoursTitle: 'Working hours',
  hoursIntro:
    'The weekly hours and exceptions clients book from, and the times they would be offered. Clients see no times until the calendar is connected.',
  hoursNav: 'Working hours',
  whose: 'Whose hours',
  show: 'Show',
  weekly: 'Weekly hours',
  weeklyNone: 'No working hours yet. Until some are set, no time is offered (I-24).',
  addHours: 'Add working hours',
  exceptions: 'Exceptions from today',
  exceptionsNone: 'No exceptions ahead.',
  addException: 'Add an exception',
  closed: 'Closed all day',
  from: 'From',
  until: 'until',
  edit: 'Edit',
  previewTitle: 'Bookable times',
  previewOption: 'Service and length',
  previewChoose: 'Choose a service',
  previewSubmit: 'Show bookable times',
  previewNoOptions: 'This profile offers no bookable service with a set length yet.',
  previewNone: 'No bookable times in the booking horizon.',
  calendarNotConnected:
    'The calendar is not connected, so clients are offered none of these yet (I-24).',
  minutes: (minutes: number) => `${minutes} minutes`,
} as const
