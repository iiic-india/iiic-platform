import type { PayloadRequest } from 'payload'
import { z } from 'zod'

import { articlePath, JOURNAL_PATH } from '@/lib/journal/addresses'
import { linkLive, NEWSLETTER_PATHS } from '@/lib/newsletter/rules'
import { tokenFor } from '@/lib/newsletter/subscriptions'
import { idOf } from '@/lib/privacy/consentLedger'
import { consentFor } from '@/lib/privacy/consents'
import { err, ok, type Result } from '@/lib/result'
import { formatIstDate } from '@/lib/time/ist'
import type { Post, Subscriber } from '@/payload-types'

import { Frame } from '../components/Frame'
import { Button } from '../components/parts'
import type { LoadError, TemplateImplementation } from '../types'
import { Para, PlainLink, SectionHeading, siteLink } from './text'

/**
 * The newsletter's three emails (docs/06 N1, N2, N4; docs/19 §8; D-10). The confirmation (N1) is
 * transactional: the reply to the person's own request, with nothing else in it. The welcome
 * (N2) and each issue (N4) are promotional: each `load` reads the entry and the ledger at send
 * time and answers `stale` unless the entry is confirmed and the consent to marketing email is in
 * force then, so a withdrawal after an issue was queued stops it even before the core's own check.
 *
 * Copy status: every line below is a candidate written to src/brand/VOICE.md, awaiting IIIC's
 * approval (I-41; I-22 for what the confirmation says about consent). An approved entry in
 * Admin → Messages → Templates replaces the subject, preheader and lines.
 */

async function subscriber(req: PayloadRequest, id: number): Promise<Subscriber | null> {
  return req.payload.findByID({
    collection: 'subscribers',
    id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
}

/** Whether a promotional email may still go to this entry: confirmed, consent in force. */
export async function stillSubscribed(req: PayloadRequest, entry: Subscriber): Promise<boolean> {
  const personId = idOf(entry.person)
  if (entry.status !== 'confirmed' || personId === null) return false
  return (await consentFor(req.payload, personId, 'marketingEmail', req)) === 'granted'
}

function recipientSubscriber(recipient: { kind: string; id: number }): number | null {
  return recipient.kind === 'subscriber' ? recipient.id : null
}

// ---- N1 · the confirmation ----

const ConfirmData = z.object({ confirmPath: z.string().startsWith('/'), validUntil: z.string() })
type ConfirmData = z.infer<typeof ConfirmData>

export const newsletterConfirm: TemplateImplementation<ConfirmData> = {
  load: async (req, { subject }): Promise<Result<ConfirmData, LoadError>> => {
    const entry = await subscriber(req, subject.id)
    if (!entry) return err({ code: 'not-found' })
    if (entry.status !== 'pending' || !linkLive(entry.confirmExpiresAt, new Date())) {
      return err({ code: 'stale' })
    }
    const token = tokenFor(entry)
    if (!token || !entry.confirmExpiresAt) return err({ code: 'stale' })
    return ok({
      confirmPath: NEWSLETTER_PATHS.confirm(token),
      validUntil: formatIstDate(new Date(entry.confirmExpiresAt)),
    })
  },
  email: {
    key: 'newsletter-confirm',
    schema: ConfirmData,
    subject: () => 'Confirm your subscription to the Journal',
    preheader: () => 'One click to confirm. If you did not ask for it, ignore this email.',
    element: (data, context) => (
      <Frame
        preheader="One click to confirm. If you did not ask for it, ignore this email."
        eyebrow="The Journal"
        heading="Confirm your subscription"
        footer={context.footer}
        assetUrl={context.assetUrl}
      >
        <Para>
          Someone, probably you, asked for the Journal of the Indian Institute of Image Catalysts
          (IIIC) to be sent to this address.
        </Para>
        <Para>To start receiving it, confirm below. The link works until {data.validUntil}.</Para>
        <Button href={siteLink(context.siteUrl, data.confirmPath)}>Confirm my subscription</Button>
        <Para>
          If you did not ask for it, ignore this email. Nothing more will be sent, and the address
          is removed the day after the link stops working.
        </Para>
      </Frame>
    ),
  },
}

// ---- N2 · the welcome ----

const WelcomeData = z.object({ journalPath: z.string() })
type WelcomeData = z.infer<typeof WelcomeData>

export const newsletterWelcome: TemplateImplementation<WelcomeData> = {
  load: async (req, { subject }) => {
    const entry = await subscriber(req, subject.id)
    if (!entry) return err({ code: 'not-found' })
    if (!(await stillSubscribed(req, entry))) return err({ code: 'stale' })
    return ok({ journalPath: JOURNAL_PATH })
  },
  email: {
    key: 'newsletter-welcome',
    schema: WelcomeData,
    subject: () => 'You are subscribed to the Journal',
    preheader: () => 'One email a month from the Journal of IIIC.',
    element: (data, context) => (
      <Frame
        preheader="One email a month from the Journal of IIIC."
        eyebrow="The Journal"
        heading="You are subscribed"
        footer={context.footer}
        assetUrl={context.assetUrl}
      >
        <Para>
          Thank you for confirming. Once a month, IIIC sends one email from the Journal: a lead
          story, two short items and one link.
        </Para>
        <Para>
          Every issue has an unsubscribe link at the foot. One click takes you off the list.
        </Para>
        <Button href={siteLink(context.siteUrl, data.journalPath)}>Read the Journal</Button>
      </Frame>
    ),
  },
}

// ---- N4 · an issue ----

const Story = z.object({
  title: z.string(),
  excerpt: z.string(),
  path: z.string().startsWith('/'),
  note: z.string().nullable(),
})
const IssueData = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  preheader: z.string(),
  lead: Story,
  items: z.array(Story).max(2),
  cta: z.object({ label: z.string(), path: z.string().startsWith('/') }).nullable(),
})
type IssueData = z.infer<typeof IssueData>

function story(post: unknown, note: string | null | undefined): z.infer<typeof Story> | null {
  if (!post || typeof post !== 'object') return null
  const { title, excerpt, slug, _status } = post as Post
  if (_status && _status !== 'published') return null
  return { title, excerpt, path: articlePath(slug), note: note?.trim() || null }
}

/** The issue's data for one subscriber, at send time; `stale` once it is cancelled. */
export async function loadIssue(
  req: PayloadRequest,
  issueId: number,
  subscriberId: number | null,
): Promise<Result<IssueData, LoadError>> {
  const issue = await req.payload.findByID({
    collection: 'newsletter-issues',
    id: issueId,
    depth: 1,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
  if (!issue) return err({ code: 'not-found' })
  if (issue.status !== 'sending' && issue.status !== 'sent') return err({ code: 'stale' })
  if (subscriberId === null) return err({ code: 'not-found' })
  const entry = await subscriber(req, subscriberId)
  if (!entry) return err({ code: 'not-found' })
  if (!(await stillSubscribed(req, entry))) return err({ code: 'stale' })
  const lead = story(issue.lead?.post, issue.lead?.note)
  if (!lead) return err({ code: 'stale' })
  const items = (issue.items ?? [])
    .map((item) => story(item.post, item.note))
    .filter((item): item is z.infer<typeof Story> => item !== null)
  const cta =
    issue.cta?.label && issue.cta.path ? { label: issue.cta.label, path: issue.cta.path } : null
  return ok({
    number: issue.number,
    title: issue.title,
    preheader: issue.preheader,
    lead,
    items,
    cta,
  })
}

export const newsletterIssue: TemplateImplementation<IssueData> = {
  load: (req, { subject, recipient }) => loadIssue(req, subject.id, recipientSubscriber(recipient)),
  email: {
    key: 'newsletter-issue',
    schema: IssueData,
    subject: (data) => data.title,
    preheader: (data) => data.preheader,
    element: (data, context) => (
      <Frame
        preheader={data.preheader}
        eyebrow={`The Journal · Issue ${data.number}`}
        heading={data.title}
        footer={context.footer}
        assetUrl={context.assetUrl}
      >
        {data.lead.note ? <Para>{data.lead.note}</Para> : null}
        <SectionHeading>{data.lead.title}</SectionHeading>
        <Para>{data.lead.excerpt}</Para>
        <Para>
          <PlainLink href={siteLink(context.siteUrl, data.lead.path)}>
            Read it in the Journal
          </PlainLink>
        </Para>
        {data.items.map((item) => (
          <div key={item.path}>
            <SectionHeading>{item.title}</SectionHeading>
            {item.note ? <Para>{item.note}</Para> : null}
            <Para>{item.excerpt}</Para>
            <Para>
              <PlainLink href={siteLink(context.siteUrl, item.path)}>Read it</PlainLink>
            </Para>
          </div>
        ))}
        {data.cta ? (
          <Button href={siteLink(context.siteUrl, data.cta.path)}>{data.cta.label}</Button>
        ) : null}
      </Frame>
    ),
  },
}
