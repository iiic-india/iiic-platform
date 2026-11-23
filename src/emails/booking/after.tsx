import { Paragraph } from '../components/Frame'
import { Button, Details } from '../components/parts'
import type { TemplateImplementation } from '../types'

import { COPY, LABELS, whenOf } from './copy'
import { FeedbackData, SessionData } from './data'
import { loadFeedback, loadNoShow } from './load'
import { BookingFrame } from './parts'

/**
 * After the session (docs/06 B8, B9): the feedback request, which asks one rating and nothing
 * else, and the note to someone who did not come, with the way to choose another time. Neither
 * mentions a fee (the no-show fee is the policy's, and no price shows while prices are hidden,
 * D-21) or anything about the session but its name and time.
 */

const feedback = COPY['feedback-request']

export const feedbackRequest: TemplateImplementation<FeedbackData> = {
  load: loadFeedback,
  email: {
    key: 'feedback-request',
    schema: FeedbackData,
    subject: feedback.subject,
    preheader: feedback.preheader,
    element: (data, context) => (
      <BookingFrame
        context={context}
        preheader={feedback.preheader()}
        eyebrow={feedback.eyebrow}
        heading={feedback.heading(data)}
        counselling={data.counselling}
      >
        <Paragraph>{feedback.lead(data)}</Paragraph>
        {data.feedbackUrl ? (
          <Button href={data.feedbackUrl}>{feedback.button}</Button>
        ) : (
          <Paragraph>{feedback.missingLink}</Paragraph>
        )}
      </BookingFrame>
    ),
  },
}

const noShow = COPY['no-show']

export const noShowNotice: TemplateImplementation<SessionData> = {
  load: loadNoShow,
  email: {
    key: 'no-show',
    schema: SessionData,
    subject: noShow.subject,
    preheader: noShow.preheader,
    element: (data, context) => (
      <BookingFrame
        context={context}
        preheader={noShow.preheader()}
        eyebrow={noShow.eyebrow}
        heading={noShow.heading(data)}
        counselling={data.counselling}
      >
        <Paragraph>{noShow.lead(data)}</Paragraph>
        <Details
          rows={[
            { label: LABELS.what, value: data.serviceName },
            { label: LABELS.when, value: whenOf(data) },
            { label: LABELS.reference, value: data.reference, mono: true },
          ]}
        />
        <Button href={`${context.siteUrl}/book/${data.serviceType}`}>{noShow.button}</Button>
      </BookingFrame>
    ),
  },
}
