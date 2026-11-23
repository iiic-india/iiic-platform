import { Paragraph } from '../components/Frame'
import { Details } from '../components/parts'
import type { TemplateImplementation } from '../types'
import { COPY, LABELS, WHATSAPP_PARAMS } from './copy'
import { ConfirmedData } from './data'
import { loadConfirmed } from './load'
import { BookingFrame, ManageOrJoinButton, RescheduleLine, sessionRows } from './parts'

/** B2 · the booking confirmation, by email and WhatsApp (docs/06 B2). */
const KEY = 'booking-confirmed'
const words = COPY[KEY]

export const bookingConfirmed: TemplateImplementation<ConfirmedData> = {
  load: loadConfirmed,
  email: {
    key: KEY,
    schema: ConfirmedData,
    subject: words.subject,
    preheader: words.preheader,
    element: (data, context) => {
      // The amount paid only while prices are public (`whenPublic`, D-21).
      const paid =
        context.priceAllowed && data.paidPaise
          ? [{ label: LABELS.paid, value: words.paid(data.paidPaise) }]
          : []
      return (
        <BookingFrame
          context={context}
          preheader={words.preheader(data)}
          eyebrow={words.eyebrow}
          heading={words.heading(data)}
          counselling={data.counselling}
        >
          <Paragraph>{words.lead(data)}</Paragraph>
          <Details rows={sessionRows(data, paid)} />
          <ManageOrJoinButton data={data} />
          <RescheduleLine />
        </BookingFrame>
      )
    },
  },
  whatsapp: { key: KEY, schema: ConfirmedData, params: WHATSAPP_PARAMS[KEY] },
}
