import { sql } from '@payloadcms/db-postgres'
import { createLocalReq, getPayload, type Payload } from 'payload'
import { createElement } from 'react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { Frame, Paragraph } from '@/emails/components/Frame'
import type { TemplateImplementation } from '@/emails/types'
import { FakeEmailSender, FakeWhatsAppSender } from '@/lib/messaging/fakes'
import type { PlannedMessage } from '@/lib/messaging/operations'
import { quietHoursEnd } from '@/lib/messaging/policy'
import { err, ok } from '@/lib/result'
import type { ConsentVersion, Message, MessageTemplate, Person } from '@/payload-types'
import config from '@/payload.config'

// The messaging core against the real database (docs/19 §2, §3, §4, §11), with the in-memory
// fake senders, a fake template and a fixed clock far ahead: a message fires once under a repeat
// and under concurrency; quiet hours defer a WhatsApp message rather than drop it, and drop one
// they would push past its use; a withdrawn consent stops a promotional message already queued;
// a suppressed WhatsApp number falls back to email; a signed bounce suppresses the address once;
// a STOP suppresses WhatsApp and withdraws its consent. Obviously fake people and addresses,
// removed at the end with the jobs this file's events queued.
vi.mock('server-only', () => ({}))

const { deliverWith, cancelQueued } = await import('@/lib/messaging/deliver')
const { dispatchWith } = await import('@/lib/messaging/dispatch')
const { tryMessage } = await import('@/lib/messaging/try')
const { applyReport } = await import('@/lib/messaging/report')
const { recordInbound } = await import('@/lib/messaging/conversation')
const { withdrawPurpose } = await import('@/lib/messaging/withdrawals')
const { readQuietHours } = await import('@/lib/settings/source')

let payload: Payload
const TAG = 'int.messaging'
const address = (label: string) => `${TAG}.${label}@fake.example.invalid`
const people: Record<'a' | 'b' | 'c', Person> = {} as never
const email = new FakeEmailSender()
const whatsapp = new FakeWhatsAppSender()
const events: { name: string }[] = []
type TemplateRow = { id: number; created: boolean; before?: MessageTemplate }
const templateRows: TemplateRow[] = []

/** A time in India on 3 March 2099, a day no other test uses: `ist('22:30')`. */
const ist = (clock: string, day = 3) => new Date(`2099-03-0${day}T${clock}:00+05:30`)

const fakeTemplate: TemplateImplementation<{ ref: string }> = {
  load: async () => ok({ ref: 'INT-MSG' }),
  email: {
    key: 'time-request-received',
    schema: z.object({ ref: z.string() }),
    subject: () => 'Fake subject (int.messaging)',
    preheader: () => 'Fake preheader',
    element: (data, context) => {
      const props = {
        preheader: 'Fake preheader',
        heading: 'Fake heading',
        assetUrl: context.assetUrl,
        footer: context.footer,
      } as Parameters<typeof Frame>[0]
      return createElement(Frame, props, createElement(Paragraph, null, `Fake line ${data.ref}.`))
    },
  },
  whatsapp: { key: 'reminder-24h', schema: z.object({ ref: z.string() }), params: () => ['Fake'] },
}

const depsAt = (now: Date) => ({
  channels: () => ({ email, whatsapp, configured: { email: true, whatsapp: true } }),
  now: () => now,
  implementation: () => fakeTemplate as unknown as TemplateImplementation<never>,
  emit: async (_req: unknown, event: { name: string }) => {
    events.push(event)
  },
  site: () => ({
    siteUrl: 'https://fake.example.invalid',
    fromAddress: address('from'),
    blockPlaceholders: false,
  }),
})

const req = () => createLocalReq({}, payload)
const sentWith = (sender: FakeEmailSender | FakeWhatsAppSender, key: string) =>
  sender.sent.filter((entry) => entry.idempotencyKey === key)

async function row(id: number): Promise<Message> {
  return payload.findByID({ collection: 'messages', id, depth: 0 })
}

async function removeTestData() {
  const ids = Object.values(people)
    .map((person) => person?.id)
    .filter((id): id is number => typeof id === 'number')
  const { docs: found } = await payload.find({
    collection: 'people',
    where: { fullName: { like: TAG } },
    pagination: false,
    depth: 0,
  })
  const all = [...new Set([...ids, ...found.map((person) => person.id)])]
  if (all.length) {
    const { docs: messages } = await payload.find({
      collection: 'messages',
      where: { person: { in: all } },
      pagination: false,
      depth: 0,
    })
    const { docs: suppressions } = await payload.find({
      collection: 'suppressions',
      where: { person: { in: all } },
      pagination: false,
      depth: 0,
    })
    const { docs: consents } = await payload.find({
      collection: 'consents',
      where: { person: { in: all } },
      pagination: false,
      depth: 0,
    })
    // The jobs this file's events queued (O3, O9, N3, V2): ids only in their input.
    const keys = [
      ...messages.map((doc) => `message.failed:${doc.id}`),
      ...suppressions.map((doc) => `message.suppressed:${doc.id}`),
      ...consents.map((doc) => `consent.withdrawn:${doc.id}`),
    ]
    for (const key of keys) {
      await payload.db.drizzle.execute(
        sql`DELETE FROM "payload_jobs" WHERE "input"->>'key' = ${key}`,
      )
    }
    await payload.delete({
      collection: 'messages',
      where: { fallbackOf: { exists: true }, person: { in: all } },
    })
    await payload.delete({ collection: 'messages', where: { person: { in: all } } })
    await payload.delete({ collection: 'suppressions', where: { person: { in: all } } })
  }
  await payload.delete({ collection: 'suppressions', where: { address: { like: TAG } } })
  await payload.delete({ collection: 'people', where: { fullName: { like: TAG } } })
}

async function consentTo(person: Person, purpose: 'marketingEmail' | 'marketingWhatsapp') {
  const notice = await payload.create({
    collection: 'consent-versions',
    data: {
      purpose,
      language: 'en-IN',
      text: `Fake consent text for ${purpose} (${TAG}).`,
      effectiveFrom: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    } as ConsentVersion,
  })
  return payload.create({
    collection: 'consents',
    data: {
      person: person.id,
      noticeVersion: notice.id,
      channel: 'web',
      evidence: { form: 'Fake form', ip: '203.0.113.9', userAgent: 'Fake browser' },
    } as never,
  })
}

const plan = (person: Person, overrides: Partial<PlannedMessage> = {}): PlannedMessage => ({
  automation: 'B12',
  template: 'time-request-received',
  channel: 'email',
  recipient: { kind: 'person', id: person.id },
  subject: { collection: 'people', id: person.id },
  sendAt: ist('11:00'),
  ...overrides,
})

beforeAll(async () => {
  payload = await getPayload({ config })
  await removeTestData()
  const make = (label: string, mobile: string) =>
    payload.create({
      collection: 'people',
      data: { fullName: `Fake ${TAG} ${label}`, email: address(label), mobile } as Person,
    })
  people.a = await make('a', '+919000000101')
  people.b = await make('b', '+919000000102')
  people.c = await make('c', '+919000000103')
  // Approved WhatsApp templates for the two reminders (B5, B6), each kept as it was if one is
  // there already, so a reminder is held by the rule under test and not by a missing approval.
  for (const key of ['reminder-24h', 'reminder-short'] as const) {
    const { docs } = await payload.find({
      collection: 'message-templates',
      where: { and: [{ key: { equals: key } }, { channel: { equals: 'whatsapp' } }] },
      limit: 1,
      depth: 0,
    })
    const existing = docs[0]
    if (existing) {
      templateRows.push({ id: existing.id, created: false, before: existing })
      await payload.update({
        collection: 'message-templates',
        id: existing.id,
        data: {
          status: 'approved',
          providerTemplateName: existing.providerTemplateName ?? `fake_${key}`,
        },
      })
    } else {
      const made = await payload.create({
        collection: 'message-templates',
        data: {
          key,
          channel: 'whatsapp',
          language: 'en-IN',
          status: 'approved',
          providerTemplateName: `fake_${key}`,
        } as MessageTemplate,
      })
      templateRows.push({ id: made.id, created: true })
    }
  }
})

afterAll(async () => {
  await removeTestData()
  for (const templateRow of templateRows) {
    if (templateRow.created) {
      await payload.delete({ collection: 'message-templates', id: templateRow.id })
    } else if (templateRow.before) {
      const { status, providerTemplateName } = templateRow.before
      await payload.update({
        collection: 'message-templates',
        id: templateRow.id,
        data: { status, providerTemplateName },
      })
    }
  }
})

describe('a message whose data is gone, or whose subject moved on', () => {
  const withLoad = (at: Date, load: TemplateImplementation<{ ref: string }>['load']) => ({
    ...depsAt(at),
    implementation: () => ({ ...fakeTemplate, load }) as unknown as TemplateImplementation<never>,
  })

  it('fails as data-missing and raises message.failed when the data is not found', async () => {
    const at = ist('13:00')
    const planned = await deliverWith(withLoad(at, async () => err({ code: 'not-found' })))(
      await req(),
      plan(people.b, { variant: 'data-gone', sendAt: at }),
    )
    if (!planned.ok) throw new Error('not planned')
    expect(await row(planned.value.messageId)).toMatchObject({
      status: 'failed',
      lastError: 'data-missing',
    })
    expect(events).toContainEqual({ name: 'message.failed', messageId: planned.value.messageId })
    expect(sentWith(email, (await row(planned.value.messageId)).dedupeKey)).toHaveLength(0)
  })

  it('is skipped as stale, with no alarm, when its subject moved on', async () => {
    const at = ist('13:00')
    const planned = await deliverWith(withLoad(at, async () => err({ code: 'stale' })))(
      await req(),
      plan(people.b, { variant: 'moved-on', sendAt: at }),
    )
    if (!planned.ok) throw new Error('not planned')
    expect(await row(planned.value.messageId)).toMatchObject({
      status: 'skipped',
      skipReason: 'stale',
    })
    expect(events).not.toContainEqual({
      name: 'message.failed',
      messageId: planned.value.messageId,
    })
  })
})

describe('fires once (docs/19 §2)', () => {
  it('writes one row and sends once when the same message is delivered twice', async () => {
    const deliver = deliverWith(depsAt(ist('11:00')))
    const first = await deliver(await req(), plan(people.a, { variant: 'repeat' }))
    const second = await deliver(await req(), plan(people.a, { variant: 'repeat' }))
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(first.value).toMatchObject({ created: true, status: 'sent' })
    expect(second.value).toMatchObject({ messageId: first.value.messageId, created: false })
    const message = await row(first.value.messageId)
    expect(sentWith(email, message.dedupeKey)).toHaveLength(1)
    expect(message).toMatchObject({ status: 'sent', attempts: 1, provider: 'fake' })
  })

  it('writes one row when two deliver the same message at the same moment', async () => {
    const deliver = deliverWith(depsAt(ist('11:00')))
    const planned = plan(people.a, { variant: 'race', sendAt: ist('12:00') })
    const [one, two] = await Promise.all([
      deliver(await req(), planned),
      deliver(await req(), planned),
    ])
    expect(one.ok && two.ok).toBe(true)
    if (!one.ok || !two.ok) return
    expect(one.value.messageId).toBe(two.value.messageId)
    expect([one.value.created, two.value.created].filter(Boolean)).toHaveLength(1)
  })

  it('sends once when two runners try one due message at once, and once more changes nothing', async () => {
    const at = ist('12:00')
    const deliver = deliverWith(depsAt(ist('11:00')))
    const planned = await deliver(await req(), plan(people.a, { variant: 'claim', sendAt: at }))
    if (!planned.ok) throw new Error('not planned')
    const deps = depsAt(at)
    const outcomes = await Promise.all([
      tryMessage(await req(), deps, planned.value.messageId),
      tryMessage(await req(), deps, planned.value.messageId),
    ])
    expect(outcomes.sort()).toEqual(['not-claimed', 'sent'])
    const message = await row(planned.value.messageId)
    expect(sentWith(email, message.dedupeKey)).toHaveLength(1)
    // The dispatcher a minute later finds it sent and leaves it.
    await dispatchWith(deps)(await req(), at, 50)
    expect(sentWith(email, message.dedupeKey)).toHaveLength(1)
    expect((await row(message.id)).attempts).toBe(1)
  })

  it('cancels the queued messages about a subject, and only the automations asked', async () => {
    const deliver = deliverWith(depsAt(ist('09:00')))
    const later = plan(people.c, { variant: 'later', sendAt: ist('18:00') })
    const other = plan(people.c, {
      automation: 'B7',
      template: 'booking-cancelled',
      sendAt: ist('18:00'),
    })
    const kept = await deliver(await req(), later)
    const gone = await deliver(await req(), other)
    if (!kept.ok || !gone.ok) throw new Error('not planned')
    const count = await cancelQueued(await req(), {
      subject: { collection: 'people', id: people.c.id },
      automations: ['B7'],
    })
    expect(count).toBe(1)
    expect((await row(gone.value.messageId)).status).toBe('cancelled')
    expect((await row(kept.value.messageId)).status).toBe('queued')
  })
})

describe('quiet hours (docs/06, docs/19 §6)', () => {
  it('defers a WhatsApp reminder planned in quiet hours to their end, then sends it', async () => {
    const quiet = await readQuietHours(payload)
    // Two hours before the quiet hours end, so inside them.
    const evening = new Date(quietHoursEnd(ist('12:00'), quiet).getTime() - 2 * 3_600_000)
    const deliver = deliverWith(depsAt(evening))
    const session = new Date(evening.getTime() + 24 * 3_600_000)
    const planned = await deliver(
      await req(),
      plan(people.b, {
        automation: 'B5',
        template: 'reminder-24h',
        channel: 'whatsapp',
        fallback: 'email',
        sendAt: evening,
        sendBefore: session,
      }),
    )
    if (!planned.ok) throw new Error('not planned')
    expect(planned.value.status).toBe('queued')
    const message = await row(planned.value.messageId)
    const end = quietHoursEnd(evening, quiet)
    expect(new Date(message.sendAt as string).toISOString()).toBe(end.toISOString())
    // A minute before the end nothing goes; at the end it does, on WhatsApp.
    await dispatchWith(depsAt(new Date(end.getTime() - 60_000)))(
      await req(),
      new Date(end.getTime() - 60_000),
      50,
    )
    expect(sentWith(whatsapp, message.dedupeKey)).toHaveLength(0)
    await dispatchWith(depsAt(end))(await req(), end, 50)
    expect(sentWith(whatsapp, message.dedupeKey)).toHaveLength(1)
    expect((await row(message.id)).status).toBe('sent')
  })

  it('defers at send time a WhatsApp message that came due before the quiet hours began', async () => {
    const quiet = await readQuietHours(payload)
    const end = quietHoursEnd(ist('12:00', 4), quiet)
    const dueAt = new Date(end.getTime() - 14 * 3_600_000)
    const runAt = new Date(end.getTime() - 3_600_000)
    const deliver = deliverWith(depsAt(new Date(dueAt.getTime() - 3_600_000)))
    const planned = await deliver(
      await req(),
      plan(people.b, {
        automation: 'B5',
        template: 'reminder-24h',
        channel: 'whatsapp',
        variant: 'late-runner',
        sendAt: dueAt,
      }),
    )
    if (!planned.ok) throw new Error('not planned')
    const outcome = await tryMessage(await req(), depsAt(runAt), planned.value.messageId)
    expect(outcome).toBe('deferred')
    const message = await row(planned.value.messageId)
    expect(message.status).toBe('queued')
    expect(message.attempts).toBe(0)
    expect(new Date(message.sendAt as string).toISOString()).toBe(end.toISOString())
  })

  it('drops, not moves to email, a reminder the quiet hours would push past its session', async () => {
    const quiet = await readQuietHours(payload)
    const end = quietHoursEnd(ist('12:00', 5), quiet)
    const inQuiet = new Date(end.getTime() - 2 * 3_600_000)
    const session = new Date(end.getTime() - 60 * 60_000)
    // Planned at noon the day before, for a time inside the quiet hours that their end would
    // push past the session: queued for its own time, not refused when planned (D-103).
    const planning = new Date(inQuiet.getTime() - 12 * 3_600_000)
    const planned = await deliverWith(depsAt(planning))(
      await req(),
      plan(people.b, {
        automation: 'B6',
        template: 'reminder-short',
        channel: 'whatsapp',
        sendAt: inQuiet,
        sendBefore: session,
      }),
    )
    if (!planned.ok) throw new Error('not planned')
    expect(await row(planned.value.messageId)).toMatchObject({ status: 'queued' })
    // When it is due, the quiet hours then in force drop it: not sent, not moved to email.
    await dispatchWith(depsAt(inQuiet))(await req(), inQuiet, 50)
    const message = await row(planned.value.messageId)
    expect(message).toMatchObject({ status: 'skipped', skipReason: 'quiet-hours-late' })
    expect(sentWith(whatsapp, message.dedupeKey)).toHaveLength(0)
    const { totalDocs: fallbacks } = await payload.count({
      collection: 'messages',
      where: { fallbackOf: { equals: message.id } },
    })
    expect(fallbacks).toBe(0)
  })
})

describe('consent at send time (CLAUDE.md #4)', () => {
  it('sends a promotional message while consent is in force, and skips one queued before a withdrawal', async () => {
    await consentTo(people.b, 'marketingEmail')
    const promo = (variant: string, sendAt: Date) =>
      plan(people.b, {
        automation: 'N2',
        template: 'newsletter-welcome',
        variant,
        sendAt,
      })
    const now = ist('10:00')
    const sentNow = await deliverWith(depsAt(now))(await req(), promo('in-force', now))
    if (!sentNow.ok) throw new Error('not planned')
    expect(sentNow.value.status).toBe('sent')
    const queued = await deliverWith(depsAt(now))(
      await req(),
      promo('after-withdrawal', ist('15:00')),
    )
    if (!queued.ok) throw new Error('not planned')
    expect(queued.value.status).toBe('queued')
    const withdrawn = await withdrawPurpose(await req(), {
      personId: people.b.id,
      purpose: 'marketingEmail',
      channel: 'web',
      evidence: { form: 'Fake unsubscribe' },
    })
    expect(withdrawn.length).toBeGreaterThan(0)
    await dispatchWith(depsAt(ist('15:00')))(await req(), ist('15:00'), 50)
    const message = await row(queued.value.messageId)
    expect(message).toMatchObject({ status: 'skipped', skipReason: 'no-consent' })
    expect(sentWith(email, message.dedupeKey)).toHaveLength(0)
  })

  it('needs no consent for a transactional message', async () => {
    const result = await deliverWith(depsAt(ist('10:00')))(
      await req(),
      plan(people.b, { variant: 'transactional', sendAt: ist('10:00') }),
    )
    expect(result.ok && result.value.status).toBe('sent')
  })
})

describe('the providers’ reports and STOP (docs/19 §4)', () => {
  it('suppresses a permanently bounced address once, and sends nothing more to it', async () => {
    const delivered = await deliverWith(depsAt(ist('10:00')))(
      await req(),
      plan(people.c, { variant: 'bounce', sendAt: ist('10:00') }),
    )
    if (!delivered.ok) throw new Error('not planned')
    const message = await row(delivered.value.messageId)
    const report = {
      provider: 'resend' as const,
      providerMessageId: String(message.providerMessageId),
      status: 'bounced' as const,
      bounce: 'permanent' as const,
      at: ist('10:01'),
      address: address('c'),
    }
    const first = await applyReport(await req(), report)
    const replay = await applyReport(await req(), report)
    expect(first.ok && first.value.moved).toBe(true)
    expect(replay.ok && replay.value.moved).toBe(false)
    expect((await row(message.id)).status).toBe('bounced')
    const { totalDocs } = await payload.count({
      collection: 'suppressions',
      where: { and: [{ channel: { equals: 'email' } }, { address: { equals: address('c') } }] },
    })
    expect(totalDocs).toBe(1)
    const after = await deliverWith(depsAt(ist('11:00')))(
      await req(),
      plan(people.c, { variant: 'after-bounce', sendAt: ist('11:00') }),
    )
    expect(after.ok && after.value.status).toBe('skipped')
    expect(await applyReport(await req(), { ...report, providerMessageId: 'no-such-id' })).toEqual({
      ok: false,
      error: { code: 'unknown-message' },
    })
  })

  it('honours a STOP: WhatsApp suppressed, its consent withdrawn, booking messages by email', async () => {
    await consentTo(people.a, 'marketingWhatsapp')
    const at = ist('09:30')
    const stop = await recordInbound(
      await req(),
      { kind: 'inbound', from: String(people.a.mobile), at, stop: true },
      'wamid.fake-stop',
    )
    expect(stop).toMatchObject({ personId: people.a.id, suppressed: true })
    expect(stop.withdrawn).toBeGreaterThan(0)
    const person = await payload.findByID({ collection: 'people', id: people.a.id, depth: 0 })
    expect(new Date(person.whatsappLastInboundAt as string).toISOString()).toBe(at.toISOString())
    const reminder = await deliverWith(depsAt(ist('10:00')))(
      await req(),
      plan(people.a, {
        automation: 'B5',
        template: 'reminder-24h',
        channel: 'whatsapp',
        fallback: 'email',
        sendAt: ist('10:00'),
        sendBefore: ist('18:00'),
      }),
    )
    if (!reminder.ok) throw new Error('not planned')
    const original = await row(reminder.value.messageId)
    expect(original).toMatchObject({ status: 'skipped', skipReason: 'suppressed' })
    const { docs } = await payload.find({
      collection: 'messages',
      where: { fallbackOf: { equals: original.id } },
      depth: 0,
    })
    expect(docs).toHaveLength(1)
    expect(docs[0]).toMatchObject({ channel: 'email', status: 'sent' })
    expect(sentWith(whatsapp, original.dedupeKey)).toHaveLength(0)
  })
})
