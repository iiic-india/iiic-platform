// @vitest-environment node
import type { PayloadRequest } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { certificateIssued, linkedInAddUrl } from '@/emails/other/certificates'
import {
  complaintAck,
  dataRequestAck,
  incidentAlert,
  privacyDeadline,
} from '@/emails/other/privacy'
import { templateSpec } from '@/emails/registry'
import { renderEmail } from '@/emails/render'
import type { EmailContext } from '@/emails/types'
import { raiseAttendance } from '@/lib/automations/booking/attendance'
import { runBookingTask } from '@/lib/automations/booking/tasks'
import { AUTOMATION_LISTENERS } from '@/lib/automations/listeners'
import { useMessagingCore, type MessagingCore } from '@/lib/automations/operations/core'
import { raiseIncidentOpened, raiseRequestReceived } from '@/lib/automations/privacy/hooks'
import { runC5, runO4, runO7, runO8 } from '@/lib/automations/privacy/run'
import { CERTIFICATE_LISTENERS } from '@/lib/certificates/events'
import { afterSent } from '@/lib/messaging/afterSent'
import { showsPrice } from '@/lib/messaging/guards'
import type { PlannedMessage } from '@/lib/messaging/operations'
import { ok } from '@/lib/result'
import type { Message } from '@/payload-types'

// M6 wired to M5's records (docs/19 §5; docs/18 §4, §5): which tasks hear which event, that each
// fires once, at the right time, on the right channel, and that each message reads its record
// when it is due. Email only, transactional to the person and internal to staff, so consent and
// quiet hours have nothing to hold (the core checks both at send time, tests/unit/
// messagingPolicy.spec.ts). Fake ids, fake people, a fixed clock.

const NOW = new Date('2030-01-07T04:30:00.000Z') // Monday, 7 January 2030, 10 AM IST
const HOUR = 3_600_000

type Row = Record<string, unknown> & { id: number }

/** A Payload stand-in holding a few collections in memory, enough for these automations. */
function fakeReq(collections: Record<string, Row[]>) {
  const queued: { task: string; input: Record<string, unknown> }[] = []
  const updated: { collection: string; id: number; data: Record<string, unknown> }[] = []
  const valueAt = (row: Row, field: string) =>
    field
      .split('.')
      .reduce<unknown>(
        (at, key) =>
          at && typeof at === 'object' ? (at as Record<string, unknown>)[key] : undefined,
        row,
      )
  const matches = (row: Row, where: unknown): boolean => {
    if (!where || typeof where !== 'object') return true
    const clause = where as Record<string, unknown>
    if (Array.isArray(clause.and)) return clause.and.every((part) => matches(row, part))
    return Object.entries(clause).every(([field, test]) => {
      const value = valueAt(row, field)
      const t = test as Record<string, unknown>
      if ('equals' in t) return value === t.equals
      if ('not_equals' in t) return value !== t.not_equals
      if ('in' in t) {
        const wanted = t.in as unknown[]
        return Array.isArray(value)
          ? value.some((entry) => wanted.includes(entry))
          : wanted.includes(value)
      }
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
    update: async ({
      collection,
      id,
      data,
    }: {
      collection: string
      id: number
      data: Record<string, unknown>
    }) => {
      updated.push({ collection, id, data })
      const row = (collections[collection] ?? []).find((entry) => entry.id === id)
      if (row) Object.assign(row, data)
      return row
    },
    jobs: {
      queue: async ({ task, input }: { task: string; input: Record<string, unknown> }) => {
        queued.push({ task, input })
      },
    },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  }
  return { req: { payload } as unknown as PayloadRequest, queued, updated }
}

/** A messaging core that records what it is asked to plan, once per key, as the real one. */
function fakeCore() {
  const planned: PlannedMessage[] = []
  const keys = new Set<string>()
  const core: MessagingCore = {
    deliver: async (_req, message) => {
      const key = `${message.automation}:${message.subject.collection}:${message.subject.id}:${message.variant ?? ''}:${message.channel}`
      const created = !keys.has(key)
      keys.add(key)
      if (created) planned.push(message)
      return ok({ messageId: planned.length, created, status: 'queued' as const })
    },
    cancelQueued: async () => 0,
    verifyLink: async () => ok({ subjectId: 1 }),
  }
  useMessagingCore(core)
  return planned
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

const RECEIVED = new Date('2030-01-01T04:30:00.000Z')
const request = (overrides: Record<string, unknown> = {}): Row => ({
  id: 5,
  type: 'access',
  status: 'received',
  person: 21,
  assignee: 3,
  receivedAt: RECEIVED.toISOString(),
  acknowledgeBy: new Date(RECEIVED.getTime() + 48 * HOUR).toISOString(),
  resolveBy: new Date(RECEIVED.getTime() + 30 * 24 * HOUR).toISOString(),
  summary: 'Fake complaint text, as the office recorded it.',
  ...overrides,
})
const STAFF: Row[] = [
  { id: 1, roles: ['owner'], active: true },
  { id: 2, roles: ['owner'], active: false },
  { id: 3, roles: ['operator'], active: true },
  { id: 4, roles: ['editor'], active: true },
]
const PEOPLE: Row[] = [{ id: 21, fullName: 'Testname Fake' }]

afterEach(() => {
  useMessagingCore(null)
})

describe('M6 listens to M5’s events', () => {
  it('subscribes O4, O7, O8, C5, B8 and B9 to their events', () => {
    expect(AUTOMATION_LISTENERS['dataRequest.received']).toEqual([
      'O4-data-request',
      'O7-complaint',
    ])
    expect(AUTOMATION_LISTENERS['incident.opened']).toEqual(['O8-incident-timers'])
    expect(AUTOMATION_LISTENERS['certificate.issued']).toEqual(['C5-certificate-email'])
    expect(CERTIFICATE_LISTENERS['certificate.issued']).toEqual(['C5-certificate-email'])
    expect(AUTOMATION_LISTENERS['booking.completed']).toEqual(['B8-feedback-request'])
    expect(AUTOMATION_LISTENERS['booking.noShow']).toEqual(['B9-no-show'])
  })

  it('raises a request’s and an incident’s event once, on creation only', async () => {
    const { req, queued } = fakeReq({})
    const args = (operation: 'create' | 'update') =>
      ({ doc: { id: 5 }, operation, req }) as unknown as Parameters<typeof raiseRequestReceived>[0]
    await raiseRequestReceived(args('create'))
    await raiseRequestReceived(args('create'))
    await raiseRequestReceived(args('update'))
    expect(queued.map((job) => job.task)).toEqual(['O4-data-request', 'O7-complaint'])
    expect(queued[0]?.input).toEqual({
      name: 'dataRequest.received',
      dataRequestId: 5,
      key: 'dataRequest.received:5',
    })
    await raiseIncidentOpened({
      doc: { id: 8 },
      operation: 'create',
      req,
    } as unknown as Parameters<typeof raiseIncidentOpened>[0])
    expect(queued.at(-1)).toEqual({
      task: 'O8-incident-timers',
      input: { name: 'incident.opened', incidentId: 8, key: 'incident.opened:8' },
    })
  })

  it('raises booking.completed or booking.noShow when a confirmed session is marked, and nothing else', async () => {
    const { req, queued } = fakeReq({})
    const mark = (from: string, to: string, id = 9) =>
      raiseAttendance({
        doc: { id, status: to },
        previousDoc: { id, status: from },
        operation: 'update',
        req,
      } as unknown as Parameters<typeof raiseAttendance>[0])
    await mark('confirmed', 'completed')
    await mark('confirmed', 'completed')
    await mark('confirmed', 'noShow', 10)
    await mark('confirmed', 'cancelledByClient', 11)
    await mark('completed', 'completed', 12)
    expect(queued).toEqual([
      {
        task: 'B8-feedback-request',
        input: { name: 'booking.completed', bookingId: 9, key: 'booking.completed:9' },
      },
      {
        task: 'B9-no-show',
        input: { name: 'booking.noShow', bookingId: 10, key: 'booking.noShow:10' },
      },
    ])
  })

  it('holds B8 until the feedback page it links to exists, saying why', async () => {
    const { req } = fakeReq({})
    const answer = await runBookingTask(
      'B8-feedback-request',
      { name: 'booking.completed', bookingId: 9, key: 'booking.completed:9' },
      req,
      { core: async () => ok({}) as never, now: NOW },
    )
    expect(answer).toMatchObject({ outcome: 'waits-on-feedback-page' })
  })
})

describe('O4 · a privacy request', () => {
  it('acknowledges to the person now and reminds the assignee at 50% and 80%, once', async () => {
    const planned = fakeCore()
    const { req } = fakeReq({ 'data-requests': [request()], users: STAFF })
    expect(await runO4(req, { dataRequestId: 5 }, NOW)).toEqual({ planned: 3 })
    const resolveBy = new Date(RECEIVED.getTime() + 30 * 24 * HOUR)
    expect(planned).toEqual([
      {
        automation: 'O4',
        template: 'data-request-ack',
        channel: 'email',
        recipient: { kind: 'person', id: 21 },
        subject: { collection: 'data-requests', id: 5 },
        sendAt: NOW,
        sendBefore: resolveBy,
      },
      expect.objectContaining({
        template: 'privacy-deadline',
        recipient: { kind: 'staff', id: 3 },
        variant: 'p50-u3',
        sendAt: new Date(RECEIVED.getTime() + 15 * 24 * HOUR),
        sendBefore: resolveBy,
      }),
      expect.objectContaining({
        variant: 'p80-u3',
        sendAt: new Date(RECEIVED.getTime() + 24 * 24 * HOUR),
      }),
    ])
    // A retried job plans nothing more.
    expect(await runO4(req, { dataRequestId: 5 }, NOW)).toEqual({ planned: 0 })
    for (const message of planned) expect(message.channel).toBe('email')
    expect(templateSpec('data-request-ack').kind).toBe('transactional')
    expect(templateSpec('privacy-deadline').kind).toBe('internal')
  })

  it('reminds every active owner and operator when nobody is assigned, and leaves complaints to O7', async () => {
    const planned = fakeCore()
    const { req } = fakeReq({
      'data-requests': [request({ assignee: null }), request({ id: 6, type: 'consumerComplaint' })],
      users: STAFF,
    })
    await runO4(req, { dataRequestId: 5 }, NOW)
    const staff = planned.filter((message) => message.recipient.kind === 'staff')
    expect([...new Set(staff.map((message) => message.recipient.id))].sort()).toEqual([1, 3])
    expect(await runO4(req, { dataRequestId: 6 }, NOW)).toEqual({
      planned: 0,
      reason: 'other-kind',
    })
  })

  it('says when the request reached IIIC and when it will be answered, with no price', async () => {
    const { req } = fakeReq({ 'data-requests': [request()], people: PEOPLE })
    const loaded = await dataRequestAck.load(req, {
      subject: { collection: 'data-requests', id: 5 },
      recipient: { kind: 'person', id: 21 },
    })
    if (!loaded.ok || !dataRequestAck.email) throw new Error('no data')
    const mail = await renderEmail(dataRequestAck.email, loaded.value, CONTEXT)
    expect(mail.text).toContain('Hello Testname,')
    expect(mail.text).toContain('a copy of the data IIIC holds about you')
    expect(mail.text).toContain('1 January 2030')
    expect(mail.text).toContain('31 January 2030')
    expect(showsPrice(mail.subject, mail.text, mail.html)).toBe(false)
  })

  it('sends no reminder about a closed request', async () => {
    const { req } = fakeReq({ 'data-requests': [request({ status: 'closed' })] })
    const loaded = await privacyDeadline.load(req, {
      subject: { collection: 'data-requests', id: 5 },
      recipient: { kind: 'staff', id: 3 },
      variant: 'p50-u3',
    })
    expect(loaded).toEqual({ ok: false, error: { code: 'stale' } })
  })
})

describe('O7 · a complaint or grievance', () => {
  it('acknowledges with the complaint as recorded, and reminds 24 hours before each mark', async () => {
    const planned = fakeCore()
    const { req } = fakeReq({
      'data-requests': [request({ type: 'privacyGrievance' })],
      users: STAFF,
    })
    expect(await runO7(req, { dataRequestId: 5 }, NOW)).toEqual({ planned: 2 })
    expect(planned[0]).toMatchObject({ automation: 'O7', template: 'complaint-ack', sendAt: NOW })
    // The 48-hour mark passed before the job ran: only the month's reminder is to come.
    expect(planned[1]).toMatchObject({
      template: 'privacy-deadline',
      variant: 'resolve-u3',
      sendAt: new Date(RECEIVED.getTime() + 29 * 24 * HOUR),
    })
    const early = fakeCore()
    const recorded = fakeReq({
      'data-requests': [request({ type: 'consumerComplaint' })],
      users: STAFF,
    })
    await runO7(recorded.req, { dataRequestId: 5 }, new Date(RECEIVED.getTime() + HOUR))
    expect(early.map((message) => message.variant ?? 'ack')).toEqual([
      'ack',
      'acknowledge-u3',
      'resolve-u3',
    ])
    expect(early[1]?.sendAt).toEqual(new Date(RECEIVED.getTime() + 24 * HOUR))
  })

  it('carries the copy as recorded, and records when it went', async () => {
    const { req, updated } = fakeReq({
      'data-requests': [request({ type: 'consumerComplaint' })],
      people: PEOPLE,
    })
    const loaded = await complaintAck.load(req, {
      subject: { collection: 'data-requests', id: 5 },
      recipient: { kind: 'person', id: 21 },
    })
    if (!loaded.ok || !complaintAck.email) throw new Error('no data')
    const mail = await renderEmail(complaintAck.email, loaded.value, CONTEXT)
    expect(mail.subject).toBe('We have received your complaint')
    expect(mail.text).toContain('Fake complaint text, as the office recorded it.')
    const sent = {
      id: 77,
      template: 'complaint-ack',
      subjectCollection: 'data-requests',
      subjectId: 5,
    } as Message
    await afterSent(req, sent, NOW)
    await afterSent(req, sent, new Date(NOW.getTime() + HOUR))
    expect(updated).toEqual([
      {
        collection: 'data-requests',
        id: 5,
        data: { complaintCopySentAt: NOW.toISOString(), complaintCopySentAt_tz: 'Asia/Kolkata' },
      },
    ])
  })

  it('drops the acknowledgement reminder once the request is acknowledged', async () => {
    const { req } = fakeReq({
      'data-requests': [request({ type: 'consumerComplaint', status: 'acknowledged' })],
    })
    const loaded = await privacyDeadline.load(req, {
      subject: { collection: 'data-requests', id: 5 },
      recipient: { kind: 'staff', id: 3 },
      variant: 'acknowledge-u3',
    })
    expect(loaded).toEqual({ ok: false, error: { code: 'stale' } })
  })
})

describe('O8 · the breach register’s timers', () => {
  const DETECTED = new Date(NOW.getTime() - 5 * HOUR)
  const incident = (overrides: Record<string, unknown> = {}): Row => ({
    id: 8,
    status: 'open',
    detectedAt: DETECTED.toISOString(),
    certIn: { reportable: true, dueAt: new Date(DETECTED.getTime() + 6 * HOUR).toISOString() },
    personalData: { affected: false },
    board: { dueAt: new Date(DETECTED.getTime() + 72 * HOUR).toISOString() },
    ...overrides,
  })

  it('alerts every active owner now and at the clock steps still to come, once', async () => {
    const planned = fakeCore()
    const { req } = fakeReq({ incidents: [incident()], users: STAFF })
    // Recorded five hours after detection: the 4-hour step is past and not sent on its own.
    expect(await runO8(req, { incidentId: 8 }, NOW)).toEqual({ planned: 4 })
    expect(planned.map((message) => message.variant)).toEqual([
      'opened-u1',
      'certIn6h-u1',
      'board48h-u1',
      'board72h-u1',
    ])
    expect(planned[1]?.sendAt).toEqual(new Date(DETECTED.getTime() + 6 * HOUR))
    for (const message of planned) expect(message.recipient).toEqual({ kind: 'staff', id: 1 })
    expect(await runO8(req, { incidentId: 8 }, NOW)).toEqual({ planned: 0 })
  })

  it('sends a clock’s step only while that clock runs', async () => {
    const { req } = fakeReq({ incidents: [incident()] })
    const step = (variant: string) =>
      incidentAlert.load(req, {
        subject: { collection: 'incidents', id: 8 },
        recipient: { kind: 'staff', id: 1 },
        variant,
      })
    const certIn = await step('certIn6h-u1')
    expect(certIn.ok).toBe(true)
    // No personal data marked: the Board's clock does not apply.
    expect(await step('board48h-u1')).toEqual({ ok: false, error: { code: 'stale' } })
    const opened = await step('opened-u1')
    if (!opened.ok || !incidentAlert.email) throw new Error('no data')
    const mail = await renderEmail(incidentAlert.email, opened.value, CONTEXT)
    expect(mail.text).toContain('CERT-In report: due')
    expect(mail.html).toContain('https://example.invalid/admin/collections/incidents/8')
  })
})

describe('C5 · the certificate email', () => {
  const certificate = (overrides: Record<string, unknown> = {}): Row => ({
    id: 4,
    status: 'valid',
    person: 21,
    certificateId: 'IIIC-C-2030-1-7',
    programmeName: 'Fake Programme',
    completedOn: '2030-01-05',
    issuedAt: NOW.toISOString(),
    createdAt: NOW.toISOString(),
    ...overrides,
  })

  it('plans one email to the holder, and none for a revoked certificate', async () => {
    const planned = fakeCore()
    const { req } = fakeReq({
      certificates: [certificate(), certificate({ id: 5, status: 'revoked' })],
    })
    expect(await runC5(req, { certificateId: 4 }, NOW)).toEqual({ planned: 1 })
    expect(await runC5(req, { certificateId: 4 }, NOW)).toEqual({ planned: 0 })
    expect(planned[0]).toEqual({
      automation: 'C5',
      template: 'certificate-issued',
      channel: 'email',
      recipient: { kind: 'person', id: 21 },
      subject: { collection: 'certificates', id: 4 },
      sendAt: NOW,
    })
    expect(await runC5(req, { certificateId: 5 }, NOW)).toEqual({ planned: 0, reason: 'revoked' })
  })

  it('names the certificate as the kit does, links its check and LinkedIn, and never calls it a degree', async () => {
    const { req } = fakeReq({ certificates: [certificate()], people: PEOPLE })
    const loaded = await certificateIssued.load(req, {
      subject: { collection: 'certificates', id: 4 },
      recipient: { kind: 'person', id: 21 },
    })
    if (!loaded.ok || !certificateIssued.email) throw new Error('no data')
    const mail = await renderEmail(certificateIssued.email, loaded.value, CONTEXT)
    expect(mail.subject).toBe('Your Certificate of Completion, IIIC-C-2030-1-7')
    expect(mail.html).toContain('/institute/verify?id=IIIC-C-2030-1-7')
    expect(mail.html).toContain('https://www.linkedin.com/profile/add?')
    expect(`${mail.subject} ${mail.text}`).not.toMatch(
      /\b(degree|diploma|university|accredit\w*|recognis\w*|approved)\b/i,
    )
    expect(showsPrice(mail.subject, mail.text, mail.html)).toBe(false)
    const url = new URL(
      linkedInAddUrl({
        programmeName: 'Fake Programme',
        issuedAt: NOW,
        certificateId: 'IIIC-C-2030-1-7',
        verifyUrl: 'https://example.invalid/institute/verify?id=IIIC-C-2030-1-7',
      }),
    )
    expect(url.searchParams.get('organizationName')).toBe('Indian Institute of Image Catalysts')
    expect(url.searchParams.get('issueMonth')).toBe('1')
  })

  it('is stale once the certificate is revoked', async () => {
    const { req } = fakeReq({ certificates: [certificate({ status: 'revoked' })] })
    const loaded = await certificateIssued.load(req, {
      subject: { collection: 'certificates', id: 4 },
      recipient: { kind: 'person', id: 21 },
    })
    expect(loaded).toEqual({ ok: false, error: { code: 'stale' } })
  })
})
