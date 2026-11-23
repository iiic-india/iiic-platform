import type { TemplateImplementation, TemplateImplementations } from '../types'
import { feedbackRequest, noShowNotice } from './after'
import {
  bookingCancelled,
  bookingChangeStaff,
  bookingRescheduled,
  refundProcessed,
} from './changes'
import { bookingConfirmed } from './confirmed'
import { paymentLink, paymentLinkReminder, slotLost } from './payments'
import { bookingReceipt, consentReceipt } from './receipts'
import { reminder24h, reminderShort } from './reminders'
import { timeRequestReceived } from './requests'

/**
 * Builder B's templates (docs/19 §7): the booking and payment messages of the B-series, email and
 * WhatsApp, by template key. Each implementation's data type is its own; the core validates the
 * data with the template's schema before it renders, so the map holds them without it.
 */
const erase = <Data>(implementation: TemplateImplementation<Data>) =>
  implementation as unknown as TemplateImplementation<never>

export const BOOKING_TEMPLATES: TemplateImplementations = {
  'booking-confirmed': erase(bookingConfirmed),
  'booking-receipt': erase(bookingReceipt),
  'consent-receipt': erase(consentReceipt),
  'reminder-24h': erase(reminder24h),
  'reminder-short': erase(reminderShort),
  'booking-rescheduled': erase(bookingRescheduled),
  'booking-cancelled': erase(bookingCancelled),
  'refund-processed': erase(refundProcessed),
  'booking-change-staff': erase(bookingChangeStaff),
  'feedback-request': erase(feedbackRequest),
  'no-show': erase(noShowNotice),
  'slot-lost': erase(slotLost),
  'time-request-received': erase(timeRequestReceived),
  'payment-link': erase(paymentLink),
  'payment-link-reminder': erase(paymentLinkReminder),
}
