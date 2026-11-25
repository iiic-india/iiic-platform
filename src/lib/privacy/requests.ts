import type { PayloadRequest } from 'payload'
import { z } from 'zod'

import type { ViewRefusal } from '@/access/views'
import type { Result } from '@/lib/result'

/**
 * Privacy requests and complaints (docs/04 `data_requests`; docs/05, Privacy; docs/08 §3, §4;
 * docs/18 §5). The kinds, the states and the clocks live here, once; builder A implements the
 * moves (src/lib/privacy/requestMoves.ts), the export an access request produces and the erasure
 * plan, against the types below.
 *
 * The clocks are the ones docs/05 and docs/08 set, counted from when the request reached IIIC:
 * every kind is acknowledged within 48 hours; a consumer complaint or a privacy grievance is
 * resolved within one month (the SPDI Rules' Grievance Officer and the E-Commerce Rules), and a
 * data request within the 30 days IIIC publishes (inside the SPDI month and DPDP's 90 days).
 */

export const REQUEST_TYPES = [
  { value: 'access', label: 'Access to their data' },
  { value: 'correction', label: 'Correction' },
  { value: 'erasure', label: 'Erasure' },
  { value: 'withdrawal', label: 'Withdrawal of consent' },
  { value: 'nomination', label: 'Nomination' },
  { value: 'consumerComplaint', label: 'Consumer complaint' },
  { value: 'privacyGrievance', label: 'Privacy grievance' },
] as const

export type RequestType = (typeof REQUEST_TYPES)[number]['value']

/**
 * The most a request's words may hold, once (D-135): the data-requests collection's summary,
 * what staff record, and what a person sends from My IIIC (`ownRequestInput` in
 * src/lib/accounts/contract.ts).
 */
export const REQUEST_SUMMARY_MAX = 2000

export const REQUEST_STATUSES = [
  { value: 'received', label: 'Received' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'verified', label: 'Identity verified' },
  { value: 'preparing', label: 'Being prepared' },
  { value: 'awaitingOwner', label: 'Waiting for an owner' },
  { value: 'closed', label: 'Closed' },
] as const

export type RequestStatus = (typeof REQUEST_STATUSES)[number]['value']

export const REQUEST_OUTCOMES = [
  { value: 'fulfilled', label: 'Done as asked' },
  { value: 'partly', label: 'Done in part, with the reason' },
  { value: 'refused', label: 'Refused, with the reason' },
  { value: 'withdrawn', label: 'Withdrawn by the person' },
] as const

/** How the request reached IIIC. */
export const REQUEST_CHANNELS = [
  { value: 'web', label: 'The form on this site' },
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'phone', label: 'Phone call' },
  { value: 'letter', label: 'Letter' },
  { value: 'inPerson', label: 'In person' },
] as const

/** How the person's identity was checked (docs/08 §3: "requests verified by one-time code"). */
export const VERIFICATION_METHODS = [
  { value: 'oneTimeCode', label: 'One-time code to the verified contact' },
  { value: 'detailsMatch', label: 'Details matched the record' },
  { value: 'inPerson', label: 'In person' },
] as const

/** Every kind is acknowledged within 48 hours (docs/05, Privacy; docs/08 §4). */
export const ACKNOWLEDGE_WITHIN_HOURS = 48

/** How long each kind has to be resolved, from when it was received. */
export const RESOLVE_WITHIN: Record<RequestType, { days: number } | { months: number }> = {
  access: { days: 30 },
  correction: { days: 30 },
  erasure: { days: 30 },
  withdrawal: { days: 30 },
  nomination: { days: 30 },
  consumerComplaint: { months: 1 },
  privacyGrievance: { months: 1 },
}

/** The kinds that are complaints: an automatic acknowledgement with a copy as recorded (O7). */
export const COMPLAINT_TYPES: readonly RequestType[] = ['consumerComplaint', 'privacyGrievance']

/**
 * The two clocks of a request, as instants (pure). A month is a calendar month in India time
 * (the same day next month, or its last day); hours and days are exact. Builder A implements it
 * with @date-fns/tz in Asia/Kolkata (CLAUDE.md #8).
 */
export type DeadlinesFor = (
  type: RequestType,
  receivedAt: Date,
) => { acknowledgeBy: Date; resolveBy: Date }

type RequestChannel = (typeof REQUEST_CHANNELS)[number]['value']

const values = <T extends string>(options: readonly { value: T }[]) =>
  options.map((option) => option.value) as [T, ...T[]]

/** What staff type to record a request (the public form's own input is M6's O7). */
export const recordRequestInput = z.object({
  personId: z.number().int().positive(),
  type: z.enum(values<RequestType>(REQUEST_TYPES)),
  channel: z.enum(values<RequestChannel>(REQUEST_CHANNELS)),
  receivedAt: z.iso.datetime({ offset: true }),
  summary: z.string().trim().min(1).max(REQUEST_SUMMARY_MAX),
})
export type RecordRequestInput = z.infer<typeof recordRequestInput>

export type RequestError =
  | ({ code: 'refused' } & { refusal: ViewRefusal })
  | { code: 'invalid'; issues: string[] }
  | { code: 'not-found' }
  /** A move the request's state does not allow (docs/18 §5's table). */
  | { code: 'not-now'; status: RequestStatus }
  /** An erasure or an export before the identity check. */
  | { code: 'not-verified' }

/**
 * What an erasure would do, shown to the owner before they confirm (docs/05): what is deleted
 * (the person, their notes, Map results, consents marked withdrawn, feedback, reviews) and what is
 * kept and why (invoices and payments anonymised for GST, the audit log, the consent entries).
 */
export type ErasurePlan = {
  deletes: { entity: string; count: number }[]
  keeps: { entity: string; count: number; why: string }[]
}

export type PlanErasure = (
  req: PayloadRequest,
  requestId: number,
) => Promise<Result<ErasurePlan, RequestError>>

/** The owner's confirmation: runs the plan in one transaction and closes the request. */
export type ConfirmErasure = (
  req: PayloadRequest,
  requestId: number,
) => Promise<Result<{ deleted: number }, RequestError>>

/**
 * The access request's export: the person's own records as JSON and a readable summary, stored
 * in the private bucket for the owner to send (docs/05: "an access request produces a data
 * export"). Session notes join it only if D-11 says so. A deployment without the private bucket
 * refuses it as `storage-missing`.
 */
export type ExportPersonData = (
  req: PayloadRequest,
  requestId: number,
) => Promise<Result<{ key: string }, RequestError | { code: 'storage-missing' }>>
