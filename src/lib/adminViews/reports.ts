import 'server-only'

import type { PayloadRequest } from 'payload'

import { EVENT_NAMES } from '@/lib/analytics/events'
import { formatPaise } from '@/lib/office/copy'
import { err, ok, type Result } from '@/lib/result'
import { istDay } from '@/lib/time/ist'

import {
  REPORT_FIGURES,
  reportQuery,
  type ReportFigure,
  type ReportKey,
  type ViewError,
} from './contract'
import { asUser, idOf, median, monthOf, periodRange, refused } from './shared'

/**
 * Reports (docs/05, Reports; docs/18 §7): each figure the plan names, with its definition, the
 * period, what was counted over what, the working in words and a link to the records. A figure
 * whose inputs are not built says what it waits on and is never drawn as zero. Owners only
 * (`viewRefusal(user, 'reports')`, asked first); every read is with the owner's own access.
 * Nothing from a session note, a Map answer or a message reaches a figure. Money is integer paise.
 */

const LABELS: Record<ReportKey, { label: string; definition: string }> = {
  crossPathRate: {
    label: 'Cross-path rate',
    definition:
      'Of the people with a confirmed booking in the period, how many have confirmed bookings in two or more applications (consultancy, education, counselling) up to the period’s end.',
  },
  courseEnrolmentsPerMonth: {
    label: 'Course enrolments',
    definition: 'Enrolments in the certification course in the period.',
  },
  infoSessionToEnrolment: {
    label: 'Info session to enrolment',
    definition: 'Of the people who attended an info session, how many enrolled.',
  },
  proposalCallsPerMonth: {
    label: 'Proposal calls',
    definition: 'Confirmed proposal calls whose time falls in the period.',
  },
  teamMapToProposal: {
    label: 'Team Map request to proposal',
    definition:
      'Of the Team Map requests received in the period, how many have been sent a proposal since.',
  },
  counsellingSessionsPerMonth: {
    label: 'Counselling sessions',
    definition: 'Confirmed counselling sessions whose time falls in the period.',
  },
  counsellingReturnRate: {
    label: 'Counselling return rate',
    definition:
      'Of the people with a counselling session in the period, how many had a counselling session before the period began.',
  },
  mapCompletion: { label: 'Map completion', definition: 'Maps completed of Maps started.' },
  mapToBooking: { label: 'Map to booking', definition: 'Completed Maps followed by a booking.' },
  revenueByApplication: {
    label: 'Revenue by application',
    definition:
      'Payments captured in the period less refunds processed in the period, by the application of the booking’s service.',
  },
  noShowRate: {
    label: 'No-show rate',
    definition:
      'Of the bookings in the period whose attendance was marked, how many were marked as a no-show.',
  },
  leadResponseTime: {
    label: 'Lead response time',
    definition:
      'The median hours from a lead’s arrival to the first time someone on the staff acted on it, for leads received in the period.',
  },
  messageDelivery: {
    label: 'Message delivery',
    definition:
      'Of the messages to people that left in the period, how many their provider reported delivered, with the bounces, the complaints and the sends that never had an answer, by channel (the messages log, as the weekly report counts it).',
  },
  funnel: {
    label: 'Booking funnel',
    definition:
      'The platform’s own events in the period: bookings started and confirmed, with the steps between (no person is identified).',
  },
}

/**
 * Parts of the health strip that wait on later milestones (docs/05, Reports). Email and WhatsApp
 * delivery are a figure of their own now, from the messages log (`messageDelivery`).
 */
export const HEALTH_WAITS_ON = [{ part: 'Uptime', on: 'M7 (monitoring)' }] as const

/** The states of a message that left for a person, and what became of it. */
const LEFT = ['sent', 'delivered', 'read', 'bounced', 'complained', 'unknown'] as const
const REACHED: readonly string[] = ['delivered', 'read']

const CHANNEL_LABELS: Record<string, string> = { email: 'Email', whatsapp: 'WhatsApp' }

/** The delivery counts of one channel, as a line of the figure's table. */
export function deliveryLine(statuses: readonly string[]): string {
  const of = (status: string) => statuses.filter((each) => each === status).length
  const reached = statuses.filter((status) => REACHED.includes(status)).length
  return `${reached} of ${statuses.length} delivered (${percent(reached, statuses.length)}); ${of('bounced')} bounced, ${of('complained')} marked as spam, ${of('unknown')} with no answer`
}

/** The longest period one report covers: a year and a day. */
const MAX_DAYS = 366

/** The period from the view's query: the current month in India by default. */
export function readPeriod(
  query: unknown,
  now: Date,
): Result<{ from: string; to: string }, ViewError> {
  const parsed = reportQuery.safeParse(query ?? {})
  if (!parsed.success) {
    return err({ code: 'invalid', issues: parsed.error.issues.map((issue) => issue.message) })
  }
  const month = monthOf(istDay(now))
  const from = parsed.data.from ?? month.from
  const to = parsed.data.to ?? (parsed.data.from ? from : month.to)
  if (from > to) return err({ code: 'invalid', issues: ['The period ends before it starts.'] })
  const days = (Date.parse(to) - Date.parse(from)) / (24 * 60 * 60 * 1000) + 1
  if (days > MAX_DAYS)
    return err({ code: 'invalid', issues: ['Choose a period of a year or less.'] })
  return ok({ from, to })
}

const percent = (numerator: number, denominator: number) =>
  denominator === 0 ? 'no one to count' : `${Math.round((numerator / denominator) * 100)}%`

type BookingRow = {
  id: number
  person: number | null
  register: string | null
  type: string
  status: string
  startsAt: string | null
}

/** Whether an instant falls in the period's range. */
const within = (value: string | null | undefined, range: { gte: string; lt: string }) =>
  Boolean(value) &&
  new Date(value as string).getTime() >= new Date(range.gte).getTime() &&
  new Date(value as string).getTime() < new Date(range.lt).getTime()

const CONFIRMED = ['confirmed', 'completed', 'noShow']

/** Pure: the booking figures from the bookings up to the period's end. */
export function bookingFigures(
  rows: BookingRow[],
  range: { gte: string; lt: string },
): {
  crossPath: { numerator: number; denominator: number }
  calls: number
  sessions: number
  returning: { numerator: number; denominator: number }
  noShow: { numerator: number; denominator: number }
} {
  const confirmed = rows.filter((row) => CONFIRMED.includes(row.status))
  const inPeriod = confirmed.filter((row) => within(row.startsAt, range))
  const registersOf = new Map<number, Set<string>>()
  for (const row of confirmed) {
    if (row.person === null || !row.register) continue
    const set = registersOf.get(row.person) ?? new Set<string>()
    set.add(row.register)
    registersOf.set(row.person, set)
  }
  const peopleInPeriod = new Set(inPeriod.map((row) => row.person).filter((id) => id !== null))
  const crossed = [...peopleInPeriod].filter((id) => (registersOf.get(id)?.size ?? 0) >= 2)

  const counselling = (row: BookingRow) => row.register === 'counselling' && row.type === 'session'
  const sessions = inPeriod.filter(counselling)
  const sessionPeople = new Set(sessions.map((row) => row.person).filter((id) => id !== null))
  const before = new Set(
    confirmed
      .filter(
        (row) =>
          counselling(row) &&
          row.startsAt &&
          new Date(row.startsAt).getTime() < new Date(range.gte).getTime(),
      )
      .map((row) => row.person),
  )
  const marked = inPeriod.filter((row) => row.status === 'completed' || row.status === 'noShow')
  return {
    crossPath: { numerator: crossed.length, denominator: peopleInPeriod.size },
    calls: inPeriod.filter((row) => row.type === 'call').length,
    sessions: sessions.length,
    returning: {
      numerator: [...sessionPeople].filter((id) => before.has(id)).length,
      denominator: sessionPeople.size,
    },
    noShow: {
      numerator: marked.filter((row) => row.status === 'noShow').length,
      denominator: marked.length,
    },
  }
}

/** Pure: captured payments less processed refunds, by application, in integer paise. */
export function revenueBy(
  payments: { amountPaise: number; register: string | null }[],
  refunds: { amountPaise: number; register: string | null }[],
): { total: number; byRegister: Record<string, number> } {
  const byRegister: Record<string, number> = { consultancy: 0, education: 0, counselling: 0 }
  const add = (register: string | null, paise: number) => {
    const key = register ?? 'unknown'
    byRegister[key] = (byRegister[key] ?? 0) + paise
  }
  for (const payment of payments) add(payment.register, payment.amountPaise)
  for (const refund of refunds) add(refund.register, -refund.amountPaise)
  const total = Object.values(byRegister).reduce((sum, value) => sum + value, 0)
  return { total, byRegister }
}

const REGISTER_LABELS: Record<string, string> = {
  consultancy: 'Consultancy',
  education: 'Education',
  counselling: 'Counselling',
  unknown: 'No application recorded',
}

function figure(
  key: ReportKey,
  period: { from: string; to: string },
  value: ReportFigure['value'],
  working: string,
  href: string | null,
  table?: ReportFigure['table'],
): ReportFigure {
  return {
    key,
    ...LABELS[key],
    period,
    value,
    working,
    href,
    waitsOn: null,
    ...(table ? { table } : {}),
  }
}

export async function loadReports(
  req: PayloadRequest,
  query: unknown,
  now: Date = new Date(),
): Promise<Result<ReportFigure[], ViewError>> {
  const refusal = refused(req, 'reports')
  if (refusal) return refusal
  const read = readPeriod(query, now)
  if (!read.ok) return read
  const period = read.value
  const range = periodRange(period.from, period.to)
  const admin = req.payload.config.routes.admin
  const user = asUser(req)

  const services = await req.payload.find({
    collection: 'services',
    pagination: false,
    depth: 0,
    select: { register: true },
    ...user,
  })
  const registerOf = new Map(services.docs.map((doc) => [doc.id, doc.register ?? null]))

  const bookings = await req.payload.find({
    collection: 'bookings',
    where: { startsAt: { less_than: range.lt } },
    pagination: false,
    depth: 0,
    select: { person: true, service: true, type: true, status: true, startsAt: true },
    ...user,
  })
  const rows: BookingRow[] = bookings.docs.map((doc) => ({
    id: doc.id,
    person: idOf(doc.person),
    register: registerOf.get(idOf(doc.service) ?? -1) ?? null,
    type: doc.type,
    status: doc.status,
    startsAt: doc.startsAt ?? null,
  }))
  const counts = bookingFigures(rows, range)
  const bookingRegister = new Map(rows.map((row) => [row.id, row.register]))

  const payments = await req.payload.find({
    collection: 'payments',
    where: {
      and: [
        { status: { in: ['captured', 'partRefunded', 'refunded'] } },
        { capturedAt: { greater_than_equal: range.gte } },
        { capturedAt: { less_than: range.lt } },
      ],
    },
    pagination: false,
    depth: 0,
    select: { amountPaise: true, booking: true },
    ...user,
  })
  const refunds = await req.payload.find({
    collection: 'refunds',
    where: {
      and: [
        { status: { equals: 'processed' } },
        { processedAt: { greater_than_equal: range.gte } },
        { processedAt: { less_than: range.lt } },
      ],
    },
    pagination: false,
    depth: 0,
    select: { amountPaise: true, booking: true },
    ...user,
  })
  const revenue = revenueBy(
    payments.docs.map((doc) => ({
      amountPaise: doc.amountPaise,
      register: bookingRegister.get(idOf(doc.booking) ?? -1) ?? null,
    })),
    refunds.docs.map((doc) => ({
      amountPaise: doc.amountPaise,
      register: bookingRegister.get(idOf(doc.booking) ?? -1) ?? null,
    })),
  )

  const teamMapLeads = await req.payload.find({
    collection: 'leads',
    where: {
      and: [
        { source: { equals: 'teamMapForm' } },
        { createdAt: { greater_than_equal: range.gte } },
        { createdAt: { less_than: range.lt } },
      ],
    },
    pagination: false,
    depth: 0,
    select: { createdAt: true },
    ...user,
  })
  const leadIds = teamMapLeads.docs.map((doc) => doc.id)
  const proposed = leadIds.length
    ? await req.payload.find({
        collection: 'proposals',
        where: { and: [{ lead: { in: leadIds } }, { status: { not_equals: 'draft' } }] },
        pagination: false,
        depth: 0,
        select: { lead: true },
        ...user,
      })
    : { docs: [] }
  const leadsProposed = new Set(proposed.docs.map((doc) => idOf(doc.lead))).size

  const allLeads = await req.payload.find({
    collection: 'leads',
    where: {
      and: [
        { createdAt: { greater_than_equal: range.gte } },
        { createdAt: { less_than: range.lt } },
      ],
    },
    pagination: false,
    depth: 0,
    select: { createdAt: true, touchedAt: true },
    ...user,
  })
  const responseHours = allLeads.docs
    .filter((doc) => doc.touchedAt)
    .map((doc) => (Date.parse(doc.touchedAt as string) - Date.parse(doc.createdAt)) / 3_600_000)
  const untouched = allLeads.docs.length - responseHours.length
  const medianHours = median(responseHours)

  const events = await req.payload.find({
    collection: 'analytics-events',
    where: { and: [{ at: { greater_than_equal: range.gte } }, { at: { less_than: range.lt } }] },
    pagination: false,
    depth: 0,
    select: { name: true },
    ...user,
  })
  const eventCount = (name: string) => events.docs.filter((doc) => doc.name === name).length

  // What left for people in the period: ids, channels and states only, never a body.
  const messages = await req.payload.find({
    collection: 'messages',
    where: {
      and: [
        { kind: { not_equals: 'internal' } },
        { status: { in: [...LEFT] } },
        { sentAt: { greater_than_equal: range.gte } },
        { sentAt: { less_than: range.lt } },
      ],
    },
    pagination: false,
    depth: 0,
    select: { channel: true, status: true },
    ...user,
  })
  const byChannel = new Map<string, string[]>()
  for (const doc of messages.docs) {
    byChannel.set(doc.channel, [...(byChannel.get(doc.channel) ?? []), doc.status])
  }
  const reachedCount = messages.docs.filter((doc) => REACHED.includes(doc.status)).length
  const started = eventCount('booking_started')
  const confirmedEvents = eventCount('booking_confirmed')

  const bookingsHref = `${admin}/collections/bookings`
  const figures: ReportFigure[] = []
  for (const key of Object.keys(REPORT_FIGURES) as ReportKey[]) {
    const waitsOn = REPORT_FIGURES[key]
    if (waitsOn) {
      figures.push({
        key,
        ...LABELS[key],
        period,
        value: null,
        working: `Not counted yet: this waits on ${waitsOn}.`,
        href: null,
        waitsOn,
      })
      continue
    }
    switch (key) {
      case 'crossPathRate':
        figures.push(
          figure(
            key,
            period,
            { kind: 'rate', ...counts.crossPath },
            `${counts.crossPath.numerator} of ${counts.crossPath.denominator} people with a confirmed booking in the period have bookings in two or more applications (${percent(counts.crossPath.numerator, counts.crossPath.denominator)}).`,
            `${admin}/collections/people`,
          ),
        )
        break
      case 'proposalCallsPerMonth':
        figures.push(
          figure(
            key,
            period,
            { kind: 'count', n: counts.calls },
            `${counts.calls} proposal calls confirmed, attended or marked as a no-show, with a time in the period.`,
            `${bookingsHref}?where[type][equals]=call`,
          ),
        )
        break
      case 'teamMapToProposal':
        figures.push(
          figure(
            key,
            period,
            { kind: 'rate', numerator: leadsProposed, denominator: leadIds.length },
            `${leadsProposed} of ${leadIds.length} Team Map requests received in the period have been sent a proposal (${percent(leadsProposed, leadIds.length)}).`,
            `${admin}/collections/leads?where[source][equals]=teamMapForm`,
          ),
        )
        break
      case 'counsellingSessionsPerMonth':
        figures.push(
          figure(
            key,
            period,
            { kind: 'count', n: counts.sessions },
            `${counts.sessions} counselling sessions confirmed, attended or marked as a no-show, with a time in the period.`,
            `${bookingsHref}?where[type][equals]=session`,
          ),
        )
        break
      case 'counsellingReturnRate':
        figures.push(
          figure(
            key,
            period,
            { kind: 'rate', ...counts.returning },
            `${counts.returning.numerator} of ${counts.returning.denominator} people with a counselling session in the period had one before it began (${percent(counts.returning.numerator, counts.returning.denominator)}).`,
            `${bookingsHref}?where[type][equals]=session`,
          ),
        )
        break
      case 'revenueByApplication':
        figures.push(
          figure(
            key,
            period,
            { kind: 'paise', paise: revenue.total },
            `${payments.docs.length} payments captured and ${refunds.docs.length} refunds processed in the period: ${formatPaise(revenue.total)} in all.`,
            `${admin}/collections/payments?where[status][equals]=captured`,
            Object.entries(revenue.byRegister)
              .filter(([register, paise]) => register !== 'unknown' || paise !== 0)
              .map(([register, paise]) => ({
                label: REGISTER_LABELS[register] ?? register,
                value: formatPaise(paise),
              })),
          ),
        )
        break
      case 'noShowRate':
        figures.push(
          figure(
            key,
            period,
            { kind: 'rate', ...counts.noShow },
            `${counts.noShow.numerator} of ${counts.noShow.denominator} bookings in the period with attendance marked were no-shows (${percent(counts.noShow.numerator, counts.noShow.denominator)}).`,
            `${bookingsHref}?where[status][equals]=noShow`,
          ),
        )
        break
      case 'leadResponseTime':
        figures.push(
          figure(
            key,
            period,
            medianHours === null ? null : { kind: 'hours', median: medianHours },
            medianHours === null
              ? `No lead received in the period has been acted on yet (${allLeads.docs.length} received).`
              : `The median of ${responseHours.length} leads acted on is ${Math.round(medianHours * 10) / 10} hours; ${untouched} received in the period are not acted on yet.`,
            `${admin}/collections/leads`,
          ),
        )
        break
      case 'messageDelivery':
        figures.push(
          figure(
            key,
            period,
            { kind: 'rate', numerator: reachedCount, denominator: messages.docs.length },
            `${reachedCount} of ${messages.docs.length} messages that left for people in the period were reported delivered (${percent(reachedCount, messages.docs.length)}).`,
            `${admin}/collections/messages`,
            [...byChannel.entries()].map(([channel, statuses]) => ({
              label: CHANNEL_LABELS[channel] ?? channel,
              value: deliveryLine(statuses),
            })),
          ),
        )
        break
      case 'funnel':
        figures.push(
          figure(
            key,
            period,
            { kind: 'rate', numerator: confirmedEvents, denominator: started },
            `${started} bookings started and ${confirmedEvents} confirmed in the period (${percent(confirmedEvents, started)}).`,
            `${admin}/collections/analytics-events`,
            EVENT_NAMES.map((entry) => ({
              label: entry.label,
              value: String(eventCount(entry.value)),
            })),
          ),
        )
        break
    }
  }
  return ok(figures)
}
