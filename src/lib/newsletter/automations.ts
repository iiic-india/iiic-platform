import 'server-only'

import type { PayloadRequest } from 'payload'
import { z } from 'zod'

import { stillSubscribed } from '@/emails/other/newsletter'
import { plan } from '@/lib/automations/operations/core'
import { done, RecordId, type Outcome } from '@/lib/automations/operations/outcome'
import { idOf } from '@/lib/privacy/consentLedger'
import type { Subscriber } from '@/payload-types'

import { NEWSLETTER_SEND_CONTEXT } from './hooks'
import { linkLive } from './rules'
import { unsubscribe, withdrawMarketingEmail } from './subscriptions'
import { confirmationVariant } from './tokens'

/**
 * The newsletter's automations (docs/06 N1 to N4; docs/19 §8; D-10), each idempotent: the core
 * keeps one `messages` row per key, so a job run twice plans nothing new.
 *
 * - N1 · on `newsletter.signedUp`: the confirmation email, one per confirmation round.
 * - N2 · on `newsletter.confirmed`: the welcome, promotional, only while the consent is in force.
 * - N3 · on `consent.withdrawn` (marketing email) and `message.suppressed` (an email address that
 *   bounced or complained): the entry is marked unsubscribed and, for a suppression, every
 *   consent to marketing email in force is withdrawn, the same moment.
 * - N4 · on `newsletter.issueScheduled`: at the issue's time, one message per confirmed
 *   subscriber whose consent is in force then (variant `s<subscriber id>`).
 */

async function entry(req: PayloadRequest, id: number): Promise<Subscriber | null> {
  return req.payload.findByID({
    collection: 'subscribers',
    id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
}

const SubscriberEvent = z.object({ subscriberId: RecordId })

export async function runN1(req: PayloadRequest, input: unknown, now: Date): Promise<Outcome> {
  const { subscriberId } = SubscriberEvent.parse(input)
  const subscriber = await entry(req, subscriberId)
  if (!subscriber) return done(0, 'not-found')
  if (subscriber.status !== 'pending' || !linkLive(subscriber.confirmExpiresAt, now)) {
    return done(0, 'not-pending')
  }
  const expiresAt = new Date(subscriber.confirmExpiresAt as string)
  const result = await plan(req, {
    automation: 'N1',
    template: 'newsletter-confirm',
    channel: 'email',
    recipient: { kind: 'subscriber', id: subscriber.id },
    subject: { collection: 'subscribers', id: subscriber.id },
    variant: confirmationVariant(expiresAt),
    sendAt: now,
    sendBefore: expiresAt,
  })
  return result.ok ? done(result.value.created ? 1 : 0) : done(0, result.error.code)
}

export async function runN2(req: PayloadRequest, input: unknown, now: Date): Promise<Outcome> {
  const { subscriberId } = SubscriberEvent.parse(input)
  const subscriber = await entry(req, subscriberId)
  if (!subscriber) return done(0, 'not-found')
  // Promotional: nothing goes unless the consent recorded at confirmation is in force now.
  if (!(await stillSubscribed(req, subscriber))) return done(0, 'no-consent')
  const result = await plan(req, {
    automation: 'N2',
    template: 'newsletter-welcome',
    channel: 'email',
    recipient: { kind: 'subscriber', id: subscriber.id },
    subject: { collection: 'subscribers', id: subscriber.id },
    sendAt: now,
  })
  return result.ok ? done(result.value.created ? 1 : 0) : done(0, result.error.code)
}

const N3Event = z.union([
  z.object({ name: z.literal('consent.withdrawn'), consentId: RecordId }),
  z.object({ name: z.literal('message.suppressed'), suppressionId: RecordId }),
])

/** N3 plans no message: it takes the person off the list. Returns how many entries it changed. */
export async function runN3(req: PayloadRequest, input: unknown, now: Date): Promise<Outcome> {
  const event = N3Event.parse(input)
  let changed = 0
  if (event.name === 'consent.withdrawn') {
    const withdrawal = await req.payload.findByID({
      collection: 'consents',
      id: event.consentId,
      depth: 0,
      disableErrors: true,
      overrideAccess: true,
      req,
    })
    if (!withdrawal || withdrawal.purpose !== 'marketingEmail') return done(0, 'other-purpose')
    const personId = idOf(withdrawal.person)
    if (personId === null) return done(0, 'no-person')
    const { docs } = await req.payload.find({
      collection: 'subscribers',
      where: {
        and: [{ person: { equals: personId } }, { status: { not_equals: 'unsubscribed' } }],
      },
      pagination: false,
      depth: 0,
      overrideAccess: true,
      req,
    })
    for (const subscriber of docs) {
      const result = await unsubscribe(req, subscriber.id, 'web', now)
      if (result.ok) changed += 1
    }
    return done(0, `unsubscribed:${changed}`)
  }

  const suppression = await req.payload.findByID({
    collection: 'suppressions',
    id: event.suppressionId,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
  if (!suppression || suppression.channel !== 'email') return done(0, 'other-channel')
  const { docs } = await req.payload.find({
    collection: 'subscribers',
    where: { email: { equals: suppression.address.trim().toLowerCase() } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const subscriber = docs[0]
  if (subscriber) {
    // A complaint or a hard bounce ends the consent too, the same moment (docs/13 §6).
    const result = await unsubscribe(req, subscriber.id, 'email', now)
    if (result.ok) changed += 1
  } else {
    const personId = idOf(suppression.person)
    if (personId !== null) await withdrawMarketingEmail(req, personId, 'email', now)
  }
  return done(0, `unsubscribed:${changed}`)
}

const IssueEvent = z.object({ issueId: RecordId, at: z.string().optional() })

type Queue = (args: {
  task: string
  input: Record<string, unknown>
  waitUntil?: Date
  req: PayloadRequest
}) => Promise<unknown>

/** How many subscribers one page of N4 reads at a time. */
const PAGE = 200

/**
 * N4. Raised when an editor schedules an issue; before its time, the job queues a copy of itself
 * to wake at that time (keyed with the time, so a rescheduled issue's earlier copy finds the time
 * changed and does nothing). At its time it marks the issue `sending`, plans one message per
 * confirmed subscriber whose consent is in force, then marks it `sent` with the count.
 */
export async function runN4(req: PayloadRequest, input: unknown, now: Date): Promise<Outcome> {
  const { issueId, at } = IssueEvent.parse(input)
  const issue = await req.payload.findByID({
    collection: 'newsletter-issues',
    id: issueId,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
  if (!issue) return done(0, 'not-found')
  if (issue.status !== 'scheduled' && issue.status !== 'sending') return done(0, issue.status)
  if (!issue.scheduledFor) return done(0, 'no-time')
  const due = new Date(issue.scheduledFor)
  if (at && at !== due.toISOString()) return done(0, 'rescheduled')
  if (due.getTime() > now.getTime()) {
    if (at) return done(0, 'early')
    await (req.payload.jobs.queue as unknown as Queue)({
      task: 'N4-send-issue',
      input: {
        name: 'newsletter.issueScheduled',
        issueId,
        at: due.toISOString(),
        key: `newsletter.issueScheduled:${issueId}@${due.toISOString()}`,
      },
      waitUntil: due,
      req,
    })
    return done(0, 'waiting')
  }

  if (issue.status === 'scheduled') {
    await req.payload.update({
      collection: 'newsletter-issues',
      id: issueId,
      data: { status: 'sending' },
      overrideAccess: true,
      context: { [NEWSLETTER_SEND_CONTEXT]: true },
      req,
    })
  }

  let planned = 0
  let recipients = 0
  for (let page = 1; ; page += 1) {
    const { docs, hasNextPage } = await req.payload.find({
      collection: 'subscribers',
      where: { status: { equals: 'confirmed' } },
      sort: 'id',
      limit: PAGE,
      page,
      depth: 0,
      overrideAccess: true,
      req,
    })
    for (const subscriber of docs) {
      if (!(await stillSubscribed(req, subscriber))) continue
      recipients += 1
      const result = await plan(req, {
        automation: 'N4',
        template: 'newsletter-issue',
        channel: 'email',
        recipient: { kind: 'subscriber', id: subscriber.id },
        subject: { collection: 'newsletter-issues', id: issueId },
        variant: `s${subscriber.id}`,
        sendAt: now,
      })
      if (!result.ok) {
        // Without the core nothing is sent: the issue stays `sending` for the next run.
        return done(planned, result.error.code)
      }
      if (result.value.created) planned += 1
    }
    if (!hasNextPage) break
  }

  await req.payload.update({
    collection: 'newsletter-issues',
    id: issueId,
    data: { status: 'sent', sentAt: now.toISOString(), recipientCount: recipients },
    overrideAccess: true,
    context: { [NEWSLETTER_SEND_CONTEXT]: true },
    req,
  })
  return done(planned)
}
