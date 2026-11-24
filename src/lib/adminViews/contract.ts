import type { PayloadRequest } from 'payload'
import { z } from 'zod'

import type { ViewRefusal } from '@/access/views'
import { isIstDay } from '@/fields/istDay'
import type { Result } from '@/lib/result'

/**
 * The custom admin views' contract (docs/05, Screens; docs/18 §6). Builder C implements the
 * loaders in src/lib/adminViews/ (today.ts, calendar.ts, reports.ts, search.ts, timeline.ts,
 * proof.ts, settings.ts), all `server-only`, and the views in src/components/admin/views/. Each
 * loader checks `viewRefusal(req.user, view)` first, then reads with the user's own access
 * (`overrideAccess: false, user`), so a role sees only what its collection rules allow; a loader
 * that reads past the rules (the counts on Today, a note's existence) says so and returns counts
 * only. The first view arrives with its data; lists page on the server (docs/05, D-78 rules).
 *
 * Interface: plain and accessible with Payload's own components (lists, forms, buttons that work
 * from the keyboard); drag-and-drop and the D-78 component stack come with the interface pass.
 */

export type ViewError =
  | ({ code: 'refused' } & { refusal: ViewRefusal })
  | { code: 'invalid'; issues: string[] }
  /** A part this view waits on is not built yet (M3's second half, M4, M6, R2). */
  | { code: 'not-built'; waitsOn: string }
  /** No such record, or none this role may read: the same answer for both. */
  | { code: 'not-found' }

/** A part of a view that could not load: drawn as "could not load", never as zero. */
export type Panel<T> =
  | { state: 'ready'; value: T }
  | { state: 'failed' }
  | { state: 'waits-on'; on: string }
  /** Not this role's to see (a practitioner's Today shows their schedule only, docs/05). */
  | { state: 'not-shown' }

// ---- Today (docs/05, Today) ----

export type ScheduleItem = {
  bookingId: number
  reference: string
  startsAt: string
  endsAt: string
  /** The client's name: the office and the booking's own practitioner only. */
  clientName: string
  serviceType: 'session' | 'call' | 'info' | 'seat'
  format: string | null
  joinUrl: string | null
  status: string
  /** Paid, unpaid or free; a practitioner sees no amounts (docs/05). */
  paid: 'paid' | 'unpaid' | 'free'
  firstTime: boolean
  /** R2: whether the client shared their Map with the practitioner. */
  mapShared: boolean | null
}

export type AgedItem = {
  id: number
  label: string
  href: string
  receivedAt: string
  ageHours: number
}

export type TodayData = {
  schedule: Panel<ScheduleItem[]>
  /** New leads and Team Map requests (M4), partnership enquiries (M4), time requests (M3). */
  needsReply: Panel<AgedItem[]>
  /** Held slots, failed payments, refunds awaiting approval, invoices to send (office only). */
  money: Panel<{ kind: string; count: number; href: string }[]>
  /** New feedback, reviews awaiting a step, consent replies, withdrawals (office only). */
  proof: Panel<{ kind: string; count: number; href: string }[]>
  /** Open privacy requests and incidents with time left (office only). */
  privacy: Panel<{ id: number; label: string; href: string; dueAt: string; hoursLeft: number }[]>
  /** Failed jobs, errored webhooks, bounced messages (M6) (office only). */
  failures: Panel<{ kind: string; count: number; href: string }[]>
  /** The parts of the day not built yet, each with what it waits on (docs/18 §10, C). */
  waitsOn: { part: string; on: string }[]
}

export type LoadToday = (req: PayloadRequest, now: Date) => Promise<Result<TodayData, ViewError>>

// ---- Calendar (docs/05, Calendar) ----

export const calendarQuery = z.object({
  view: z.enum(['day', 'week']).default('week'),
  /** The day shown, or the week's first day (Monday), India time. */
  day: z.string().refine(isIstDay, 'Enter the day as YYYY-MM-DD.'),
  practitionerId: z.coerce.number().int().positive().optional(),
})
export type CalendarQuery = z.infer<typeof calendarQuery>

export type CalendarEntry =
  | { kind: 'booking'; item: ScheduleItem; practitionerId: number }
  /** Busy time from the practitioner's own calendar: start and end only (D-22). */
  | { kind: 'busy'; startsAt: string; endsAt: string; practitionerId: number }
  | { kind: 'closed'; day: string; practitionerId: number }

export type CalendarData = {
  query: CalendarQuery
  days: { day: string; entries: CalendarEntry[] }[]
  practitioners: { id: number; name: string }[]
}

export type LoadCalendar = (
  req: PayloadRequest,
  query: unknown,
) => Promise<Result<CalendarData, ViewError>>

// ---- Reports (docs/05, Reports) ----

/**
 * A figure with its working shown: what was counted, over what, for which period, and the query
 * behind it in words; each links to the records behind it. A figure whose inputs are not built
 * yet says what it waits on, and is never drawn as zero.
 */
export type ReportFigure = {
  key: ReportKey
  label: string
  definition: string
  period: { from: string; to: string }
  value:
    | { kind: 'count'; n: number }
    | { kind: 'rate'; numerator: number; denominator: number }
    | { kind: 'paise'; paise: number }
    | { kind: 'hours'; median: number }
    | null
  working: string
  /** The table behind the figure, where it has parts (revenue by application, the funnel). */
  table?: { label: string; value: string }[]
  href: string | null
  waitsOn: string | null
}

/**
 * The plan's figures (docs/05, Reports), and the part each waits on before it has a value.
 * `null`: computable from what M3 and M5 hold.
 */
export const REPORT_FIGURES = {
  crossPathRate: null,
  courseEnrolmentsPerMonth: 'R2 (enrolments)',
  infoSessionToEnrolment: 'R2 (enrolments)',
  proposalCallsPerMonth: null,
  teamMapToProposal: null,
  counsellingSessionsPerMonth: null,
  counsellingReturnRate: null,
  mapCompletion: 'R2 (the Map)',
  mapToBooking: 'R2 (the Map)',
  revenueByApplication: null,
  noShowRate: null,
  leadResponseTime: null,
  funnel: null,
} as const satisfies Record<string, string | null>

export type ReportKey = keyof typeof REPORT_FIGURES

export const reportQuery = z.object({
  /** The first and last day of the period, India time; the current month by default. */
  from: z.string().refine(isIstDay, 'Enter the day as YYYY-MM-DD.').optional(),
  to: z.string().refine(isIstDay, 'Enter the day as YYYY-MM-DD.').optional(),
})

export type LoadReports = (
  req: PayloadRequest,
  query: unknown,
) => Promise<Result<ReportFigure[], ViewError>>

// ---- Global search (docs/05, Navigation) ----

export const searchQuery = z.object({ q: z.string().trim().min(2).max(100) })

/** What search finds, by kind; never a session note, a Map answer or a message body. */
export type SearchHit = {
  kind: 'person' | 'booking' | 'invoice' | 'certificate' | 'organisation' | 'lead'
  id: number
  label: string
  detail: string
  href: string
}

export type SearchAdmin = (
  req: PayloadRequest,
  query: unknown,
) => Promise<Result<SearchHit[], ViewError>>

// ---- The person record's timeline (docs/05, People) ----

export type TimelineEntry = {
  at: string
  kind:
    | 'booking'
    | 'payment'
    | 'refund'
    | 'invoice'
    | 'consent'
    | 'certificate'
    | 'feedback'
    | 'review'
    | 'privacy-request'
    | 'note'
    | 'message'
    | 'lead'
    | 'activity'
    | 'enrolment'
  label: string
  href: string | null
}

export type PersonTimeline = {
  personId: number
  /** What this role may read of the record: a practitioner reads the name, mobile and email. */
  person: {
    fullName: string
    mobile: string | null
    email: string | null
    preferredChannel: string | null
  }
  /** The purposes in force now, from the ledger (the office only; null for other roles). */
  consents: { purpose: string; since: string }[] | null
  entries: TimelineEntry[]
  /** For an owner: how many session notes exist, never their words (docs/05). */
  notes: { count: number; latestAt: string | null } | null
  /** Kinds this role may not see, or that are not built yet, named rather than left out. */
  notShown: string[]
}

export type LoadPersonTimeline = (
  req: PayloadRequest,
  personId: number,
) => Promise<Result<PersonTimeline, ViewError>>
