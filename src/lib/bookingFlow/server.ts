import 'server-only'

import { cookies, headers } from 'next/headers'
import { after } from 'next/server'
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'

import { recordEventQuietly } from '@/lib/analytics/record'
import { hashManageToken } from '@/lib/booking/tokens'
import { env } from '@/lib/env'
import type { Booking } from '@/payload-types'
import config from '@payload-config'

import {
  BOOKING_COOKIE,
  BOOKING_COOKIE_MAX_AGE,
  BOOKING_COOKIE_PATH,
  cookieOpens,
  decodeBookingCookie,
  encodeBookingCookie,
  type BookingCookie,
} from './cookie'
import type { FlowType } from './details'

/**
 * What the booking flow's pages and actions share on the server: a request of their own for the
 * booking module, the booking cookie, and the funnel's events (docs/12 §7), which never carry a
 * person and are not written once the age band says under 18 (docs/08 §3).
 */

export async function flowPayload(): Promise<Payload> {
  return getPayload({ config })
}

export async function flowRequest(payload?: Payload): Promise<PayloadRequest> {
  return createLocalReq({}, payload ?? (await flowPayload()))
}

/** The register each kind of booking is shown in (docs/02). */
export const REGISTER_OF: Record<FlowType, 'counselling' | 'consultancy' | 'education'> = {
  session: 'counselling',
  call: 'consultancy',
  info: 'education',
}

export async function setBookingCookie(value: BookingCookie): Promise<void> {
  const jar = await cookies()
  jar.set(BOOKING_COOKIE, encodeBookingCookie(value), {
    httpOnly: true,
    sameSite: 'lax',
    secure: env().siteUrl.startsWith('https:'),
    path: BOOKING_COOKIE_PATH,
    maxAge: BOOKING_COOKIE_MAX_AGE,
  })
}

export async function readBookingCookie(): Promise<BookingCookie | null> {
  const jar = await cookies()
  return decodeBookingCookie(jar.get(BOOKING_COOKIE)?.value)
}

/**
 * The booking a reference names, only when this browser made it (the booking cookie); else
 * null, and the page says only that a booking exists and its details are in the message.
 */
export async function bookingForThisBrowser(
  req: PayloadRequest,
  reference: string,
): Promise<Booking | null> {
  const cookie = await readBookingCookie()
  if (!cookie || cookie.ref !== reference) return null
  const { docs } = await req.payload.find({
    collection: 'bookings',
    where: { reference: { equals: reference } },
    limit: 1,
    depth: 0,
    showHiddenFields: true,
    overrideAccess: true,
    req,
  })
  const booking = docs[0]
  return booking && cookieOpens(cookie, booking, hashManageToken) ? booking : null
}

/** Whether a booking with this reference exists, without anything about it. */
export async function bookingExists(req: PayloadRequest, reference: string): Promise<boolean> {
  const { totalDocs } = await req.payload.count({
    collection: 'bookings',
    where: { reference: { equals: reference } },
    overrideAccess: true,
    req,
  })
  return totalDocs > 0
}

/** The address and browser a consent came from, as its evidence (docs/08 §3). */
export async function requestEvidence(): Promise<{ ip: string | null; userAgent: string | null }> {
  const all = await headers()
  const forwarded = all.get('x-forwarded-for')?.split(',')[0]?.trim()
  return {
    ip: forwarded || all.get('x-real-ip') || null,
    userAgent: all.get('user-agent'),
  }
}

type FunnelEvent = 'booking_started' | 'time_chosen' | 'booking_confirmed' | 'request_submitted'

/**
 * Counts a step of the booking funnel after the response, never failing it. Not about anyone:
 * the kind of booking, its register and whom it is for; nothing once the age band says under 18.
 */
export async function countStep(
  name: FunnelEvent,
  type: FlowType,
  input: { whoFor?: 'yourself' | 'family' | 'organisation'; ageBand?: string | null } = {},
): Promise<void> {
  if (input.ageBand === 'under18') return
  const requestHeaders = new Headers(await headers())
  const whoFor = type === 'call' ? 'organisation' : input.whoFor
  after(() =>
    recordEventQuietly(
      { name, route: `/book/${type}`, register: REGISTER_OF[type], ...(whoFor ? { whoFor } : {}) },
      requestHeaders,
    ),
  )
}
