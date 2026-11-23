import { Paragraph } from '../components/Frame'
import { Details } from '../components/parts'
import { templateSpec } from '../registry'
import type { TemplateImplementation } from '../types'

import { COPY, WHATSAPP_PARAMS } from './copy'
import { SessionData } from './data'
import { loadReminder } from './load'
import { BookingFrame, JoinButton, RescheduleLine, sessionRows } from './parts'

/**
 * B5 · the reminder 24 hours before (WhatsApp, email as its fallback), and B6 · the short reminder
 * (WhatsApp only). Each states the date, the time, the place or link and how to reschedule
 * (VOICE.md, "Email and WhatsApp"); a counselling one carries the scope and the crisis numbers.
 */
const words = COPY['reminder-24h']

export const reminder24h: TemplateImplementation<SessionData> = {
  load: loadReminder,
  email: {
    key: 'reminder-24h',
    schema: SessionData,
    subject: words.subject,
    preheader: words.preheader,
    element: (data, context) => (
      <BookingFrame
        context={context}
        preheader={words.preheader(data)}
        eyebrow={words.eyebrow}
        heading={words.heading(data)}
        counselling={templateSpec('reminder-24h').counsellingScope && data.counselling}
      >
        <Paragraph>{words.lead(data)}</Paragraph>
        <Details rows={sessionRows(data)} />
        <JoinButton data={data} />
        <RescheduleLine />
      </BookingFrame>
    ),
  },
  whatsapp: { key: 'reminder-24h', schema: SessionData, params: WHATSAPP_PARAMS['reminder-24h'] },
}

export const reminderShort: TemplateImplementation<SessionData> = {
  load: loadReminder,
  whatsapp: {
    key: 'reminder-short',
    schema: SessionData,
    params: WHATSAPP_PARAMS['reminder-short'],
  },
}
