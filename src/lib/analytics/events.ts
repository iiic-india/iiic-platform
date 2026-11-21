import { z } from 'zod'

import { STEP_ZERO_CHOICES, WHO_FOR } from '@/lib/map/stepZero'

/**
 * The plan's funnel, counted by the platform itself (docs/04 `analytics_events`; docs/12 §7):
 * which door, the answer to Find your path, a booking from start to confirmation, requests, the
 * Map (R2), the newsletter and searches that found nothing. An event says what happened, on
 * which page, in which register, for whom where that is asked, in which daily session and when;
 * never who. No event is written from the browser.
 */
export const EVENT_NAMES = [
  { value: 'door', label: 'Door chosen' },
  { value: 'step0', label: 'Find your path answered' },
  { value: 'booking_started', label: 'Booking started' },
  { value: 'time_chosen', label: 'Time chosen' },
  { value: 'booking_confirmed', label: 'Booking confirmed' },
  { value: 'request_submitted', label: 'Request sent' },
  { value: 'map_completed', label: 'Map completed' },
  { value: 'newsletter_confirmed', label: 'Newsletter confirmed' },
  { value: 'search_no_results', label: 'Search with no results' },
] as const

/** The site's registers (docs/02): the paper default and the three applications. */
export const REGISTERS = [
  { value: 'default', label: 'Default' },
  { value: 'consultancy', label: 'Consultancy' },
  { value: 'education', label: 'Education' },
  { value: 'counselling', label: 'Counselling' },
] as const

/** Who an event is for, in Find your path's words. */
export const WHO_FOR_OPTIONS = STEP_ZERO_CHOICES.map(({ value, label }) => ({ value, label }))

const values = <T extends readonly { value: string }[]>(options: T) =>
  options.map((option) => option.value) as [T[number]['value'], ...T[number]['value'][]]

/** What a caller says about an event: checked before anything is written (docs/12 §6). */
export const AnalyticsEvent = z.object({
  name: z.enum(values(EVENT_NAMES)),
  // A path on this site as a route names it, never with a query, which could carry anything.
  route: z
    .string()
    .max(200)
    .regex(/^\/[a-z0-9/-]*$/),
  register: z.enum(values(REGISTERS)),
  whoFor: z.enum(WHO_FOR).optional(),
})

export type AnalyticsEventInput = z.infer<typeof AnalyticsEvent>
