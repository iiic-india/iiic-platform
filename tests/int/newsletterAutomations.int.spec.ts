import { sql } from '@payloadcms/db-postgres'
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
// Keeps the module's other exports (the error hook the config loads), as every such mock must.
vi.mock('@/lib/monitoring/sentry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/monitoring/sentry')>()),
  reportError: async () => false,
}))

import { useMessagingCore } from '@/lib/automations/operations/core'
import { runN1, runN2, runN3, runN4 } from '@/lib/newsletter/automations'
import { confirmSignup, signUp, unsubscribe } from '@/lib/newsletter/subscriptions'
import { confirmationKey, confirmationToken } from '@/lib/newsletter/tokens'
import { consentFor } from '@/lib/privacy/consents'
import type { ConsentVersion, NewsletterIssue, Post, Subscriber } from '@/payload-types'
import config from '@/payload.config'

import { fakeMessagingCore } from '../helpers/fakeMessagingCore'

// The newsletter (docs/19 §8; D-10; docs/06 N1 to N4) against the real database, with a fake of
// the messaging core (tests/helpers/fakeMessagingCore.ts), so nothing is sent. Each automation:
// fires once, at its time, by email, and only with the consent in force; the double opt-in stores
// nothing promotional before the person confirms. Obviously fake addresses, people and posts.
let payload: Payload
let req: PayloadRequest
const fake = fakeMessagingCore()
const STARTED = new Date()
const email = (label: string) => `int.newsletter.${label}@example.invalid`
const evidence = { ip: '203.0.113.9', userAgent: 'Fake browser int.newsletter' }
const DAY = 86_400_000
const TASKS = [
  'N1-confirm-signup',
  'N2-welcome',
  'N3-unsubscribe',
  'N4-send-issue',
  'V2-withdrawal-confirmation',
]
let post: Post

async function removeQueuedJobs() {
  for (const task of TASKS) {
    await payload.db.drizzle.execute(
      sql`DELETE FROM "payload_jobs" WHERE "task_slug" = ${task} AND "created_at" >= ${STARTED.toISOString()}`,
    )
  }
}

async function removeTestData() {
  await payload.delete({
    collection: 'newsletter-issues',
    where: { title: { like: 'int.newsletter' } },
    overrideAccess: true,
  })
  await payload.delete({ collection: 'subscribers', where: { email: { like: 'int.newsletter.' } } })
  await payload.delete({ collection: 'people', where: { email: { like: 'int.newsletter.' } } })
  await payload.delete({ collection: 'posts', where: { slug: { like: 'int-newsletter' } } })
  await removeQueuedJobs()
}

/**
 * The entry as stored, its relations as ids (depth 0), as the application reads it: at Payload's
 * default depth `person` and `consent` come back as whole records, and a record passed where an
 * id belongs reaches the ledger's query as NaN.
 */
const entry = async (address: string) =>
  (
    await payload.find({
      collection: 'subscribers',
      where: { email: { equals: address } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0] as Subscriber | undefined

const queued = async (task: string, key: string) =>
  (
    await payload.count({
      collection: 'payload-jobs',
      where: { and: [{ taskSlug: { equals: task } }, { 'input.key': { equals: key } }] },
      overrideAccess: true,
    })
  ).totalDocs

/** The token N1's email carries, re-derived as the server does. */
const tokenOf = (subscriber: Subscriber) =>
  confirmationToken(
    confirmationKey(process.env.PAYLOAD_SECRET as string),
    subscriber.id,
    new Date(subscriber.confirmExpiresAt as string),
  )

/** Signs up and confirms an address, as a person does from the form and the email. */
async function subscribed(label: string, now = new Date()) {
  const address = email(label)
  await signUp(req, { email: address }, now)
  const pending = (await entry(address)) as Subscriber
  const confirmed = await confirmSignup(req, tokenOf(pending), evidence, now)
  if (!confirmed.ok) throw new Error(`could not confirm ${label}`)
  return (await entry(address)) as Subscriber
}

beforeAll(async () => {
  payload = await getPayload({ config })
  req = await createLocalReq({}, payload)
  await removeTestData()
  await payload.create({
    collection: 'consent-versions',
    data: {
      purpose: 'marketingEmail',
      language: 'en-IN',
      text: 'Fake marketing email notice (int.newsletter).',
      effectiveFrom: new Date(Date.now() - DAY).toISOString(),
    } as ConsentVersion,
  })
  // A draft is enough for an issue to point at: the send reads the post when it renders.
  post = await payload.create({
    collection: 'posts',
    data: {
      title: 'Fake post int.newsletter',
      slug: 'int-newsletter-post',
      _status: 'draft',
    } as Post,
    draft: true,
    overrideAccess: true,
  })
  useMessagingCore(fake.core)
})

afterEach(() => fake.reset())

afterAll(async () => {
  useMessagingCore(null)
  await removeTestData()
})

describe('the double opt-in (D-10; CLAUDE.md #4)', () => {
  it('keeps only the address, the notice and a hash before confirmation: no person, no consent', async () => {
    const address = email('pending')
    const result = await signUp(req, { email: address, source: '/journal' }, new Date())
    expect(result).toEqual({ ok: true, value: { action: 'create' } })
    const pending = (await entry(address)) as Subscriber
    expect(pending.status).toBe('pending')
    expect(pending.person ?? null).toBeNull()
    expect(pending.consent ?? null).toBeNull()
    const people = await payload.count({
      collection: 'people',
      where: { email: { equals: address } },
    })
    expect(people.totalDocs).toBe(0)
    expect(await queued('N1-confirm-signup', `newsletter.signedUp:${pending.id}`)).toBe(1)
  })

  it('sends one confirmation email per round (N1 fires once), and a second signup moments later sends none', async () => {
    const address = email('n1')
    const now = new Date()
    await signUp(req, { email: address }, now)
    expect(await signUp(req, { email: address }, new Date(now.getTime() + 1000))).toEqual({
      ok: true,
      value: { action: 'none' },
    })
    const pending = (await entry(address)) as Subscriber
    const input = { subscriberId: pending.id }
    expect(await runN1(req, input, now)).toEqual({ planned: 1 })
    expect(await runN1(req, input, now)).toEqual({ planned: 0 })
    const [message] = fake.of('N1')
    expect(message).toMatchObject({
      template: 'newsletter-confirm',
      channel: 'email',
      recipient: { kind: 'subscriber', id: pending.id },
      sendAt: now,
    })
    expect(message?.sendBefore?.toISOString()).toBe(pending.confirmExpiresAt)
  })

  it('records the consent first, under the notice shown, then confirms the entry and queues N2', async () => {
    const subscriber = await subscribed('confirm')
    expect(subscriber.status).toBe('confirmed')
    expect(subscriber.confirmTokenHash ?? null).toBeNull()
    const consent = await payload.findByID({
      collection: 'consents',
      id: subscriber.consent as number,
      overrideAccess: true,
    })
    expect(consent.purpose).toBe('marketingEmail')
    expect(consent.channel).toBe('web')
    expect(
      typeof consent.noticeVersion === 'object' ? consent.noticeVersion?.id : consent.noticeVersion,
    ).toBe(typeof subscriber.notice === 'object' ? subscriber.notice?.id : subscriber.notice)
    expect(await consentFor(payload, subscriber.person as number, 'marketingEmail')).toBe('granted')
    expect(await queued('N2-welcome', `newsletter.confirmed:${subscriber.id}`)).toBe(1)
  })

  it('refuses a link that is wrong or has lapsed, and confirms nothing', async () => {
    const address = email('lapsed')
    const then = new Date(Date.now() - 8 * DAY)
    await signUp(req, { email: address }, then)
    const pending = (await entry(address)) as Subscriber
    expect(await confirmSignup(req, tokenOf(pending), evidence, new Date())).toEqual({
      ok: false,
      error: { code: 'expired' },
    })
    expect(await confirmSignup(req, 'A'.repeat(43), evidence, new Date())).toEqual({
      ok: false,
      error: { code: 'invalid' },
    })
    expect((await entry(address))?.status).toBe('pending')
  })
})

describe('the welcome and the unsubscribe (N2, N3)', () => {
  it('welcomes once while the consent is in force, by promotional email', async () => {
    const subscriber = await subscribed('welcome')
    expect(await runN2(req, { subscriberId: subscriber.id }, new Date())).toEqual({ planned: 1 })
    expect(await runN2(req, { subscriberId: subscriber.id }, new Date())).toEqual({ planned: 0 })
    expect(fake.of('N2')).toHaveLength(1)
    expect(fake.of('N2')[0]).toMatchObject({ template: 'newsletter-welcome', channel: 'email' })
  })

  it('plans nothing for a subscriber who withdrew before the welcome went', async () => {
    const subscriber = await subscribed('withdrew')
    await unsubscribe(req, subscriber.id, 'web', new Date())
    expect(await runN2(req, { subscriberId: subscriber.id }, new Date())).toEqual({
      planned: 0,
      reason: 'no-consent',
    })
    expect(fake.of('N2')).toHaveLength(0)
  })

  it('unsubscribing withdraws the consent and marks the entry, once; the withdrawal raises N3', async () => {
    const subscriber = await subscribed('unsubscribe')
    const first = await unsubscribe(req, subscriber.id, 'email', new Date())
    expect(first).toEqual({ ok: true, value: { withdrawn: 1 } })
    expect(await unsubscribe(req, subscriber.id, 'email', new Date())).toEqual({
      ok: true,
      value: { withdrawn: 0 },
    })
    expect((await entry(subscriber.email))?.status).toBe('unsubscribed')
    expect(await consentFor(payload, subscriber.person as number, 'marketingEmail')).toBe(
      'withdrawn',
    )
    const withdrawal = (
      await payload.find({
        collection: 'consents',
        where: { withdraws: { equals: subscriber.consent } },
        limit: 1,
        overrideAccess: true,
      })
    ).docs[0]
    expect(withdrawal).toBeDefined()
    expect(await queued('N3-unsubscribe', `consent.withdrawn:${withdrawal?.id}`)).toBe(1)
    // N3 finds the entry already off the list and changes nothing more.
    expect(
      await runN3(req, { name: 'consent.withdrawn', consentId: withdrawal?.id }, new Date()),
    ).toEqual({
      planned: 0,
      reason: 'unsubscribed:0',
    })
  })
})

describe('an issue (N4)', () => {
  const issue = (number: number, data: Partial<NewsletterIssue> = {}) =>
    payload.create({
      collection: 'newsletter-issues',
      data: {
        number,
        title: `Fake issue int.newsletter ${number}`,
        preheader: 'Fake preheader.',
        lead: { post: post.id },
        ...data,
      } as NewsletterIssue,
      overrideAccess: true,
    })

  it('refuses an editor marking an issue sent, and a time already past', async () => {
    await expect(issue(990001, { status: 'sent' })).rejects.toThrow()
    await expect(
      issue(990002, {
        status: 'scheduled',
        scheduledFor: new Date(Date.now() - DAY).toISOString(),
      }),
    ).rejects.toThrow()
  })

  it('waits for its time, then plans one email per subscriber whose consent is in force, once', async () => {
    const reader = await subscribed('reader')
    const gone = await subscribed('gone')
    await unsubscribe(req, gone.id, 'web', new Date())
    const at = new Date(Date.now() + DAY)
    const scheduled = await issue(990003, { status: 'scheduled', scheduledFor: at.toISOString() })
    expect(await queued('N4-send-issue', `newsletter.issueScheduled:${scheduled.id}`)).toBe(1)

    // Before its time: the job queues its own wake-up and plans nothing.
    expect(await runN4(req, { issueId: scheduled.id }, new Date())).toEqual({
      planned: 0,
      reason: 'waiting',
    })
    expect(fake.of('N4')).toHaveLength(0)

    // At its time: the reader, and not the one who withdrew.
    const due = await runN4(req, { issueId: scheduled.id, at: at.toISOString() }, at)
    expect(due.planned).toBeGreaterThanOrEqual(1)
    const toReader = fake.of('N4').filter((m) => m.recipient.id === reader.id)
    expect(toReader).toHaveLength(1)
    expect(toReader[0]).toMatchObject({
      template: 'newsletter-issue',
      channel: 'email',
      variant: `s${reader.id}`,
      subject: { collection: 'newsletter-issues', id: scheduled.id },
    })
    expect(fake.of('N4').some((m) => m.recipient.id === gone.id)).toBe(false)
    const sent = await payload.findByID({
      collection: 'newsletter-issues',
      id: scheduled.id,
      overrideAccess: true,
    })
    expect(sent.status).toBe('sent')

    // A second run of the same job plans nothing more.
    const before = fake.of('N4').length
    expect(await runN4(req, { issueId: scheduled.id, at: at.toISOString() }, at)).toEqual({
      planned: 0,
      reason: 'sent',
    })
    expect(fake.of('N4')).toHaveLength(before)
  })

  it('without the messaging core, leaves the issue scheduled and sends nothing', async () => {
    const at = new Date(Date.now() + DAY)
    const scheduled = await issue(990005, { status: 'scheduled', scheduledFor: at.toISOString() })
    useMessagingCore(null)
    try {
      expect(await runN4(req, { issueId: scheduled.id, at: at.toISOString() }, at)).toEqual({
        planned: 0,
        reason: 'core-missing',
      })
    } finally {
      useMessagingCore(fake.core)
    }
    const after = await payload.findByID({
      collection: 'newsletter-issues',
      id: scheduled.id,
      overrideAccess: true,
    })
    expect(after.status).toBe('scheduled')
  })

  it('a wake-up for an earlier time does nothing once the issue was moved', async () => {
    const first = new Date(Date.now() + DAY)
    const moved = new Date(Date.now() + 2 * DAY)
    const scheduled = await issue(990004, {
      status: 'scheduled',
      scheduledFor: first.toISOString(),
    })
    await payload.update({
      collection: 'newsletter-issues',
      id: scheduled.id,
      data: { scheduledFor: moved.toISOString() },
      overrideAccess: true,
    })
    expect(await runN4(req, { issueId: scheduled.id, at: first.toISOString() }, first)).toEqual({
      planned: 0,
      reason: 'rescheduled',
    })
    expect(fake.of('N4')).toHaveLength(0)
  })
})
