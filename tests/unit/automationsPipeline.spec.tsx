// @vitest-environment node
import type { PayloadRequest } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { partnershipAck, proposalSent, teamMapAck } from '@/emails/other/pipeline'
import { renderEmail } from '@/emails/render'
import type { EmailContext } from '@/emails/types'
import { AUTOMATIONS } from '@/lib/automations/catalogue'
import { automationEventKey } from '@/lib/automations/events'
import { AUTOMATION_LISTENERS } from '@/lib/automations/listeners'
import { useMessagingCore, type MessagingCore } from '@/lib/automations/operations/core'
import {
  coreProposalMailer,
  type ProposalMailCore,
} from '@/lib/automations/pipeline/proposalMailer'
import { P6_TASK, runP1, runP6, runP7 } from '@/lib/automations/pipeline/run'
import { SCHEDULES } from '@/lib/automations/schedules'
import { LISTENERS } from '@/lib/booking/emit'
import { showsPrice } from '@/lib/messaging/guards'
import type { PlannedMessage } from '@/lib/messaging/operations'
import {
  PIPELINE_EVENT_NAMES,
  PIPELINE_LISTENERS,
  pipelineEmitterFor,
  pipelineEventKey,
} from '@/lib/pipeline/core/emit'
import type { PipelineEvent } from '@/lib/pipeline/events'
import { ok } from '@/lib/result'

// M6 wired to M4's events and records (docs/19 §5; docs/17 §8): which tasks hear which pipeline
// event, that each fires once, the acknowledgements and the proposal email through the core's
// port (a fake here), P6's follow-up task, and the templates' words. Fake ids and fake references
// only; the clock is fixed.

const NOW = new Date('2030-01-07T04:30:00.000Z') // Monday, 7 January 2030, 10 AM IST

type Row = Record<string, unknown> & { id: number }

/** A Payload stand-in holding a few collections in memory, enough for these automations. */
function fakeReq(collections: Record<string, Row[]>) {
  const queued: { task: string; input: Record<string, unknown> }[] = []
  const created: { collection: string; data: Record<string, unknown> }[] = []
  const matches = (row: Row, where: unknown): boolean => {
    if (!where || typeof where !== 'object') return true
    const clause = where as Record<string, unknown>
    if (Array.isArray(clause.and)) return clause.and.every((part) => matches(row, part))
    return Object.entries(clause).every(([field, test]) => {
      const value = field
        .split('.')
        .reduce<unknown>(
          (at, key) =>
            at && typeof at === 'object' ? (at as Record<string, unknown>)[key] : undefined,
          row,
        )
      const t = test as Record<string, unknown>
      if ('equals' in t) return value === t.equals
      if ('exists' in t) return t.exists ? value !== undefined && value !== null : value == null
      return true
    })
  }
  const payload = {
    findByID: async ({ collection, id }: { collection: string; id: number }) =>
      (collections[collection] ?? []).find((row) => row.id === Number(id)) ?? null,
    find: async ({ collection, where }: { collection: string; where?: unknown }) => ({
      docs: (collections[collection] ?? []).filter((row) => matches(row, where)),
    }),
    count: async ({ collection, where }: { collection: string; where?: unknown }) => {
      if (collection === 'payload-jobs') {
        const { and } = where as { and: Record<string, { equals?: unknown }>[] }
        const task = and[0]?.taskSlug?.equals
        const key = and[1]?.['input.key']?.equals
        return {
          totalDocs: queued.filter((job) => job.task === task && job.input.key === key).length,
        }
      }
      return {
        totalDocs: (collections[collection] ?? []).filter((row) => matches(row, where)).length,
      }
    },
    create: async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => {
      const row = { id: (collections[collection]?.length ?? 0) + 1, ...data }
      ;(collections[collection] ??= []).push(row)
      created.push({ collection, data })
      return row
    },
    jobs: {
      queue: async ({ task, input }: { task: string; input: Record<string, unknown> }) => {
        queued.push({ task, input })
      },
    },
  }
  return { req: { payload } as unknown as PayloadRequest, queued, created, collections }
}

/** A messaging core that records what it is asked to plan, once per key, as the real one. */
function fakeCore() {
  const planned: { planned: PlannedMessage; transient?: Record<string, string> }[] = []
  const keys = new Set<string>()
  const core: MessagingCore = {
    deliver: async (_req, message, options) => {
      const key = `${message.automation}:${message.subject.collection}:${message.subject.id}:${message.variant ?? ''}`
      const created = !keys.has(key)
      keys.add(key)
      if (created) planned.push({ planned: message, transient: options?.transient })
      return ok({ messageId: planned.length, created, status: 'queued' as const })
    },
    cancelQueued: async () => 0,
    verifyLink: async () => ok({ subjectId: 1 }),
  }
  return { core, planned }
}

const CONTEXT: EmailContext = {
  siteUrl: 'https://example.invalid',
  assetUrl: 'https://example.invalid/email',
  priceAllowed: false,
  footer: {
    legalLine: 'Fake legal name · Fake address',
    siteUrl: 'https://example.invalid',
    siteDisplay: 'example.invalid',
  },
}

afterEach(() => {
  useMessagingCore(null)
})

describe('M6 listens to M4’s events (docs/17 §8)', () => {
  it('acknowledges a request on enquiry.received, P1 and P7 alike, and nothing else of M4’s', () => {
    expect(PIPELINE_LISTENERS['enquiry.received']).toEqual([
      'P1-team-map-ack',
      'P7-partnership-ack',
    ])
    // The proposal email goes from the send itself (its link exists only there); P2, P3 and P4
    // are M4's own tasks, so M6 subscribes nothing else to M4's events.
    for (const name of PIPELINE_EVENT_NAMES) {
      if (name === 'enquiry.received') continue
      expect(PIPELINE_LISTENERS[name], name).toBeUndefined()
    }
  })

  it('leaves M4’s P2 to M4’s own listener, queued once on booking.confirmed', () => {
    expect(LISTENERS['booking.confirmed']).toContain('P2-lead-from-call')
    expect(AUTOMATION_LISTENERS['booking.confirmed'] ?? []).not.toContain('P2-lead-from-call')
    for (const id of ['P2', 'P3', 'P4', 'P5']) {
      expect(AUTOMATIONS.find((entry) => entry.id === id)?.owner, id).toBe('M4')
    }
  })

  it('keys a pipeline event by M4’s own rule, so both modules see one key', () => {
    const events: PipelineEvent[] = [
      { name: 'enquiry.received', enquiryId: 7, leadId: 3, kind: 'teamMap', outcome: 'newLead' },
      { name: 'lead.untouched', leadId: 3, level: 'red' },
      { name: 'proposal.sent', proposalId: 4, versionId: 9 },
    ]
    for (const event of events) expect(automationEventKey(event)).toBe(pipelineEventKey(event))
    expect(automationEventKey(events[0]!)).toBe('enquiry.received:7')
  })

  it('queues P1 and P7 once for one request, however often the event is raised', async () => {
    const { req, queued } = fakeReq({})
    const emit = pipelineEmitterFor(PIPELINE_LISTENERS)
    const event: PipelineEvent = {
      name: 'enquiry.received',
      enquiryId: 7,
      leadId: 3,
      kind: 'teamMap',
      outcome: 'newLead',
    }
    await emit(req, event)
    await emit(req, event)
    expect(queued.map((job) => job.task)).toEqual(['P1-team-map-ack', 'P7-partnership-ack'])
    expect(queued[0]?.input).toEqual({ ...event, key: 'enquiry.received:7' })
  })

  it('runs M4’s alerts hourly and its expiry just after midnight in India', () => {
    expect(SCHEDULES['P3-P4-lead-alerts']?.cron).toBe('0 5 * * * *')
    // 18:40 UTC is 00:10 IST, so a "valid until" day is whole before its proposal expires.
    expect(SCHEDULES['P8-expire-proposals']?.cron).toBe('0 40 18 * * *')
    expect(SCHEDULES['P3-P4-lead-ages']).toBeUndefined()
  })
})

describe('P1 and P7, the acknowledgements', () => {
  const enquiries = () => ({
    enquiries: [
      { id: 7, kind: 'teamMap', status: 'received', person: 21 },
      { id: 8, kind: 'partnership', status: 'received', person: 22 },
      { id: 9, kind: 'teamMap', status: 'spam', person: 23 },
    ],
  })

  it('plans one email about the request, to its person, at once', async () => {
    const { core, planned } = fakeCore()
    useMessagingCore(core)
    const { req } = fakeReq(enquiries())
    expect(await runP1(req, { enquiryId: 7, key: 'enquiry.received:7' }, NOW)).toEqual({
      planned: 1,
    })
    expect(planned[0]?.planned).toEqual({
      automation: 'P1',
      template: 'team-map-ack',
      channel: 'email',
      recipient: { kind: 'person', id: 21 },
      subject: { collection: 'enquiries', id: 7 },
      sendAt: NOW,
    })
    // The job runs again (a retry): the core finds the message and nothing more is planned.
    expect(await runP1(req, { enquiryId: 7 }, NOW)).toEqual({ planned: 0 })
    expect(await runP7(req, { enquiryId: 8 }, NOW)).toEqual({ planned: 1 })
    expect(planned[1]?.planned).toMatchObject({ automation: 'P7', template: 'partnership-ack' })
  })

  it('answers only its own kind of request, and nothing about spam', async () => {
    const { core, planned } = fakeCore()
    useMessagingCore(core)
    const { req } = fakeReq(enquiries())
    expect(await runP7(req, { enquiryId: 7 }, NOW)).toEqual({ planned: 0, reason: 'other-kind' })
    expect(await runP1(req, { enquiryId: 9 }, NOW)).toEqual({ planned: 0, reason: 'spam' })
    expect(await runP1(req, { enquiryId: 99 }, NOW)).toEqual({ planned: 0, reason: 'not-found' })
    expect(planned).toHaveLength(0)
  })

  it('says what the form said, with the proposal call for a Team Map only, and no price', async () => {
    const { req } = fakeReq({
      enquiries: [
        { id: 7, kind: 'teamMap', status: 'received', submitted: { contactName: 'Testname Fake' } },
        { id: 8, kind: 'partnership', status: 'received', person: 22 },
      ],
      people: [{ id: 22, fullName: 'Othername Fake' }],
    })
    const team = await teamMapAck.load(req, {
      subject: { collection: 'enquiries', id: 7 },
      recipient: { kind: 'person', id: 21 },
    })
    if (!team.ok || !teamMapAck.email) throw new Error('no data')
    const mail = await renderEmail(teamMapAck.email, team.value, CONTEXT)
    expect(mail.subject).toBe('Your Team Map request')
    expect(mail.text).toContain('Hello Testname,')
    expect(mail.text).toContain('Your Team Map request has reached IIIC.')
    expect(mail.text).toContain('The office will reply within two working days.')
    expect(mail.html).toContain('https://example.invalid/book/call')
    expect(showsPrice(mail.subject, mail.text, mail.html)).toBe(false)

    const partner = await partnershipAck.load(req, {
      subject: { collection: 'enquiries', id: 8 },
      recipient: { kind: 'person', id: 22 },
    })
    if (!partner.ok || !partnershipAck.email) throw new Error('no data')
    const reply = await renderEmail(partnershipAck.email, partner.value, CONTEXT)
    expect(reply.subject).toBe('Your partnership enquiry')
    expect(reply.text).toContain('Hello Othername,')
    expect(reply.html).not.toContain('/book/call')
  })

  it('is stale once the office has marked the request as spam', async () => {
    const { req } = fakeReq({ enquiries: [{ id: 9, kind: 'teamMap', status: 'spam' }] })
    const loaded = await teamMapAck.load(req, {
      subject: { collection: 'enquiries', id: 9 },
      recipient: { kind: 'person', id: 23 },
    })
    expect(loaded).toEqual({ ok: false, error: { code: 'stale' } })
  })
})

describe('P5, the proposal email through the core (in place of M4’s plain mailer)', () => {
  const LINK = `https://example.invalid/p/${'a'.repeat(43)}`
  const message = {
    to: 'fake@example.invalid',
    reference: 'IIIC-P-99901 v1',
    clientName: 'Fake Organisation',
    linkUrl: LINK,
    personId: 21,
    proposalId: 4,
    versionId: 9,
    sentAt: NOW.toISOString(),
  }

  function mailCore(status: 'sent' | 'queued' | 'skipped') {
    const calls: { planned: PlannedMessage; transient?: Record<string, string> }[] = []
    const cancelled: unknown[] = []
    const core: ProposalMailCore = {
      plan: async (_req, planned, options) => {
        calls.push({ planned, transient: options?.transient as Record<string, string> })
        return ok({ messageId: 55, created: true, status })
      },
      cancelQueued: async (_req, scope) => {
        cancelled.push(scope)
        return 1
      },
    }
    return { core, calls, cancelled }
  }

  it('plans one message per send, with the link given to the first try only', async () => {
    const { core, calls } = mailCore('sent')
    const { req } = fakeReq({})
    const answer = await coreProposalMailer(req, core, () => NOW)(message)
    expect(answer).toEqual({ ok: true, value: { messageId: '55' } })
    expect(calls[0]?.planned).toEqual({
      automation: 'P5',
      template: 'proposal-sent',
      channel: 'email',
      recipient: { kind: 'person', id: 21 },
      subject: { collection: 'proposals', id: 4 },
      variant: `v9-${NOW.getTime()}`,
      sendAt: NOW,
    })
    expect(calls[0]?.transient).toEqual({
      linkUrl: LINK,
      reference: 'IIIC-P-99901 v1',
      clientName: 'Fake Organisation',
    })
    // Nothing of the link reaches the planned message, which the core writes to its row.
    expect(JSON.stringify(calls[0]?.planned)).not.toContain('aaaa')
  })

  it('does not leave an unsent email in the queue, where it would go without its link', async () => {
    const queued = mailCore('queued')
    const { req } = fakeReq({})
    expect(await coreProposalMailer(req, queued.core, () => NOW)(message)).toEqual({
      ok: false,
      error: { code: 'mail-failed' },
    })
    expect(queued.cancelled).toEqual([
      { subject: { collection: 'proposals', id: 4 }, automations: ['P5'] },
    ])
    const skipped = mailCore('skipped')
    expect((await coreProposalMailer(req, skipped.core, () => NOW)(message)).ok).toBe(false)
    expect(skipped.cancelled).toEqual([])
  })

  it('renders the link as the one button and no amount; without the link it is never sent', async () => {
    const { req } = fakeReq({
      proposals: [
        { id: 4, status: 'sent' },
        { id: 5, status: 'declined' },
      ],
    })
    const loaded = await proposalSent.load(req, {
      subject: { collection: 'proposals', id: 4 },
      recipient: { kind: 'person', id: 21 },
      transient: { linkUrl: LINK, reference: message.reference, clientName: message.clientName },
    })
    if (!loaded.ok || !proposalSent.email) throw new Error('no data')
    const mail = await renderEmail(proposalSent.email, loaded.value, CONTEXT)
    expect(mail.subject).toBe('Your proposal from IIIC, IIIC-P-99901 v1')
    expect(mail.html).toContain(LINK)
    expect(mail.text).toContain('Fake Organisation')
    expect(showsPrice(mail.subject, mail.text, mail.html)).toBe(false)

    const later = await proposalSent.load(req, {
      subject: { collection: 'proposals', id: 4 },
      recipient: { kind: 'person', id: 21 },
    })
    expect(later).toEqual({ ok: false, error: { code: 'stale' } })
    const answered = await proposalSent.load(req, {
      subject: { collection: 'proposals', id: 5 },
      recipient: { kind: 'person', id: 21 },
      transient: { linkUrl: LINK, reference: message.reference, clientName: message.clientName },
    })
    expect(answered).toEqual({ ok: false, error: { code: 'stale' } })
    // Only a tracked link on the site is ever carried.
    const elsewhere = await proposalSent.load(req, {
      subject: { collection: 'proposals', id: 4 },
      recipient: { kind: 'person', id: 21 },
      transient: { linkUrl: 'https://example.invalid/other', reference: 'R', clientName: 'C' },
    })
    expect(elsewhere.ok).toBe(false)
  })
})

describe('P6, the unanswered proposal', () => {
  const addWorkingDays = (from: Date, days: number) => {
    const day = new Date(from)
    let added = 0
    while (added < days) {
      day.setUTCDate(day.getUTCDate() + 1)
      if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) added += 1
    }
    return day.toISOString().slice(0, 10)
  }

  it('makes one follow-up task five working days after the send, and none twice', async () => {
    const { req, collections } = fakeReq({
      proposals: [
        { id: 4, status: 'sent', reference: 'IIIC-P-99901', lead: 3, sentVersion: 9 },
        { id: 5, status: 'sent', reference: 'IIIC-P-99902', lead: 3, sentVersion: 10 },
      ],
      'proposal-versions': [
        // Sent Monday 31 December 2029: five working days on is Monday 7 January 2030.
        { id: 9, sending: { sentAt: '2029-12-31T06:00:00.000Z' } },
        // Sent Wednesday 2 January 2030: not yet.
        { id: 10, sending: { sentAt: '2030-01-02T06:00:00.000Z' } },
      ],
      leads: [{ id: 3, owner: 2 }],
      tasks: [],
    })
    const createTask = vi.fn(async (_req: PayloadRequest, input: Record<string, unknown>) => {
      ;(collections.tasks ??= []).push({ id: collections.tasks.length + 1, ...input })
      return ok({ id: collections.tasks.length } as never)
    })
    const deps = { createTask: createTask as never, addWorkingDays }
    expect(await runP6(req, NOW, deps)).toEqual({ planned: 1 })
    expect(createTask).toHaveBeenCalledTimes(1)
    expect(createTask.mock.calls[0]?.[1]).toEqual({
      kind: 'reviewFollowUpDraft',
      title: 'Proposal IIIC-P-99901 not opened in five working days: send the follow-up',
      dueOn: '2030-01-07',
      role: 'operator',
      assigneeId: 2,
      leadId: 3,
      note: P6_TASK.draft,
      automation: 'P6',
      key: 'P6:version:9',
    })
    expect(await runP6(req, NOW, deps)).toEqual({ planned: 0 })
  })
})
