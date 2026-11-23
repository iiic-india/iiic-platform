import type { PayloadRequest } from 'payload'
import { z } from 'zod'

import { env } from '@/lib/env'
import { idOf } from '@/lib/privacy/consentLedger'
import { PUBLICATION } from '@/lib/proof/ledger'
import { connectionCard, isCounsellingReview, shownName, whenShown } from '@/lib/proof/reviews'
import { err, ok, type Result } from '@/lib/result'
import type { Person, Testimonial } from '@/payload-types'

import { Frame } from '../components/Frame'
import type { LoadError, TemplateImplementation } from '../types'
import { Para, Quote } from './text'

/**
 * The review messages (docs/06 V1, V2; docs/content/review-consent-request.md; D-37). V1's request
 * is the consent message of review-consent-request.md, its email form: the WhatsApp text with
 * "reply with one number" read as "reply to this email with 1, 2 or 3". Two changes are marked as
 * candidates (I-42, I-22): the opening names the team rather than "[your name]", because the
 * message is sent by the platform; and the reminder, which the source asks for ("one reminder
 * after five days") without words of its own. The source's own status is `[proposal]`: the lawyer
 * checks it with the rest of the testimonial consent (I-22). V2's confirmation is a candidate too.
 * Nothing here is an offer: no thanks in kind, no link to a programme (D-37, the incentive rule).
 */

/** Where a person can write to have a review removed: the hello inbox, or a placeholder. */
function helloAddress(): string {
  const { MAIL_DOMAIN } = env()
  return MAIL_DOMAIN ? `hello@${MAIL_DOMAIN}` : '[[TODO: IIIC’s hello address, I-02]]'
}

/** The first word of the person's name, as the greeting uses it. */
function firstName(person: unknown): string {
  const name = person && typeof person === 'object' ? (person as Person).fullName : ''
  return name?.trim().split(/\s+/)[0] ?? ''
}

const RequestData = z.object({
  firstName: z.string().min(1),
  when: z.string(),
  programme: z.string().min(1),
  text: z.string().min(1),
  caption: z.string().min(1),
  programmeLine: z.string().min(1),
  excerpt: z.string().nullable(),
  translation: z.string().nullable(),
  connection: z.string().nullable(),
  counselling: z.boolean(),
  hello: z.string(),
})
type RequestData = z.infer<typeof RequestData>

/** V1's data, read at send time: `stale` once the review has left "Consent requested". */
export async function loadReviewRequest(
  req: PayloadRequest,
  testimonialId: number,
): Promise<Result<RequestData, LoadError>> {
  const review = (await req.payload.findByID({
    collection: 'testimonials',
    id: testimonialId,
    depth: 1,
    disableErrors: true,
    overrideAccess: true,
    req,
  })) as Testimonial | null
  if (!review) return err({ code: 'not-found' })
  if (review.status !== 'consentRequested') return err({ code: 'stale' })
  const person = review.person && typeof review.person === 'object' ? review.person : null
  const name = review.shownName?.trim() || shownName(person?.fullName, review.displayForm)
  const when = whenShown(review.year, review.month)
  const caption = [name, review.designation, review.place].filter(Boolean).join(' · ')
  const parsed = RequestData.safeParse({
    firstName: firstName(person),
    when,
    programme: review.programme ?? '',
    text: review.text ?? '',
    caption,
    programmeLine: [review.programme, when].filter(Boolean).join(', '),
    excerpt: review.excerpt?.trim() || null,
    translation: review.translation?.trim() || null,
    connection: connectionCard(review.connection),
    counselling: isCounsellingReview(review.doors),
    hello: helloAddress(),
  })
  // A review without the programme, the text or the person's name cannot be asked about.
  return parsed.success ? ok(parsed.data) : err({ code: 'not-found' })
}

function RequestBody({ data }: { data: RequestData }) {
  return (
    <>
      <Para>
        Hello {data.firstName}, this is the team at the Indian Institute of Image Catalysts (IIIC),
        Gaurang Mistry’s institute.
      </Para>
      <Para>
        In {data.when}, after {data.programme}, you wrote:
      </Para>
      <Quote>“{data.text}”</Quote>
      <Para>We would like to show it on IIIC’s new website, like this:</Para>
      <Quote>
        {data.caption}
        <br />
        {data.programmeLine}
      </Quote>
      {data.connection ? <Para>The card will also say: “{data.connection}”.</Para> : null}
      <Para>If your designation or city has changed, tell us what to show.</Para>
      {data.excerpt ? (
        <Para>
          We would show this part of it: “{data.excerpt}”
          {data.translation ? <> with this English translation: “{data.translation}”</> : null}
        </Para>
      ) : null}
      <Para>Please reply to this email with 1, 2 or 3:</Para>
      {data.counselling ? (
        <Para>
          1. Yes, publish it with my initials and city. I still stand by it.
          <br />
          2. Yes, publish it with my full name.
          <br />
          3. Please don’t publish it.
        </Para>
      ) : (
        <Para>
          1. Yes, publish it as shown. I still stand by it.
          <br />
          2. Yes, but show only my initials.
          <br />
          3. Please don’t publish it.
        </Para>
      )}
      <Para>
        You can ask us to remove it at any time by replying to this email or writing to {data.hello}
        .
      </Para>
    </>
  )
}

const requestSubject = (data: RequestData) =>
  `May we publish what you wrote about ${data.programme}?`

export const reviewConsentRequest: TemplateImplementation<RequestData> = {
  load: (req, { subject }) => loadReviewRequest(req, subject.id),
  email: {
    key: 'review-consent-request',
    schema: RequestData,
    subject: requestSubject,
    preheader: () => 'Reply with 1, 2 or 3. Nothing is published without your yes.',
    element: (data, context) => (
      <Frame
        preheader="Reply with 1, 2 or 3. Nothing is published without your yes."
        heading="May we publish what you wrote?"
        footer={context.footer}
        assetUrl={context.assetUrl}
      >
        <RequestBody data={data} />
      </Frame>
    ),
  },
}

/** V1's one reminder, five days on, while the review still waits for a reply (candidate, I-42). */
export const reviewConsentReminder: TemplateImplementation<RequestData> = {
  load: (req, { subject }) => loadReviewRequest(req, subject.id),
  email: {
    key: 'review-consent-reminder',
    schema: RequestData,
    subject: (data) => `Reminder: ${requestSubject(data)}`,
    preheader: () => 'One reminder only. No reply means nothing is published.',
    element: (data, context) => (
      <Frame
        preheader="One reminder only. No reply means nothing is published."
        heading="May we publish what you wrote?"
        footer={context.footer}
        assetUrl={context.assetUrl}
      >
        <Para>
          We wrote to you five days ago about the review below. This is the only reminder we will
          send: if you would rather not reply, nothing will be published.
        </Para>
        <RequestBody data={data} />
      </Frame>
    ),
  },
}

// ---- V2 · the withdrawal confirmed ----

const WithdrawalData = z.object({ firstName: z.string(), withdrawnOn: z.string() })
type WithdrawalData = z.infer<typeof WithdrawalData>

/** V2's data: the withdrawal entry of a consent to publish a testimonial, and its person. */
export async function loadWithdrawal(
  req: PayloadRequest,
  consentId: number,
): Promise<Result<WithdrawalData, LoadError>> {
  const entry = await req.payload.findByID({
    collection: 'consents',
    id: consentId,
    depth: 1,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
  if (!entry || entry.purpose !== PUBLICATION || idOf(entry.withdraws) === null) {
    return err({ code: 'not-found' })
  }
  if (!entry.withdrawnAt) return err({ code: 'not-found' })
  return ok({
    firstName: firstName(entry.person),
    withdrawnOn: new Date(entry.withdrawnAt).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    }),
  })
}

export const reviewWithdrawalConfirmed: TemplateImplementation<WithdrawalData> = {
  load: (req, { subject }) => loadWithdrawal(req, subject.id),
  email: {
    key: 'review-withdrawal-confirmed',
    schema: WithdrawalData,
    subject: () => 'Your review has been taken down',
    preheader: () => 'It no longer appears anywhere on IIIC’s website.',
    element: (data, context) => (
      <Frame
        preheader="It no longer appears anywhere on IIIC’s website."
        heading="Your review has been taken down"
        footer={context.footer}
        assetUrl={context.assetUrl}
      >
        <Para>{data.firstName ? `Hello ${data.firstName},` : 'Hello,'}</Para>
        <Para>
          You withdrew your consent to publish your review on {data.withdrawnOn}. It was taken off
          IIIC’s website the same moment, and it will not be shown again unless you give your
          consent again.
        </Para>
        <Para>If you did not ask for this, reply to this email and we will look into it.</Para>
      </Frame>
    ),
  },
}
