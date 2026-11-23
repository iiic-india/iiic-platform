import { Paragraph } from '../components/Frame'
import { Details } from '../components/parts'
import type { TemplateImplementation } from '../types'

import { COPY, LABELS } from './copy'
import { ConsentReceiptData, ReceiptData } from './data'
import { longDay } from './format'
import { loadConsentReceipt, loadReceipt } from './load'
import { BookingFrame } from './parts'

/**
 * B3 · the receipt or invoice Zoho Books issued for a payment, and B3a · the written record of
 * what a counselling client agreed to when they booked (docs/06 B3, B3a). Neither says anything
 * about the session itself; the consent receipt names each purpose and its notice's version, and
 * the withdraw link is the one in its footer (docs/08 §3).
 */

const receipt = COPY['booking-receipt']

export const bookingReceipt: TemplateImplementation<ReceiptData> = {
  load: loadReceipt,
  email: {
    key: 'booking-receipt',
    schema: ReceiptData,
    subject: receipt.subject,
    preheader: receipt.preheader,
    element: (data, context) => (
      <BookingFrame
        context={context}
        preheader={receipt.preheader(data)}
        eyebrow={receipt.eyebrow(data)}
        heading={receipt.heading(data)}
        counselling={false}
      >
        <Paragraph>{receipt.lead(data)}</Paragraph>
        <Details
          rows={[
            { label: LABELS.number, value: data.number, mono: true },
            { label: LABELS.issued, value: longDay(data.issuedAt) },
            // The person's own payment (`ownPayment`, D-24); never shown if the rule says no.
            ...(context.priceAllowed
              ? [{ label: LABELS.amount, value: receipt.amount(data.totalPaise) }]
              : []),
            { label: LABELS.reference, value: data.reference, mono: true },
          ]}
        />
        <Paragraph>{receipt.questions}</Paragraph>
      </BookingFrame>
    ),
  },
}

const consent = COPY['consent-receipt']

export const consentReceipt: TemplateImplementation<ConsentReceiptData> = {
  load: loadConsentReceipt,
  email: {
    key: 'consent-receipt',
    schema: ConsentReceiptData,
    subject: consent.subject,
    preheader: consent.preheader,
    element: (data, context) => (
      <BookingFrame
        context={context}
        preheader={consent.preheader(data)}
        eyebrow={consent.eyebrow}
        heading={consent.heading(data)}
        counselling={false}
      >
        <Paragraph>{consent.lead(data)}</Paragraph>
        {data.consents.map((item) => (
          <Paragraph key={`${item.purpose}:${item.version}`}>{consent.item(item)}</Paragraph>
        ))}
        <Details rows={[{ label: LABELS.reference, value: data.reference, mono: true }]} />
        <Paragraph>{consent.withdraw}</Paragraph>
      </BookingFrame>
    ),
  },
}
