import type { PayloadRequest } from 'payload'
import { z } from 'zod'

import { incidentClockStates } from '@/lib/privacy/breachClocks'
import { idOf } from '@/lib/privacy/consentLedger'
import { COMPLAINT_TYPES, REQUEST_TYPES, type RequestType } from '@/lib/privacy/requests'
import { err, ok, type Result } from '@/lib/result'
import { formatIstDate, formatIstTime } from '@/lib/time/ist'
import type { DataRequest, Incident, Person } from '@/payload-types'

import { Frame } from '../components/Frame'
import { Button } from '../components/parts'
import type { LoadError, TemplateImplementation } from '../types'
import { Para, Quote, siteLink } from './text'

/**
 * The privacy messages (docs/06 O4, O7, O8; docs/08 §3, §4; docs/18 §5). To the person: the
 * acknowledgement of a privacy request (O4), and of a complaint or grievance with a copy of it as
 * recorded (O7, the E-Commerce Rules from 1 January 2027). To staff: the request's reminders
 * before its deadlines (O4, O7), and the breach register's timers for CERT-In's 6 hours and the
 * Board's 72 (O8). Each reads its record when it is sent: a request already closed, a reminder
 * whose step is done, or an incident's clock that is met or does not apply sends nothing.
 *
 * Internal mail carries the kind, the dates and the link to the record, never the person's name,
 * the summary or an incident's description. Copy status: every line is a candidate written to
 * src/brand/VOICE.md, awaiting IIIC's approval and the lawyer's (I-41, I-22).
 */

const DATE = (value: unknown): Date | null => {
  if (typeof value !== 'string' && !(value instanceof Date)) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** A day and time in India, as the messages write them: "4 January 2030, 3 PM". */
const when = (at: Date) => `${formatIstDate(at)}, ${formatIstTime(at)}`

/** What the person asked for, in their terms (REQUEST_TYPES labels are the office's). */
export const ASKED_FOR: Readonly<Record<RequestType, string>> = {
  access: 'a copy of the data IIIC holds about you',
  correction: 'a correction to your data',
  erasure: 'the erasure of your data',
  withdrawal: 'the withdrawal of your consent',
  nomination: 'a nomination',
  consumerComplaint: 'your complaint',
  privacyGrievance: 'your grievance',
}

async function requestById(req: PayloadRequest, id: number): Promise<DataRequest | null> {
  return (await req.payload.findByID({
    collection: 'data-requests',
    id,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })) as DataRequest | null
}

async function firstNameOf(req: PayloadRequest, person: unknown): Promise<string> {
  const id = idOf(person)
  if (id === null) return ''
  const found = (await req.payload.findByID({
    collection: 'people',
    id: Number(id),
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    select: { fullName: true },
    req,
  })) as Pick<Person, 'fullName'> | null
  return found?.fullName?.trim().split(/\s+/)[0] ?? ''
}

const isComplaint = (type: unknown) => COMPLAINT_TYPES.includes(type as RequestType)

// ---- O4, O7 · the acknowledgements ----

const AckData = z.object({
  firstName: z.string(),
  askedFor: z.string().min(1),
  receivedOn: z.string().min(1),
  replyBy: z.string().min(1),
  /** O7: the complaint as recorded, sent back to the person (docs/08 §1, from 1 January 2027). */
  asRecorded: z.string().nullable(),
})
type AckData = z.infer<typeof AckData>

/**
 * The acknowledgement's data: the request of the right family (a complaint for O7, any other kind
 * for O4) and its person. `stale` once the request is closed; nothing is acknowledged after the
 * answer.
 */
export async function loadRequestAck(
  req: PayloadRequest,
  requestId: number,
  complaint: boolean,
): Promise<Result<AckData, LoadError>> {
  const request = await requestById(req, requestId)
  if (!request || isComplaint(request.type) !== complaint) return err({ code: 'not-found' })
  if (request.status === 'closed') return err({ code: 'stale' })
  const received = DATE(request.receivedAt)
  const resolveBy = DATE(request.resolveBy)
  if (!received || !resolveBy) return err({ code: 'not-found' })
  const parsed = AckData.safeParse({
    firstName: await firstNameOf(req, request.person),
    askedFor: ASKED_FOR[request.type as RequestType],
    receivedOn: formatIstDate(received),
    replyBy: formatIstDate(resolveBy),
    asRecorded: complaint ? (request.summary?.trim() ?? '') || null : null,
  })
  if (!parsed.success) return err({ code: 'not-found' })
  // A complaint's acknowledgement exists to carry its copy: without one it is not sent.
  if (complaint && !parsed.data.asRecorded) return err({ code: 'not-found' })
  return ok(parsed.data)
}

const greeting = (data: { firstName: string }) =>
  data.firstName ? `Hello ${data.firstName},` : 'Hello,'

export const dataRequestAck: TemplateImplementation<AckData> = {
  load: (req, { subject }) => loadRequestAck(req, subject.id, false),
  email: {
    key: 'data-request-ack',
    schema: AckData,
    subject: () => 'We have received your request',
    preheader: (data) => `IIIC will reply by ${data.replyBy}.`,
    element: (data, context) => (
      <Frame
        preheader={`IIIC will reply by ${data.replyBy}.`}
        heading="We have received your request"
        footer={context.footer}
        assetUrl={context.assetUrl}
      >
        <Para>{greeting(data)}</Para>
        <Para>
          Your request for {data.askedFor} reached IIIC on {data.receivedOn}. We will reply by{' '}
          {data.replyBy}.
        </Para>
        <Para>
          Before we act on it, we may ask you to confirm that the request is yours, so that nobody
          else can see or change your data.
        </Para>
      </Frame>
    ),
  },
}

export const complaintAck: TemplateImplementation<AckData> = {
  load: (req, { subject }) => loadRequestAck(req, subject.id, true),
  email: {
    key: 'complaint-ack',
    schema: AckData,
    // The complaint as recorded is the person's own words (D-111).
    quoted: (data) => (data.asRecorded ? [data.asRecorded] : []),
    subject: (data) => `We have received ${data.askedFor}`,
    preheader: (data) => `IIIC will reply by ${data.replyBy}. A copy of it is inside.`,
    element: (data, context) => (
      <Frame
        preheader={`IIIC will reply by ${data.replyBy}. A copy of it is inside.`}
        heading={`We have received ${data.askedFor}`}
        footer={context.footer}
        assetUrl={context.assetUrl}
      >
        <Para>{greeting(data)}</Para>
        <Para>
          {data.askedFor.charAt(0).toUpperCase() + data.askedFor.slice(1)} reached IIIC on{' '}
          {data.receivedOn}. We will reply by {data.replyBy}.
        </Para>
        <Para>This is how we recorded it:</Para>
        <Quote>{data.asRecorded ?? ''}</Quote>
        <Para>If anything in it is not what you meant, reply to this email and say so.</Para>
      </Frame>
    ),
  },
}

// ---- O4, O7 · the reminders to staff ----

/** The reminders' steps (docs/06 O4: at 50% and 80% of the deadline; O7: before each mark). */
export const REMINDER_STEPS = ['p50', 'p80', 'acknowledge', 'resolve'] as const
export type ReminderStep = (typeof REMINDER_STEPS)[number]

const DeadlineData = z.object({
  kind: z.string().min(1),
  receivedAt: z.string().min(1),
  dueLabel: z.string().min(1),
  dueAt: z.string().min(1),
  recordPath: z.string().startsWith('/admin/'),
})
type DeadlineData = z.infer<typeof DeadlineData>

/** The step a reminder message is for, from its variant (`<step>-u<staff id>`). */
export function stepOf(variant: string | null | undefined): ReminderStep | null {
  const step = variant?.split('-u')[0]
  return (REMINDER_STEPS as readonly string[]).includes(step ?? '') ? (step as ReminderStep) : null
}

/**
 * A reminder's data, read when it is due: `stale` once the request is closed, and for the
 * acknowledgement's reminder once the request has been acknowledged.
 */
export async function loadDeadline(
  req: PayloadRequest,
  requestId: number,
  step: ReminderStep | null,
): Promise<Result<DeadlineData, LoadError>> {
  const request = await requestById(req, requestId)
  if (!request || !step) return err({ code: 'not-found' })
  if (request.status === 'closed') return err({ code: 'stale' })
  if (step === 'acknowledge' && request.status !== 'received') return err({ code: 'stale' })
  const received = DATE(request.receivedAt)
  const due = DATE(step === 'acknowledge' ? request.acknowledgeBy : request.resolveBy)
  if (!received || !due) return err({ code: 'not-found' })
  const kind = REQUEST_TYPES.find((entry) => entry.value === request.type)?.label ?? 'Request'
  return ok({
    kind,
    receivedAt: when(received),
    dueLabel: step === 'acknowledge' ? 'Acknowledge by' : 'Resolve by',
    dueAt: when(due),
    recordPath: `/admin/collections/data-requests/${request.id}`,
  })
}

export const privacyDeadline: TemplateImplementation<DeadlineData> = {
  // The step travels in the message's variant, which the core passes to `load`.
  load: (req, { subject, variant }) => loadDeadline(req, subject.id, stepOf(variant)),
  email: {
    key: 'privacy-deadline',
    schema: DeadlineData,
    subject: (data) => `${data.kind}: ${data.dueLabel.toLowerCase()} ${data.dueAt}`,
    preheader: () => 'Open the request in the admin.',
    element: (data, context) => (
      <Frame
        preheader="Open the request in the admin."
        eyebrow="Privacy"
        heading={`${data.dueLabel} ${data.dueAt}`}
        footer={context.footer}
        assetUrl={context.assetUrl}
      >
        <Para>
          {data.kind}, received {data.receivedAt}. {data.dueLabel} {data.dueAt}.
        </Para>
        <Button href={siteLink(context.siteUrl, data.recordPath)}>Open the request</Button>
      </Frame>
    ),
  },
}

// ---- O8 · the breach register's timers ----

/** O8's steps from the time the incident was detected (docs/06: at once, 4, 6, 48 and 72 hours). */
export const INCIDENT_STEPS = [
  { step: 'opened', hours: 0, clock: null },
  { step: 'certIn4h', hours: 4, clock: 'certIn' },
  { step: 'certIn6h', hours: 6, clock: 'certIn' },
  { step: 'board48h', hours: 48, clock: 'board' },
  { step: 'board72h', hours: 72, clock: 'board' },
] as const
export type IncidentStep = (typeof INCIDENT_STEPS)[number]['step']

const IncidentData = z.object({
  heading: z.string().min(1),
  detectedAt: z.string().min(1),
  lines: z.array(z.string()),
  recordPath: z.string().startsWith('/admin/'),
})
type IncidentData = z.infer<typeof IncidentData>

/** The step an incident alert is for, from its variant (`<step>-u<owner id>`). */
export function incidentStepOf(variant: string | null | undefined): IncidentStep | null {
  const step = variant?.split('-u')[0]
  return INCIDENT_STEPS.some((entry) => entry.step === step) ? (step as IncidentStep) : null
}

const clockLine = (name: string, state: ReturnType<typeof incidentClockStates>['certIn']) => {
  if (state.state === 'running') return `${name}: due ${when(state.dueAt)}.`
  if (state.state === 'overdue') return `${name}: was due ${when(state.dueAt)}.`
  if (state.state === 'done') return `${name}: done ${when(state.at)}.`
  return null
}

/**
 * An alert's data, read when it is due: `stale` once the incident is closed, and for a clock's
 * step once that clock is met or does not apply (the CERT-In box not ticked, no personal data
 * affected). The opening alert always goes while the incident is open.
 */
export async function loadIncidentAlert(
  req: PayloadRequest,
  incidentId: number,
  step: IncidentStep | null,
  now: Date,
): Promise<Result<IncidentData, LoadError>> {
  const incident = (await req.payload.findByID({
    collection: 'incidents',
    id: incidentId,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })) as Incident | null
  const entry = INCIDENT_STEPS.find((candidate) => candidate.step === step)
  if (!incident || !entry) return err({ code: 'not-found' })
  if (incident.status === 'closed') return err({ code: 'stale' })
  const detected = DATE(incident.detectedAt)
  if (!detected) return err({ code: 'not-found' })
  const clocks = incidentClockStates(incident, now)
  if (entry.clock) {
    const state = clocks[entry.clock].state
    if (state !== 'running' && state !== 'overdue') return err({ code: 'stale' })
  }
  const lines = [
    clockLine('CERT-In report', clocks.certIn),
    clockLine('Data Protection Board, detailed report', clocks.board),
  ].filter((line): line is string => Boolean(line))
  const heading =
    entry.clock === 'certIn'
      ? 'CERT-In report: time is running out'
      : entry.clock === 'board'
        ? 'Board report: time is running out'
        : 'An incident was recorded'
  return ok({
    heading,
    detectedAt: when(detected),
    lines: lines.length
      ? lines
      : ['No reporting clock is running: CERT-In is not ticked and no personal data is marked.'],
    recordPath: `/admin/collections/incidents/${incident.id}`,
  })
}

export const incidentAlert: TemplateImplementation<IncidentData> = {
  load: (req, { subject, variant }) =>
    loadIncidentAlert(req, subject.id, incidentStepOf(variant), new Date()),
  email: {
    key: 'incident-alert',
    schema: IncidentData,
    subject: (data) => data.heading,
    preheader: () => 'Open the breach register.',
    element: (data, context) => (
      <Frame
        preheader="Open the breach register."
        eyebrow="Breach register"
        heading={data.heading}
        footer={context.footer}
        assetUrl={context.assetUrl}
      >
        <Para>Detected {data.detectedAt}.</Para>
        {data.lines.map((line) => (
          <Para key={line}>{line}</Para>
        ))}
        <Button href={siteLink(context.siteUrl, data.recordPath)}>Open the incident</Button>
      </Frame>
    ),
  },
}
