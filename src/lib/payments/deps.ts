import type { EmitDomainEvent } from '@/lib/booking/events'
import type { ConfirmBooking } from '@/lib/booking/operations'
import type { Result } from '@/lib/result'

import type { PaymentGateway } from './gateway'

/**
 * What the payments module needs from outside itself, handed in rather than imported, so the
 * tests run it on the fake gateway with a stand-in booking module, and src/lib/payments/wiring.ts
 * joins the real ones: the gateway this deployment uses, the booking module's ConfirmBooking
 * (the one way into `confirmed`, docs/16 §6) and its `emit` (docs/16 §9), and the clock.
 */
export type PaymentsDeps = {
  gateway: () => Result<PaymentGateway, { code: 'not-configured' }>
  confirmBooking: ConfirmBooking
  emit: EmitDomainEvent
  now: () => Date
}

/** What the logs say while this deployment has no gateway: payments are off, and why. */
export const PAYMENTS_OFF_MESSAGE =
  'Payments are off: the Razorpay keys are not set (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET).'
