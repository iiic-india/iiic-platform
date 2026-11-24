import type { PayloadRequest } from 'payload'

import { hasRole, type MaybeStaff } from '@/access/roles'
import { viewRefusal, type AdminView } from '@/access/views'
import { isIstDay } from '@/fields/istDay'
import { err, type Err } from '@/lib/result'
import { istDay } from '@/lib/time/ist'

import type { Panel, ScheduleItem, ViewError } from './contract'

/**
 * What the custom views' loaders share (docs/18 §6, §7): the refusal they answer first, the
 * user's own access for every read, and India's days. Pure, so the loaders' rules are tested
 * without a database; the loaders themselves are `server-only`.
 */

/** The refusal a loader answers before it reads anything, or null when the user may open it. */
export function refused(req: Pick<PayloadRequest, 'user'>, view: AdminView): Err<ViewError> | null {
  const refusal = viewRefusal(req.user, view)
  return refusal ? err({ code: 'refused', refusal }) : null
}

/** Every read with the user's own access, so the collections' rules narrow what a role sees. */
export const asUser = (req: PayloadRequest) =>
  ({ overrideAccess: false, user: req.user, req }) as const

/** The office: owners and the operator (docs/05). Practitioners see their own schedule only. */
export const isOffice = (user: unknown): boolean => hasRole(user as MaybeStaff, 'owner', 'operator')

/** A relationship's id, whether the read returned the id or the document. */
export function idOf(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'number') {
    return (value as { id: number }).id
  }
  return null
}

/** A part of a view: ready with its value, or failed, drawn as "could not load", never as zero. */
export async function settle<T>(work: () => Promise<T>): Promise<Panel<T>> {
  try {
    return { state: 'ready', value: await work() }
  } catch {
    return { state: 'failed' }
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

/** The instant an India day starts (India keeps no daylight saving: +05:30 all year). */
export function dayStart(day: string): Date {
  return new Date(`${day}T00:00:00+05:30`)
}

/** The India day `n` days after `day`. */
export function addDays(day: string, n: number): string {
  return istDay(new Date(dayStart(day).getTime() + n * DAY_MS + 6 * 60 * 60 * 1000))
}

/** The Monday of the week `day` falls in (weeks start on Monday, docs/05). */
export function weekStart(day: string): string {
  const weekday = new Date(`${day}T12:00:00+05:30`).getUTCDay()
  return addDays(day, -((weekday + 6) % 7))
}

/** The days a calendar shows: the one day, or the seven of its week from Monday. */
export function calendarDays(view: 'day' | 'week', day: string): string[] {
  if (view === 'day') return [day]
  const first = weekStart(day)
  return Array.from({ length: 7 }, (_, n) => addDays(first, n))
}

/** The first and last day of the month `day` falls in. */
export function monthOf(day: string): { from: string; to: string } {
  const from = `${day.slice(0, 7)}-01`
  const [year, month] = from.split('-').map(Number) as [number, number]
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { from, to: `${day.slice(0, 7)}-${String(last).padStart(2, '0')}` }
}

/** The instants an India day range covers: from the start of `from` to the end of `to`. */
export function periodRange(from: string, to: string): { gte: string; lt: string } {
  return { gte: dayStart(from).toISOString(), lt: dayStart(addDays(to, 1)).toISOString() }
}

/** Whether a value is an India day, as the views' query strings carry it. */
export const isDay = isIstDay

/** A booking's paid state as a practitioner may see it: paid, unpaid or free, never an amount. */
export function paidState(paymentStatus: string | null | undefined): ScheduleItem['paid'] {
  if (paymentStatus === 'notRequired') return 'free'
  if (paymentStatus === 'paid' || paymentStatus === 'partRefunded') return 'paid'
  return 'unpaid'
}

/** The fields of a booking a schedule line reads. */
export type BookingLine = {
  id: number
  reference: string
  type: string
  status: string
  paymentStatus?: string | null
  format?: string | null
  meetingUrl?: string | null
  startsAt?: string | null
  endsAt?: string | null
  person?: unknown
  practitioner?: unknown
}

/** A booking as one line of a schedule. The client's name is read with the user's own access. */
export function scheduleItem(booking: BookingLine, firstTime: boolean): ScheduleItem {
  const person = booking.person as { fullName?: unknown } | null | undefined
  return {
    bookingId: booking.id,
    reference: booking.reference,
    startsAt: booking.startsAt ?? '',
    endsAt: booking.endsAt ?? '',
    clientName: typeof person?.fullName === 'string' ? person.fullName : '',
    serviceType: (booking.type as ScheduleItem['serviceType']) ?? 'session',
    format: booking.format ?? null,
    joinUrl: booking.meetingUrl ?? null,
    status: booking.status,
    paid: paidState(booking.paymentStatus),
    firstTime,
    mapShared: null,
  }
}

/** Whole hours from one instant to another, rounded down (an age, or time left). */
export function hoursBetween(from: Date | string, to: Date): number {
  return Math.floor((to.getTime() - new Date(from).getTime()) / (60 * 60 * 1000))
}

/** The middle value of a list of numbers (the mean of the two middle ones for an even count). */
export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
}

/** A list in the admin, filtered: `/admin/collections/<slug>?where[field][equals]=value`. */
export function listHref(admin: string, slug: string, where: Record<string, string> = {}): string {
  const query = Object.entries(where)
    .map(([field, value]) => `where[${field}][equals]=${encodeURIComponent(value)}`)
    .join('&')
  return `${admin}/collections/${slug}${query ? `?${query}` : ''}`
}
