import { Paragraph } from '../components/Frame'
import { Details, type Detail } from '../components/parts'
import type { TemplateImplementation } from '../types'

import { COPY, LABELS, WHATSAPP_PARAMS } from './copy'
import { TimeRequestData } from './data'
import { longIstDay } from './format'
import { loadTimeRequest } from './load'
import { BookingFrame } from './parts'

/**
 * B12 · the acknowledgement of a request for a time (docs/06 B12): what happens next, and that
 * nothing is booked until a time is agreed. It promises no time.
 */

const words = COPY['time-request-received']

function rows(data: TimeRequestData): Detail[] {
  const days: Detail[] = data.preferredDays.length
    ? [{ label: LABELS.days, value: data.preferredDays.map(longIstDay).join('; ') }]
    : []
  return [
    { label: LABELS.what, value: data.serviceName },
    ...days,
    { label: LABELS.reference, value: data.reference, mono: true },
  ]
}

export const timeRequestReceived: TemplateImplementation<TimeRequestData> = {
  load: loadTimeRequest,
  email: {
    key: 'time-request-received',
    schema: TimeRequestData,
    subject: words.subject,
    preheader: words.preheader,
    element: (data, context) => (
      <BookingFrame
        context={context}
        preheader={words.preheader(data)}
        eyebrow={words.eyebrow}
        heading={words.heading(data)}
        counselling={false}
      >
        <Paragraph>{words.lead(data)}</Paragraph>
        <Details rows={rows(data)} />
        <Paragraph>{words.note}</Paragraph>
        <Paragraph>{words.change}</Paragraph>
      </BookingFrame>
    ),
  },
  whatsapp: {
    key: 'time-request-received',
    schema: TimeRequestData,
    params: WHATSAPP_PARAMS['time-request-received'],
  },
}
