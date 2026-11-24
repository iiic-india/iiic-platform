import 'server-only'

import type { PayloadRequest, Where } from 'payload'

import { err, ok, type Result } from '@/lib/result'

import {
  calendarQuery,
  type CalendarData,
  type CalendarEntry,
  type CalendarQuery,
  type ViewError,
} from './contract'
import {
  addDays,
  asUser,
  calendarDays,
  dayStart,
  idOf,
  isOffice,
  refused,
  scheduleItem,
  type BookingLine,
} from './shared'
import { SCHEDULED } from './today'

/**
 * Calendar (docs/05, Calendar; docs/18 §6): a week from Monday, or one day, one column per day,
 * with bookings, busy time from the practitioner's own calendar (start and end only, D-22) and
 * closed days. Asks `viewRefusal(user, 'calendar')` first, then reads with the user's own access,
 * so a practitioner sees their own calendar whatever the address asks for. Moving a booking is
 * M3's office action (POST /api/bookings/:id/reschedule), which checks again; there is no drag.
 */

/** Held and awaiting payment show too: the time is taken while they last. */
const SHOWN = [...SCHEDULED, 'held', 'pendingPayment'] as const

/** The calendar's query from the view's search params; a missing day is today in India. */
export function readCalendarQuery(
  params: Record<string, string | string[] | undefined>,
  today: string,
): unknown {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)
  return {
    view: first(params.view) || undefined,
    day: first(params.day) || today,
    practitionerId: first(params.practitionerId) || undefined,
  }
}

/** The practitioners a user may pick between: every active one for the office, else their own. */
async function practitionersFor(req: PayloadRequest): Promise<{ id: number; name: string }[]> {
  if (isOffice(req.user)) {
    const { docs } = await req.payload.find({
      collection: 'practitioners',
      where: { active: { equals: true } },
      sort: 'publicName',
      limit: 100,
      depth: 0,
      select: { publicName: true },
      ...asUser(req),
    })
    return docs.map((doc) => ({ id: doc.id, name: doc.publicName }))
  }
  // A practitioner's own profile: found by its staff account, which only the office reads, so
  // this one lookup reads past the rules and returns their own profile's id and name only.
  const userId = (req.user as { id?: number } | null)?.id
  if (typeof userId !== 'number') return []
  const { docs } = await req.payload.find({
    collection: 'practitioners',
    where: { staff: { equals: userId } },
    limit: 5,
    depth: 0,
    select: { publicName: true },
    overrideAccess: true,
    req,
  })
  return docs.map((doc) => ({ id: doc.id, name: doc.publicName }))
}

export async function loadCalendar(
  req: PayloadRequest,
  query: unknown,
): Promise<Result<CalendarData, ViewError>> {
  const refusal = refused(req, 'calendar')
  if (refusal) return refusal
  const parsed = calendarQuery.safeParse(query)
  if (!parsed.success) {
    return err({ code: 'invalid', issues: parsed.error.issues.map((issue) => issue.message) })
  }
  const practitioners = await practitionersFor(req)
  const wanted = parsed.data.practitionerId
  // A practitioner's calendar is their own, whatever the address asks for.
  const practitionerId =
    wanted !== undefined && practitioners.some((entry) => entry.id === wanted) ? wanted : undefined
  const settled: CalendarQuery = { ...parsed.data, practitionerId }
  const days = calendarDays(settled.view, settled.day)
  const from = dayStart(days[0] as string).toISOString()
  const to = dayStart(addDays(days[days.length - 1] as string, 1)).toISOString()
  const forPractitioner: Where[] = practitionerId
    ? [{ practitioner: { equals: practitionerId } }]
    : []

  const bookings = await req.payload.find({
    collection: 'bookings',
    where: {
      and: [
        { startsAt: { greater_than_equal: from } },
        { startsAt: { less_than: to } },
        { status: { in: [...SHOWN] } },
        ...forPractitioner,
      ],
    },
    sort: 'startsAt',
    limit: 500,
    depth: 1,
    ...asUser(req),
  })
  const busy = await req.payload.find({
    collection: 'busy-blocks',
    where: {
      and: [
        { startsAt: { less_than: to } },
        { endsAt: { greater_than: from } },
        ...forPractitioner,
      ],
    },
    sort: 'startsAt',
    limit: 500,
    depth: 0,
    ...asUser(req),
  })
  const closed = await req.payload.find({
    collection: 'availability-exceptions',
    where: {
      and: [{ day: { in: days } }, { kind: { equals: 'closed' } }, ...forPractitioner],
    },
    limit: 200,
    depth: 0,
    select: { day: true, practitioner: true },
    ...asUser(req),
  })

  const byDay = new Map<string, CalendarEntry[]>(days.map((day) => [day, []]))
  const dayOf = (instant: string) =>
    days.find(
      (day) =>
        new Date(instant).getTime() >= dayStart(day).getTime() &&
        new Date(instant).getTime() < dayStart(addDays(day, 1)).getTime(),
    )
  for (const doc of bookings.docs) {
    const day = doc.startsAt ? dayOf(doc.startsAt) : undefined
    if (!day) continue
    byDay.get(day)?.push({
      kind: 'booking',
      item: scheduleItem(doc as unknown as BookingLine, false),
      practitionerId: idOf(doc.practitioner) ?? 0,
    })
  }
  for (const doc of busy.docs) {
    // A block that starts before the range is drawn on the range's first day.
    const day = dayOf(doc.startsAt) ?? days[0]
    if (!day) continue
    byDay.get(day)?.push({
      kind: 'busy',
      startsAt: doc.startsAt,
      endsAt: doc.endsAt,
      practitionerId: idOf(doc.practitioner) ?? 0,
    })
  }
  for (const doc of closed.docs) {
    byDay
      .get(doc.day)
      ?.push({ kind: 'closed', day: doc.day, practitionerId: idOf(doc.practitioner) ?? 0 })
  }
  const startOf = (entry: CalendarEntry) =>
    entry.kind === 'booking' ? entry.item.startsAt : entry.kind === 'busy' ? entry.startsAt : ''
  return ok({
    query: settled,
    days: days.map((day) => ({
      day,
      entries: (byDay.get(day) ?? []).sort((a, b) => startOf(a).localeCompare(startOf(b))),
    })),
    practitioners,
  })
}
