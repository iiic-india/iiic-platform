import 'server-only'

import type { PayloadRequest, Where } from 'payload'

import { incidentClockStates, requestClocks } from '@/lib/privacy/breachClocks'
import type { ClockState } from '@/lib/privacy/breaches'
import { REQUEST_TYPES } from '@/lib/privacy/requests'
import { ok, type Result } from '@/lib/result'
import { istDay } from '@/lib/time/ist'

import type { AgedItem, ScheduleItem, TodayData, ViewError } from './contract'
import {
  addDays,
  asUser,
  dayStart,
  hoursBetween,
  idOf,
  isOffice,
  listHref,
  refused,
  scheduleItem,
  settle,
  type BookingLine,
} from './shared'

/**
 * Today (docs/05, Today; docs/18 §6): the operator's morning screen. Asks `viewRefusal(user,
 * 'today')` first. The schedule is read with the user's own access, so a practitioner sees their
 * own bookings and nobody else's; the other panels are the office's, and their counts are read
 * past the collections' rules (an operator counts invoices waiting, never reads one). No note,
 * Map answer, message body or feedback comment is read here.
 */

/** The bookings a day's schedule holds: what is happening, or happened, at a time. */
export const SCHEDULED = ['confirmed', 'completed', 'noShow'] as const

/** What a practitioner's Today leaves to the office (docs/05: "practitioners see their schedule"). */
const NOT_SHOWN = { state: 'not-shown' } as const

/** The parts of the day not built yet (docs/18 §10, C). */
export const TODAY_WAITS_ON = [
  { part: 'Messages people sent, and replies waiting', on: 'M6 (messages)' },
  { part: 'Messages that failed to send', on: 'M6 (messages)' },
  { part: 'The daily digest by email', on: 'M6 (O1)' },
] as const

/** The clock to show first for an open incident: the earliest that is still running or late. */
export function firstOpenClock(clocks: ClockState[]): { dueAt: Date; hoursLeft: number } | null {
  const open = clocks
    .map((clock) =>
      clock.state === 'running'
        ? { dueAt: clock.dueAt, hoursLeft: clock.hoursLeft }
        : clock.state === 'overdue'
          ? { dueAt: clock.dueAt, hoursLeft: -clock.hoursLate }
          : null,
    )
    .filter((clock): clock is { dueAt: Date; hoursLeft: number } => clock !== null)
  open.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
  return open[0] ?? null
}

async function schedule(req: PayloadRequest, day: string): Promise<ScheduleItem[]> {
  const { docs } = await req.payload.find({
    collection: 'bookings',
    where: {
      and: [
        { startsAt: { greater_than_equal: dayStart(day).toISOString() } },
        { startsAt: { less_than: dayStart(addDays(day, 1)).toISOString() } },
        { status: { in: [...SCHEDULED] } },
      ],
    },
    sort: 'startsAt',
    limit: 200,
    depth: 1,
    ...asUser(req),
  })
  const people = [...new Set(docs.map((doc) => idOf(doc.person)).filter((id) => id !== null))]
  // Whether each client has been here before, as far as this user may see: a practitioner's
  // "first time" is a first session with them.
  const earlier = people.length
    ? await req.payload.find({
        collection: 'bookings',
        where: {
          and: [
            { person: { in: people } },
            { startsAt: { less_than: dayStart(day).toISOString() } },
            { status: { in: ['confirmed', 'completed'] } },
          ],
        },
        limit: 1000,
        depth: 0,
        select: { person: true },
        ...asUser(req),
      })
    : { docs: [] }
  const returning = new Set(earlier.docs.map((doc) => idOf(doc.person)))
  return docs.map((doc) =>
    scheduleItem(doc as unknown as BookingLine, !returning.has(idOf(doc.person))),
  )
}

async function needsReply(req: PayloadRequest, now: Date): Promise<AgedItem[]> {
  const admin = req.payload.config.routes.admin
  const requests = await req.payload.find({
    collection: 'bookings',
    where: { status: { equals: 'requested' } },
    sort: 'createdAt',
    limit: 50,
    depth: 0,
    select: { reference: true, createdAt: true },
    ...asUser(req),
  })
  const leads = await req.payload.find({
    collection: 'leads',
    where: { stage: { equals: 'new' } },
    sort: 'createdAt',
    limit: 50,
    depth: 0,
    select: { title: true, kind: true, createdAt: true },
    ...asUser(req),
  })
  return [
    ...requests.docs.map((doc) => ({
      id: doc.id,
      label: `Time request ${doc.reference}`,
      href: `${admin}/collections/bookings/${doc.id}/office`,
      receivedAt: doc.createdAt,
      ageHours: hoursBetween(doc.createdAt, now),
    })),
    ...leads.docs.map((doc) => ({
      id: doc.id,
      label: `${doc.kind === 'partnership' ? 'Partnership enquiry' : 'New lead'}: ${doc.title ?? doc.id}`,
      href: `${admin}/collections/leads/${doc.id}`,
      receivedAt: doc.createdAt,
      ageHours: hoursBetween(doc.createdAt, now),
    })),
  ].sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime())
}

type Count = { kind: string; count: number; href: string }

/** A count read past the collections' rules: for the office only, and a number, never a record. */
async function countOf(
  req: PayloadRequest,
  collection: Parameters<PayloadRequest['payload']['count']>[0]['collection'],
  where: Where,
): Promise<number> {
  const { totalDocs } = await req.payload.count({ collection, where, overrideAccess: true, req })
  return totalDocs
}

async function money(req: PayloadRequest, now: Date): Promise<Count[]> {
  const admin = req.payload.config.routes.admin
  const week = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  return [
    {
      kind: 'Held times waiting for payment',
      count: await countOf(req, 'bookings', { status: { in: ['held', 'pendingPayment'] } }),
      href: listHref(admin, 'bookings', { status: 'held' }),
    },
    {
      kind: 'Payments that failed this week',
      count: await countOf(req, 'payments', {
        and: [{ status: { equals: 'failed' } }, { updatedAt: { greater_than_equal: week } }],
      }),
      href: listHref(admin, 'payments', { status: 'failed' }),
    },
    {
      kind: 'Refunds waiting for an owner',
      count: await countOf(req, 'refunds', { status: { equals: 'awaitingApproval' } }),
      href: listHref(admin, 'refunds', { status: 'awaitingApproval' }),
    },
    {
      kind: 'Refunds that failed',
      count: await countOf(req, 'refunds', { status: { equals: 'failed' } }),
      href: listHref(admin, 'refunds', { status: 'failed' }),
    },
    {
      kind: 'Invoices not yet issued',
      count: await countOf(req, 'invoices', { status: { in: ['pending', 'failed'] } }),
      href: listHref(admin, 'invoices', { status: 'pending' }),
    },
  ]
}

async function proof(req: PayloadRequest, now: Date): Promise<Count[]> {
  const admin = req.payload.config.routes.admin
  const week = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  return [
    {
      kind: 'New feedback',
      count: await countOf(req, 'feedback', { status: { equals: 'new' } }),
      href: `${admin}/proof`,
    },
    {
      kind: 'Reviews waiting for a step',
      count: await countOf(req, 'testimonials', {
        status: { in: ['received', 'screened', 'consentRequested', 'approved'] },
      }),
      href: `${admin}/proof`,
    },
    {
      kind: 'Case studies waiting for approval or publishing',
      count: await countOf(req, 'case-studies', {
        status: { in: ['awaitingApproval', 'approved'] },
      }),
      href: `${admin}/proof`,
    },
    {
      kind: 'Consents withdrawn this week',
      count: await countOf(req, 'consents', {
        and: [{ withdraws: { exists: true } }, { withdrawnAt: { greater_than_equal: week } }],
      }),
      href: `${admin}/privacy?kind=withdrawn`,
    },
  ]
}

type PrivacyRow = { id: number; label: string; href: string; dueAt: string; hoursLeft: number }

async function privacy(req: PayloadRequest, now: Date): Promise<PrivacyRow[]> {
  const admin = req.payload.config.routes.admin
  const requests = await req.payload.find({
    collection: 'data-requests',
    where: { status: { not_equals: 'closed' } },
    sort: 'resolveBy',
    limit: 50,
    depth: 0,
    select: {
      type: true,
      acknowledgeBy: true,
      resolveBy: true,
      acknowledgedAt: true,
      resolution: true,
    },
    ...asUser(req),
  })
  const incidents = await req.payload.find({
    collection: 'incidents',
    where: { status: { not_equals: 'closed' } },
    sort: 'detectedAt',
    limit: 50,
    depth: 0,
    select: { title: true, personalData: true, certIn: true, board: true, status: true },
    ...asUser(req),
  })
  const label = (type: string) => REQUEST_TYPES.find((entry) => entry.value === type)?.label ?? type
  const rows = [
    ...requests.docs.flatMap((doc) => {
      const { acknowledge, resolve } = requestClocks(doc, now)
      const clock = firstOpenClock([acknowledge, resolve])
      return clock
        ? [
            {
              id: doc.id,
              label: `Privacy request: ${label(doc.type)}`,
              href: `${admin}/collections/data-requests/${doc.id}`,
              dueAt: clock.dueAt.toISOString(),
              hoursLeft: clock.hoursLeft,
            },
          ]
        : []
    }),
    ...incidents.docs.flatMap((doc) => {
      const { certIn, board } = incidentClockStates(doc, now)
      const clock = firstOpenClock([certIn, board])
      return clock
        ? [
            {
              id: doc.id,
              label: `Incident: ${doc.title}`,
              href: `${admin}/collections/incidents/${doc.id}`,
              dueAt: clock.dueAt.toISOString(),
              hoursLeft: clock.hoursLeft,
            },
          ]
        : []
    }),
  ]
  return rows.sort((a, b) => a.hoursLeft - b.hoursLeft)
}

async function failures(req: PayloadRequest): Promise<Count[]> {
  const admin = req.payload.config.routes.admin
  return [
    {
      kind: 'Automations that stopped with an error',
      count: await countOf(req, 'payload-jobs', { hasError: { equals: true } }),
      href: listHref(admin, 'payload-jobs', { hasError: 'true' }),
    },
    {
      kind: 'Payment events flagged for the office',
      count: await countOf(req, 'gateway-events', { outcome: { equals: 'flagged' } }),
      href: listHref(admin, 'gateway-events', { outcome: 'flagged' }),
    },
  ]
}

export async function loadToday(
  req: PayloadRequest,
  now: Date = new Date(),
): Promise<Result<TodayData, ViewError>> {
  const refusal = refused(req, 'today')
  if (refusal) return refusal
  const day = istDay(now)
  const office = isOffice(req.user)
  return ok({
    schedule: await settle(() => schedule(req, day)),
    needsReply: office ? await settle(() => needsReply(req, now)) : NOT_SHOWN,
    money: office ? await settle(() => money(req, now)) : NOT_SHOWN,
    proof: office ? await settle(() => proof(req, now)) : NOT_SHOWN,
    privacy: office ? await settle(() => privacy(req, now)) : NOT_SHOWN,
    failures: office ? await settle(() => failures(req)) : NOT_SHOWN,
    waitsOn: office ? TODAY_WAITS_ON.map((entry) => ({ ...entry })) : [],
  })
}
