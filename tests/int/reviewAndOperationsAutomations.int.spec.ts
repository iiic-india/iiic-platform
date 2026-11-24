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
import { runO1, runO2, runO5, runO9 } from '@/lib/automations/operations/run'
import { dayVariant } from '@/lib/automations/operations/sections'
import { runV1, runV2 } from '@/lib/automations/reviews'
import { OFFSETS } from '@/lib/automations/timing'
import { SCREENING_TESTS } from '@/lib/proof/reviews'
import type { Consent, ConsentVersion, Person, Testimonial, User } from '@/payload-types'
import config from '@/payload.config'

import { fakeMessagingCore } from '../helpers/fakeMessagingCore'

// Builder C's review and operations automations (docs/06 V1, V2, O1, O2, O5, O9; docs/19 §5,
// §9) against the real database, with a fake of the messaging core, so nothing is sent. Each
// fires once, at its time, by email, to the right people. Obviously fake people, staff and words.
let payload: Payload
let req: PayloadRequest
const fake = fakeMessagingCore()
const STARTED = new Date()
const DAY = 86_400_000
const NAME = 'Fake Person int.cauto'
const email = (label: string) => `int.cauto.${label}@example.invalid`
const TASKS = [
  'V1-review-consent-request',
  'V2-withdrawal-confirmation',
  'N3-unsubscribe',
  'O9-bounce-complaint',
]
const ALL_TESTS = Object.fromEntries(SCREENING_TESTS.map(({ name }) => [name, true]))
let publication: ConsentVersion
let marketing: ConsentVersion
const staff: Record<'owner' | 'operator' | 'editor', User> = {} as never

async function removeTestData() {
  // Deleting a person deletes their reviews (docs/04); their consents stay, marked withdrawn.
  await payload.delete({ collection: 'people', where: { fullName: { like: 'int.cauto' } } })
  await payload.delete({ collection: 'users', where: { email: { like: 'int.cauto.' } } })
  await payload.delete({ collection: 'subscribers', where: { email: { like: 'int.cauto.' } } })
  await payload.delete({ collection: 'suppressions', where: { address: { like: 'int.cauto.' } } })
  for (const task of TASKS) {
    await payload.db.drizzle.execute(
      sql`DELETE FROM "payload_jobs" WHERE "task_slug" = ${task} AND "created_at" >= ${STARTED.toISOString()}`,
    )
  }
}

const notice = (purpose: ConsentVersion['purpose']) =>
  payload.create({
    collection: 'consent-versions',
    data: {
      purpose,
      language: 'en-IN',
      text: `Fake ${purpose} notice (int.cauto).`,
      effectiveFrom: new Date(Date.now() - 30 * DAY).toISOString(),
    } as ConsentVersion,
  })

const person = (label: string) =>
  payload.create({
    collection: 'people',
    data: { fullName: `${NAME} ${label}`, email: email(label) } as Person,
  })

const review = (someone: Person, status: Testimonial['status'] = 'consentRequested') =>
  payload.create({
    collection: 'testimonials',
    data: {
      status,
      person: someone.id,
      designation: 'Fake designation',
      organisation: 'Fake Hidden Org',
      showOrganisation: false,
      place: 'Fakepur',
      programme: 'Fake programme',
      year: 2016,
      doors: ['consultancy'],
      text: 'Fake review words, exactly as written.',
      language: 'en-IN',
      connection: 'none',
      source: 'whatsapp',
      originalReference: 'Fake/Originals/int-cauto.png',
      screening: { result: 'passes', tests: ALL_TESTS },
    } as Testimonial,
    overrideAccess: true,
  })

const queued = async (task: string, key: string) =>
  (
    await payload.count({
      collection: 'payload-jobs',
      where: { and: [{ taskSlug: { equals: task } }, { 'input.key': { equals: key } }] },
      overrideAccess: true,
    })
  ).totalDocs

beforeAll(async () => {
  payload = await getPayload({ config })
  req = await createLocalReq({}, payload)
  await removeTestData()
  publication = await notice('testimonialPublication')
  marketing = await notice('marketingEmail')
  for (const role of ['owner', 'operator', 'editor'] as const) {
    staff[role] = await payload.create({
      collection: 'users',
      data: {
        name: `Fake ${role} int.cauto`,
        email: email(role),
        password: 'test-only-password-cauto',
        roles: [role],
      },
    })
  }
  useMessagingCore(fake.core)
})

afterEach(() => fake.reset())

afterAll(async () => {
  useMessagingCore(null)
  await removeTestData()
})

describe('V1 · the consent request for a review', () => {
  it('is raised once when a review moves to "Consent requested"', async () => {
    const someone = await person('v1-raise')
    const asked = await review(someone)
    expect(await queued('V1-review-consent-request', `review.consentRequested:${asked.id}`)).toBe(1)
    await payload.update({
      collection: 'testimonials',
      id: asked.id,
      data: { notes: 'Fake office note.' },
      overrideAccess: true,
    })
    expect(await queued('V1-review-consent-request', `review.consentRequested:${asked.id}`)).toBe(1)
  })

  it('plans the request now and one reminder five days on, by email, once', async () => {
    const someone = await person('v1')
    const asked = await review(someone)
    const now = new Date('2026-12-01T05:00:00.000Z')
    expect(await runV1(req, { testimonialId: asked.id }, now)).toEqual({ planned: 2 })
    expect(await runV1(req, { testimonialId: asked.id }, now)).toEqual({ planned: 0 })
    const [request, reminder] = fake.of('V1')
    expect(request).toMatchObject({
      template: 'review-consent-request',
      channel: 'email',
      recipient: { kind: 'person', id: someone.id },
      sendAt: now,
    })
    expect(reminder).toMatchObject({ template: 'review-consent-reminder', variant: 'reminder' })
    expect(reminder?.sendAt.getTime()).toBe(now.getTime() + OFFSETS.reviewConsentReminder)
    expect(OFFSETS.reviewConsentReminder).toBe(5 * DAY)
  })

  it('plans nothing for a review not waiting for consent', async () => {
    const someone = await person('v1-screened')
    const screened = await review(someone, 'screened')
    expect(await runV1(req, { testimonialId: screened.id }, new Date())).toEqual({
      planned: 0,
      reason: 'not-requested',
    })
    expect(fake.of('V1')).toHaveLength(0)
  })
})

describe('V2 · the withdrawal of consent to publish', () => {
  const grant = (someone: Person, version: ConsentVersion) =>
    payload.create({
      collection: 'consents',
      data: {
        person: someone.id,
        noticeVersion: version.id,
        channel: 'whatsapp',
        grantedAt: new Date(Date.now() - 2 * DAY).toISOString(),
        evidence: { reference: 'fake-reply-int-cauto.png' },
      } as Consent,
    })
  const withdraw = (consent: Consent) =>
    payload.create({
      collection: 'consents',
      data: {
        withdraws: consent.id,
        channel: 'email',
        withdrawnAt: new Date().toISOString(),
        evidence: { reference: 'fake-withdrawal-int-cauto.png' },
      } as Consent,
    })

  it('raises the confirmation on the withdrawal and plans it once, by email', async () => {
    const someone = await person('v2')
    const withdrawal = await withdraw(await grant(someone, publication))
    expect(await queued('V2-withdrawal-confirmation', `consent.withdrawn:${withdrawal.id}`)).toBe(1)
    expect(await runV2(req, { consentId: withdrawal.id }, new Date())).toEqual({ planned: 1 })
    expect(await runV2(req, { consentId: withdrawal.id }, new Date())).toEqual({ planned: 0 })
    expect(fake.of('V2')[0]).toMatchObject({
      template: 'review-withdrawal-confirmed',
      channel: 'email',
      recipient: { kind: 'person', id: someone.id },
      subject: { collection: 'consents', id: withdrawal.id },
    })
  })

  it('says nothing about a withdrawal of another purpose, or a consent given', async () => {
    const someone = await person('v2-other')
    const given = await grant(someone, marketing)
    const withdrawal = await withdraw(given)
    expect(await runV2(req, { consentId: withdrawal.id }, new Date())).toEqual({
      planned: 0,
      reason: 'other-purpose',
    })
    const published = await grant(someone, publication)
    expect(await runV2(req, { consentId: published.id }, new Date())).toEqual({
      planned: 0,
      reason: 'not-a-withdrawal',
    })
    expect(fake.of('V2')).toHaveLength(0)
  })
})

describe('O1, O2 · the digest and the report', () => {
  const recipients = (automation: string) => fake.of(automation).map((m) => m.recipient.id)

  it('sends the digest to active owners and operators, once a day in India', async () => {
    const now = new Date('2026-12-01T03:00:00.000Z')
    const first = await runO1(req, now)
    expect(first.planned).toBeGreaterThanOrEqual(2)
    expect(recipients('O1')).toEqual(expect.arrayContaining([staff.owner.id, staff.operator.id]))
    expect(recipients('O1')).not.toContain(staff.editor.id)
    expect(fake.of('O1').every((m) => m.template === 'daily-digest' && m.channel === 'email')).toBe(
      true,
    )
    expect(fake.of('O1')[0]?.variant).toBe(dayVariant(now))
    expect(await runO1(req, new Date(now.getTime() + 60_000))).toEqual({ planned: 0 })
    const nextDay = await runO1(req, new Date(now.getTime() + DAY))
    expect(nextDay.planned).toBe(first.planned)
  })

  it('sends the report to owners only', async () => {
    await runO2(req, new Date('2026-12-07T03:30:00.000Z'))
    expect(recipients('O2')).toContain(staff.owner.id)
    expect(recipients('O2')).not.toContain(staff.operator.id)
    expect(fake.of('O2').every((m) => m.template === 'weekly-report')).toBe(true)
  })

  it('skips a staff account that is switched off', async () => {
    await payload.update({
      collection: 'users',
      id: staff.operator.id,
      data: { active: false },
      overrideAccess: true,
    })
    await runO1(req, new Date('2026-12-02T03:00:00.000Z'))
    expect(recipients('O1')).not.toContain(staff.operator.id)
  })
})

describe('O5 · retention, and O9 · a marked address', () => {
  it('removes a pending signup whose link lapsed over a day ago, and keeps a live one', async () => {
    const now = new Date()
    const lapsed = await payload.create({
      collection: 'subscribers',
      data: {
        email: email('lapsed'),
        status: 'pending',
        confirmExpiresAt: new Date(now.getTime() - 2 * DAY).toISOString(),
      },
      overrideAccess: true,
    })
    const live = await payload.create({
      collection: 'subscribers',
      data: {
        email: email('live'),
        status: 'pending',
        confirmExpiresAt: new Date(now.getTime() + 2 * DAY).toISOString(),
      },
      overrideAccess: true,
    })
    await runO5(req, now)
    const left = await payload.find({
      collection: 'subscribers',
      where: { id: { in: [lapsed.id, live.id] } },
      overrideAccess: true,
    })
    expect(left.docs.map((doc) => doc.id)).toEqual([live.id])
  })

  it('records a suppression in the audit log without the address', async () => {
    const suppression = await payload.create({
      collection: 'suppressions',
      data: {
        channel: 'email',
        address: email('bounced'),
        reason: 'hardBounce',
        at: new Date().toISOString(),
        at_tz: 'Asia/Kolkata',
        source: 'resend',
      },
      overrideAccess: true,
    })
    expect(await runO9(req, { suppressionId: suppression.id })).toEqual({
      planned: 0,
      reason: 'email:hardBounce',
    })
    const entries = await payload.find({
      collection: 'audit-log',
      where: {
        and: [
          { entity: { equals: 'suppressions' } },
          { entityId: { equals: String(suppression.id) } },
        ],
      },
      overrideAccess: true,
    })
    expect(entries.totalDocs).toBeGreaterThanOrEqual(1)
    expect(JSON.stringify(entries.docs)).not.toContain(email('bounced'))
  })
})
