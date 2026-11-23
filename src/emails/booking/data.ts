import { z } from 'zod'

/**
 * The data each booking template is rendered from (docs/19 §7), as its loader reads it when the
 * message is sent and checks it before anything is rendered. Ids, times, the service's name, the
 * person's first name and, where the template's price rule allows, the person's own amount:
 * never an address, a note, a reason typed by staff or anything said in a session. Pure.
 */

const Name = z.string().trim().min(1).max(80)
const ServiceName = z.string().trim().min(1).max(120)
const Reference = z.string().trim().min(1).max(40)
const Paise = z.number().int().nonnegative()

export const ServiceType = z.enum(['session', 'call', 'info'])

/** A booking with its time, as most messages state it. */
export const SessionData = z.object({
  firstName: Name,
  serviceName: ServiceName,
  serviceType: ServiceType,
  reference: Reference,
  counselling: z.boolean(),
  startsAt: z.date(),
  endsAt: z.date().nullable(),
  format: z.enum(['online', 'office']),
  /** The Meet link (or the info session's join link) for an online booking, when there is one. */
  meetingUrl: z.url().nullable(),
})
export type SessionData = z.infer<typeof SessionData>

export const ConfirmedData = SessionData.extend({
  /** What the person paid, shown only while prices are public (`whenPublic`, D-21). */
  paidPaise: Paise.nullable(),
})
export type ConfirmedData = z.infer<typeof ConfirmedData>

export const RescheduledData = SessionData.extend({ fromStartsAt: z.date() })
export type RescheduledData = z.infer<typeof RescheduledData>

export const CancelledData = SessionData.extend({ by: z.enum(['client', 'iiic']) })
export type CancelledData = z.infer<typeof CancelledData>

export const FeedbackData = SessionData.extend({
  /**
   * The feedback page for this booking (`/feedback/[token]`, M5). Null until that page and its
   * tokens exist: the email then carries a placeholder, which blocks the send in production.
   */
  feedbackUrl: z.url().nullable(),
})
export type FeedbackData = z.infer<typeof FeedbackData>

export const TimeRequestData = z.object({
  firstName: Name,
  serviceName: ServiceName,
  reference: Reference,
  /** The days the person offered, in India, as YYYY-MM-DD. */
  preferredDays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(14),
})
export type TimeRequestData = z.infer<typeof TimeRequestData>

export const ConsentReceiptData = z.object({
  firstName: Name,
  serviceName: ServiceName,
  reference: Reference,
  startsAt: z.date(),
  consents: z
    .array(
      z.object({
        purpose: z.string().min(1).max(80),
        version: z.number().int().positive(),
        grantedAt: z.date(),
      }),
    )
    .min(1)
    .max(10),
})
export type ConsentReceiptData = z.infer<typeof ConsentReceiptData>

export const ReceiptData = z.object({
  firstName: Name,
  reference: Reference,
  document: z.enum(['taxInvoice', 'receiptVoucher', 'refundVoucher', 'creditNote']),
  number: z.string().trim().min(1).max(40),
  issuedAt: z.date(),
  totalPaise: Paise,
})
export type ReceiptData = z.infer<typeof ReceiptData>

export const RefundData = z.object({
  firstName: Name,
  reference: Reference,
  amountPaise: Paise,
  processedAt: z.date(),
})
export type RefundData = z.infer<typeof RefundData>

export const SlotLostData = z.object({
  firstName: Name,
  serviceName: ServiceName,
  serviceType: ServiceType,
  startsAt: z.date().nullable(),
  amountPaise: Paise,
})
export type SlotLostData = z.infer<typeof SlotLostData>

export const PaymentLinkData = z.object({
  firstName: Name,
  serviceName: ServiceName,
  reference: Reference,
  startsAt: z.date(),
  amountPaise: z.number().int().positive(),
  linkUrl: z.url(),
  expiresAt: z.date().nullable(),
})
export type PaymentLinkData = z.infer<typeof PaymentLinkData>

/** The practitioner's notice: references and times only (docs/19 §9, proposed). */
export const StaffChangeData = z.object({
  change: z.enum(['rescheduled', 'cancelled', 'slotLost']),
  bookingId: z.number().int().positive(),
  reference: Reference,
  serviceName: ServiceName,
  startsAt: z.date().nullable(),
  fromStartsAt: z.date().nullable(),
  by: z.enum(['client', 'iiic']).nullable(),
})
export type StaffChangeData = z.infer<typeof StaffChangeData>
