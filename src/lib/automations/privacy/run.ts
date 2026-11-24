import 'server-only'

import type { PayloadRequest } from 'payload'
import { z } from 'zod'

import type { Role } from '@/access/roles'
import { INCIDENT_STEPS, type ReminderStep } from '@/emails/other/privacy'
import type { AutomationId } from '@/lib/automations/catalogue'
import { plan } from '@/lib/automations/operations/core'
import { done, RecordId, type Outcome } from '@/lib/automations/operations/outcome'
import { idOf } from '@/lib/privacy/consentLedger'
import { COMPLAINT_TYPES, type RequestType } from '@/lib/privacy/requests'

import { reminderTimes } from './timing'

/**
 * The automations on M5's records (docs/06 O4, O7, O8, C5; docs/18 §4, §5), each idempotent: one
 * `messages` row per key, so a job that runs twice plans nothing new, and every message reads its
 * record again when it is due (src/emails/other/privacy.tsx, certificates.tsx).
 *
 * O4 · `dataRequest.received`, any kind but a complaint: the acknowledgement to the person now;
 * reminders to the request's assignee (else every active owner and operator) at 50% and 80% of
 * the time to its resolve-by deadline.
 * O7 · the same event, a consumer complaint or a privacy grievance: the acknowledgement with the
 * complaint as recorded now; reminders to the assignee 24 hours before each mark, the 48-hour
 * acknowledgement and the one-month resolution (docs/06: "at 24 h and before each deadline").
 * O8 · `incident.opened`: every active owner alerted at once, and at 4, 6, 48 and 72 hours from
 * the detection, each step sent only while its clock still runs.
 * C5 · `certificate.issued`: the holder's email, once.
 */

const RequestEvent = z.object({ dataRequestId: RecordId })
const IncidentEvent = z.object({ incidentId: RecordId })
const CertificateEvent = z.object({ certificateId: RecordId })

const instant = (value: unknown): Date | null => {
  if (typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** The active staff holding a role, by id. */
async function staffWith(req: PayloadRequest, roles: Role[]): Promise<number[]> {
  const { docs } = await req.payload.find({
    collection: 'users',
    where: { and: [{ roles: { in: roles } }, { active: { not_equals: false } }] },
    pagination: false,
    depth: 0,
    select: { roles: true },
    overrideAccess: true,
    req,
  })
  return docs.map((user) => user.id)
}

/** Who a request's reminders go to: its assignee while active, else the owners and the office. */
async function requestKeepers(req: PayloadRequest, assignee: unknown): Promise<number[]> {
  const id = idOf(assignee)
  if (id !== null) {
    const user = await req.payload.findByID({
      collection: 'users',
      id: Number(id),
      depth: 0,
      disableErrors: true,
      overrideAccess: true,
      select: { active: true },
      req,
    })
    if (user && user.active !== false) return [user.id]
  }
  return staffWith(req, ['owner', 'operator'])
}

type Planned = { planned: number; refused?: string }

async function planAll(
  req: PayloadRequest,
  messages: Parameters<typeof plan>[1][],
): Promise<Planned> {
  let planned = 0
  for (const message of messages) {
    const result = await plan(req, message)
    if (!result.ok) return { planned, refused: result.error.code }
    if (result.value.created) planned += 1
  }
  return { planned }
}

const outcomeOf = ({ planned, refused }: Planned) =>
  refused ? done(planned, refused) : done(planned)

/** O4 or O7 for one request: the acknowledgement and its reminders, once. */
async function runRequest(
  automation: 'O4' | 'O7',
  req: PayloadRequest,
  input: unknown,
  now: Date,
): Promise<Outcome> {
  const { dataRequestId } = RequestEvent.parse(input)
  const request = await req.payload.findByID({
    collection: 'data-requests',
    id: dataRequestId,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
  if (!request) return done(0, 'not-found')
  const complaint = COMPLAINT_TYPES.includes(request.type as RequestType)
  if (complaint !== (automation === 'O7')) return done(0, 'other-kind')
  if (request.status === 'closed') return done(0, 'closed')
  const received = instant(request.receivedAt)
  const acknowledgeBy = instant(request.acknowledgeBy)
  const resolveBy = instant(request.resolveBy)
  if (!received || !acknowledgeBy || !resolveBy) return done(0, 'no-clocks')
  const subject = { collection: 'data-requests' as const, id: request.id }

  const messages: Parameters<typeof plan>[1][] = []
  const personId = idOf(request.person)
  if (personId !== null) {
    messages.push({
      automation,
      template: complaint ? 'complaint-ack' : 'data-request-ack',
      channel: 'email',
      recipient: { kind: 'person', id: Number(personId) },
      subject,
      sendAt: now,
      sendBefore: resolveBy,
    })
  }
  const steps = dueSteps(reminderTimes(automation, { received, acknowledgeBy, resolveBy }), now)
  for (const staffId of await requestKeepers(req, request.assignee)) {
    for (const { step, at, before } of steps) {
      if (at.getTime() >= before.getTime()) continue
      messages.push({
        automation,
        template: 'privacy-deadline',
        channel: 'email',
        recipient: { kind: 'staff', id: staffId },
        subject,
        variant: `${step satisfies ReminderStep}-u${staffId}`,
        sendAt: at.getTime() > now.getTime() ? at : now,
        sendBefore: before,
      })
    }
  }
  return outcomeOf(await planAll(req, messages))
}

/**
 * The reminders still worth planning: those to come, and of those already past (a request recorded
 * late), the latest only, so a late record brings one reminder now rather than a burst.
 */
export function dueSteps<T extends { at: Date }>(steps: readonly T[], now: Date): T[] {
  const past = steps.filter((entry) => entry.at.getTime() <= now.getTime())
  const latestPast = past.at(-1)
  return steps.filter(
    (entry) =>
      entry.at.getTime() > now.getTime() || (latestPast !== undefined && entry === latestPast),
  )
}

export const runO4 = (req: PayloadRequest, input: unknown, now: Date) =>
  runRequest('O4', req, input, now)

export const runO7 = (req: PayloadRequest, input: unknown, now: Date) =>
  runRequest('O7', req, input, now)

const HOUR = 3_600_000

/** O8 · the breach register's timers, to every active owner. */
export async function runO8(req: PayloadRequest, input: unknown, now: Date): Promise<Outcome> {
  const { incidentId } = IncidentEvent.parse(input)
  const incident = await req.payload.findByID({
    collection: 'incidents',
    id: incidentId,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
  if (!incident) return done(0, 'not-found')
  if (incident.status === 'closed') return done(0, 'closed')
  const detected = instant(incident.detectedAt)
  if (!detected) return done(0, 'no-clocks')
  const owners = await staffWith(req, ['owner'])
  if (!owners.length) return done(0, 'no-recipients')
  const messages: Parameters<typeof plan>[1][] = []
  for (const ownerId of owners) {
    for (const { step, hours } of INCIDENT_STEPS) {
      const at = new Date(detected.getTime() + hours * HOUR)
      // The opening alert always goes, with every clock's state as it is; a step whose time
      // passed before the incident was recorded is said there, not sent on its own.
      if (step !== 'opened' && at.getTime() <= now.getTime()) continue
      messages.push({
        automation: 'O8' satisfies AutomationId,
        template: 'incident-alert',
        channel: 'email',
        recipient: { kind: 'staff', id: ownerId },
        subject: { collection: 'incidents', id: incident.id },
        variant: `${step}-u${ownerId}`,
        sendAt: at.getTime() > now.getTime() ? at : now,
      })
    }
  }
  return outcomeOf(await planAll(req, messages))
}

/** C5 · the certificate email to its holder, once. */
export async function runC5(req: PayloadRequest, input: unknown, now: Date): Promise<Outcome> {
  const { certificateId } = CertificateEvent.parse(input)
  const certificate = await req.payload.findByID({
    collection: 'certificates',
    id: certificateId,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    select: { status: true, person: true },
    req,
  })
  if (!certificate) return done(0, 'not-found')
  if (certificate.status !== 'valid') return done(0, 'revoked')
  const personId = idOf(certificate.person)
  if (personId === null) return done(0, 'no-person')
  return outcomeOf(
    await planAll(req, [
      {
        automation: 'C5',
        template: 'certificate-issued',
        channel: 'email',
        recipient: { kind: 'person', id: Number(personId) },
        subject: { collection: 'certificates', id: certificate.id },
        sendAt: now,
      },
    ]),
  )
}
