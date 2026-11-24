import { Paragraph } from '../components/Frame'
import { Button, Details, type Detail } from '../components/parts'
import type { EmailContext, TemplateImplementation } from '../types'
import { COPY, LABELS, WHATSAPP_PARAMS, whenOf } from './copy'
import { PaymentLinkData, SlotLostData } from './data'
import { longDay, rupees, timeSpan } from './format'
import { loadPaymentLink, loadSlotLost } from './load'
import { BookingFrame } from './parts'

/**
 * B13 · a payment link staff sent for a booking, with its one reminder 24 hours before the
 * session while it is unpaid, and B10 · the payment that arrived after its time was taken,
 * refunded in full (docs/06 B10, B13). The payment link shows its amount, which the client sees
 * before paying anyway (`paymentLink`, D-24); the slot-lost notice shows the amount only while
 * prices are public (D-21). Nothing else about money.
 */

/** The booking page of the service's kind, where another time is chosen (docs/02 `/book/[type]`). */
const bookingPage = (context: EmailContext, type: SlotLostData['serviceType']) =>
  `${context.siteUrl}/book/${type}`

function linkRows(data: PaymentLinkData, context: EmailContext): Detail[] {
  const rows: Detail[] = [
    { label: LABELS.what, value: data.serviceName },
    { label: LABELS.when, value: whenOf({ startsAt: data.startsAt, endsAt: null }) },
  ]
  if (context.priceAllowed) rows.push({ label: LABELS.amount, value: rupees(data.amountPaise) })
  if (data.expiresAt) {
    rows.push({
      label: LABELS.linkWorks,
      value: `${longDay(data.expiresAt)}, ${timeSpan(data.expiresAt)}`,
    })
  }
  rows.push({ label: LABELS.reference, value: data.reference, mono: true })
  return rows
}

const link = COPY['payment-link']

export const paymentLink: TemplateImplementation<PaymentLinkData> = {
  load: loadPaymentLink,
  email: {
    key: 'payment-link',
    schema: PaymentLinkData,
    subject: link.subject,
    preheader: link.preheader,
    element: (data, context) => (
      <BookingFrame
        context={context}
        preheader={link.preheader(data)}
        eyebrow={link.eyebrow}
        heading={link.heading(data)}
        counselling={false}
      >
        <Paragraph>{link.lead(data)}</Paragraph>
        <Details rows={linkRows(data, context)} />
        <Button href={data.linkUrl}>{link.button(data)}</Button>
        <Paragraph>{link.questions}</Paragraph>
      </BookingFrame>
    ),
  },
  whatsapp: {
    key: 'payment-link',
    schema: PaymentLinkData,
    params: WHATSAPP_PARAMS['payment-link'],
  },
}

const reminder = COPY['payment-link-reminder']

export const paymentLinkReminder: TemplateImplementation<PaymentLinkData> = {
  load: loadPaymentLink,
  email: {
    key: 'payment-link-reminder',
    schema: PaymentLinkData,
    subject: reminder.subject,
    preheader: reminder.preheader,
    element: (data, context) => (
      <BookingFrame
        context={context}
        preheader={reminder.preheader(data)}
        eyebrow={reminder.eyebrow}
        heading={reminder.heading(data)}
        counselling={false}
      >
        <Paragraph>{reminder.lead(data)}</Paragraph>
        <Details rows={linkRows(data, context)} />
        <Button href={data.linkUrl}>{reminder.button(data)}</Button>
        <Paragraph>{reminder.questions}</Paragraph>
      </BookingFrame>
    ),
  },
}

const lost = COPY['slot-lost']

export const slotLost: TemplateImplementation<SlotLostData> = {
  load: loadSlotLost,
  email: {
    key: 'slot-lost',
    schema: SlotLostData,
    subject: lost.subject,
    preheader: lost.preheader,
    element: (data, context) => (
      <BookingFrame
        context={context}
        preheader={lost.preheader(data, context)}
        eyebrow={lost.eyebrow}
        heading={lost.heading(data)}
        counselling={false}
      >
        <Paragraph>{lost.lead(data)}</Paragraph>
        <Paragraph>{lost.refund(data, context)}</Paragraph>
        <Button href={bookingPage(context, data.serviceType)}>{lost.button}</Button>
      </BookingFrame>
    ),
  },
}
