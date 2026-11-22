import { formatIstDate, formatIstTime } from '@/lib/time/ist'

/**
 * The words of the office's money and calendar actions (docs/16 §12, E), in one place for the
 * locale (en-IN), checked against src/brand/VOICE.md: errors say what happened and how to fix
 * it, confirmations say what is done and what happens next. Staff read these in the admin; no
 * client sees them, so the amounts here are no breach of D-21 (owners and operators see prices).
 */

const RUPEES = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const RUPEES_PAISE = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** An amount as VOICE.md writes money: ₹12,500, with the paise only when there are some. */
export function formatPaise(paise: number): string {
  const whole = paise % 100 === 0
  return `₹${(whole ? RUPEES : RUPEES_PAISE).format(paise / 100)}`
}

/** A time in India as VOICE.md writes one: 6 November 2026 at 3:30 PM. */
export function formatWhen(instant: Date | string): string {
  const date = typeof instant === 'string' ? new Date(instant) : instant
  return `${formatIstDate(date)} at ${formatIstTime(date)}`
}

/** What each refusal or failure says, by its code. */
export const OFFICE_ERRORS: Record<string, string> = {
  'sign-in': 'Sign in to do this.',
  'enter-code': 'Enter your two-factor code first, then try again.',
  'not-allowed': 'Your account cannot do this.',
  forbidden: 'Your account cannot do this.',
  'needs-owner': 'Only an owner, with their two-factor code entered, decides this refund.',
  'invalid-input': 'Some details are missing or not in the right form.',
  'not-found': 'That record was not found. Reload the page to see where it stands.',
  'slot-taken': 'That time is taken. Pick another time.',
  'outside-hours': 'That time cannot be booked. Pick a time that is still ahead.',
  'hold-expired': 'The hold on this time has run out. Reload the page to see where it stands.',
  'not-active': 'This booking can no longer be changed.',
  started: 'This booking has started, so it can no longer be changed.',
  'bad-move':
    'The booking or payment has moved on since the page was opened. Reload the page to see where it stands.',
  'rule-missing':
    'A booking rule is not set for this service (notice, horizon, buffer or hold minutes). An owner sets it on the service or in Settings.',
  'refund-changed':
    'The refund the policy gives has changed since the page was opened. Reload the page, check the new amount and confirm again.',
  'free-service': 'This booking has no price, so there is nothing to pay.',
  'prices-hidden': 'Payment at booking is off.',
  'over-refund': 'That is more than the payment can still give back.',
  'not-configured': 'Payments are not set up on this site yet: the Razorpay keys are missing (I-04).',
  unavailable: 'The payment gateway did not answer. Try again in a few minutes.',
  refused: 'The payment gateway refused this.',
  EXPIRY_TOO_SOON: 'A payment link must stay open for at least 16 minutes. Choose a later end.',
  'not-own-profile': 'You can see and change your own working hours only.',
  'no-profile':
    'Your account has no practitioner profile yet. An owner links your profile to your account.',
}

/** The message for an error, looking at the detail a code carries. */
export function officeErrorMessage(error: {
  code: string
  reason?: string
  gatewayCode?: string
  fields?: string[]
}): string {
  if (error.code === 'not-allowed' && error.reason && OFFICE_ERRORS[error.reason]) {
    return OFFICE_ERRORS[error.reason] as string
  }
  if (error.code === 'refused' && error.gatewayCode && OFFICE_ERRORS[error.gatewayCode]) {
    return OFFICE_ERRORS[error.gatewayCode] as string
  }
  if (error.code === 'invalid-input' && error.fields?.length) {
    return `${OFFICE_ERRORS['invalid-input']} Check: ${error.fields.join(', ')}.`
  }
  return OFFICE_ERRORS[error.code] ?? 'That did not work. Reload the page and try again.'
}

export const OFFICE_COPY = {
  cancelled: (refunds: { amountPaise: number; status: string }[]) => {
    if (refunds.length === 0) return 'Booking cancelled. No refund is due under the policy.'
    const total = refunds.reduce((sum, refund) => sum + refund.amountPaise, 0)
    const waiting = refunds.some((refund) => refund.status === 'awaitingApproval')
    return waiting
      ? `Booking cancelled. The refund of ${formatPaise(total)} waits for an owner to approve it.`
      : `Booking cancelled. The refund of ${formatPaise(total)} is approved and goes back to the original payment method.`
  },
  rescheduled: (reference: string, startsAt: string | null) =>
    `Booking moved${startsAt ? ` to ${formatWhen(startsAt)}` : ''}. The new booking is ${reference}; the calendar entry moves with it.`,
  timeConfirmed: (startsAt: string | null) =>
    `Time confirmed${startsAt ? `: ${formatWhen(startsAt)}` : ''}. The calendar entry is written next.`,
  linkCreated: (amountPaise: number) =>
    `Payment link created for ${formatPaise(amountPaise)}. Until messages are set up, send it to the client yourself.`,
  /** After an owner's decision, by where the refund now stands. */
  decided: (status: string) =>
    ({
      declined: 'Refund declined. Nothing goes back to the client.',
      processing: 'Refund approved and sent. It goes back to the original payment method.',
      processed: 'Refund approved and sent. It goes back to the original payment method.',
      failed: 'Refund approved, but the gateway refused it. Send it again from this refund.',
    })[status] ??
    'Refund approved. The gateway did not take it yet; the payments check sends it when it next runs.',
  refundSent: 'Refund sent to the gateway again.',
} as const
