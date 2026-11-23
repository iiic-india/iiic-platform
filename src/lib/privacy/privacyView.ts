import 'server-only'

import type { PayloadRequest, Where } from 'payload'
import { z } from 'zod'

import { viewRefusal, type ViewRefusal } from '@/access/views'
import { err, ok, type Result } from '@/lib/result'

import { incidentClockStates, requestClocks } from './breachClocks'
import type { ClockState } from './breaches'
import { CONSENT_CHANNELS, CONSENT_PURPOSES } from './purposes'
import { REQUEST_STATUSES, REQUEST_TYPES } from './requests'

/**
 * What the Privacy view shows (docs/05, Privacy; docs/18 §5, §6): open requests by their
 * resolution deadline with both clocks, the consent log filtered, and open incidents with both
 * clocks. Asks `viewRefusal(user, 'privacy')` first, then reads with the user's own access, so
 * the collections' rules decide what each role sees. The consent log is read only: M2's ledger,
 * no new write path. No request summary, note or form contents appear here.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 24 * 60 * 60 * 1000

const purposes = CONSENT_PURPOSES.map((option) => option.value) as [string, ...string[]]

/** The consent log's filter, from the view's query string; anything malformed is dropped. */
export const consentFilter = z.object({
  person: z.coerce.number().int().positive().optional().catch(undefined),
  purpose: z.enum(purposes).optional().catch(undefined),
  kind: z.enum(['given', 'withdrawn']).optional().catch(undefined),
  from: z.string().regex(DAY).optional().catch(undefined),
  to: z.string().regex(DAY).optional().catch(undefined),
})
export type ConsentFilter = z.infer<typeof consentFilter>

/** The first value of each query parameter, as Next.js hands the view its search params. */
export function readConsentFilter(params: Record<string, string | string[] | undefined> = {}) {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)
  return consentFilter.parse(
    Object.fromEntries(
      ['person', 'purpose', 'kind', 'from', 'to'].map((key) => [
        key,
        first(params[key]) || undefined,
      ]),
    ),
  )
}

/** The instants an IST day range covers: from the start of `from` to the end of `to`. */
export function istRange(from?: string, to?: string): { gte?: string; lt?: string } {
  return {
    ...(from ? { gte: new Date(`${from}T00:00:00+05:30`).toISOString() } : {}),
    ...(to
      ? { lt: new Date(new Date(`${to}T00:00:00+05:30`).getTime() + DAY_MS).toISOString() }
      : {}),
  }
}

/** The query for a filter: an entry's own time is when it was given, or when it was withdrawn. */
export function consentWhere(filter: ConsentFilter): Where {
  const range = istRange(filter.from, filter.to)
  const timed = (field: 'grantedAt' | 'withdrawnAt'): Where[] =>
    Object.keys(range).length ? [{ [field]: range } as Where] : []
  const given: Where = { and: [{ withdraws: { exists: false } }, ...timed('grantedAt')] }
  const withdrawn: Where = { and: [{ withdraws: { exists: true } }, ...timed('withdrawnAt')] }
  const and: Where[] = [
    ...(filter.person ? [{ person: { equals: filter.person } }] : []),
    ...(filter.purpose ? [{ purpose: { equals: filter.purpose } }] : []),
    filter.kind === 'given'
      ? given
      : filter.kind === 'withdrawn'
        ? withdrawn
        : { or: [given, withdrawn] },
  ]
  return { and }
}

const labelOf = (options: readonly { value: string; label: string }[], value: unknown) =>
  options.find((option) => option.value === value)?.label ?? String(value ?? '')

const idOf = (value: unknown): number | undefined => {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'number') {
    return (value as { id: number }).id
  }
  return undefined
}

export type RequestRow = {
  id: number
  kind: string
  status: string
  receivedAt: string
  acknowledge: ClockState
  resolve: ClockState
}

export type ConsentRow = {
  id: number
  kind: 'given' | 'withdrawn'
  at: string | null
  personId: number | null
  purpose: string
  channel: string
  notice: { title: string; text: string } | null
  evidence: { form?: string | null; reference?: string | null; device: boolean }
  writtenReceipt: string | null
}

export type IncidentRow = {
  id: number
  title: string
  detectedAt: string
  status: string
  certIn: ClockState
  board: ClockState
}

export type PrivacyViewData = {
  requests: RequestRow[]
  consents: { rows: ConsentRow[]; total: number }
  incidents: IncidentRow[]
}

/** How many consent entries the view lists at once, newest first. */
export const CONSENT_LIMIT = 100

export async function loadPrivacyView(
  req: PayloadRequest,
  filter: ConsentFilter,
  now = new Date(),
): Promise<Result<PrivacyViewData, { code: 'refused'; refusal: ViewRefusal }>> {
  const refusal = viewRefusal(req.user, 'privacy')
  if (refusal) return err({ code: 'refused', refusal })
  const asUser = { overrideAccess: false, user: req.user, req } as const

  const requests = await req.payload.find({
    collection: 'data-requests',
    where: { status: { not_equals: 'closed' } },
    sort: 'resolveBy',
    limit: 200,
    depth: 0,
    select: {
      type: true,
      status: true,
      receivedAt: true,
      acknowledgeBy: true,
      resolveBy: true,
      acknowledgedAt: true,
      resolution: true,
    },
    ...asUser,
  })
  const consents = await req.payload.find({
    collection: 'consents',
    where: consentWhere(filter),
    sort: '-createdAt',
    limit: CONSENT_LIMIT,
    depth: 1,
    ...asUser,
  })
  const incidents = await req.payload.find({
    collection: 'incidents',
    where: { status: { not_equals: 'closed' } },
    sort: 'detectedAt',
    limit: 100,
    depth: 0,
    select: {
      title: true,
      detectedAt: true,
      status: true,
      personalData: true,
      certIn: true,
      board: true,
    },
    ...asUser,
  })

  return ok({
    requests: requests.docs.map((doc) => ({
      id: doc.id,
      kind: labelOf(REQUEST_TYPES, doc.type),
      status: labelOf(REQUEST_STATUSES, doc.status),
      receivedAt: doc.receivedAt,
      ...requestClocks(doc, now),
    })),
    consents: {
      total: consents.totalDocs,
      rows: consents.docs.map((doc) => {
        const notice = typeof doc.noticeVersion === 'object' ? doc.noticeVersion : null
        const evidence = (doc.evidence ?? {}) as {
          form?: string | null
          reference?: string | null
          ip?: string | null
          userAgent?: string | null
        }
        const withdrawal = Boolean(doc.withdraws)
        return {
          id: doc.id,
          kind: withdrawal ? 'withdrawn' : 'given',
          at: (withdrawal ? doc.withdrawnAt : doc.grantedAt) ?? null,
          personId: idOf(doc.person) ?? null,
          purpose: labelOf(CONSENT_PURPOSES, doc.purpose),
          channel: labelOf(CONSENT_CHANNELS, doc.channel),
          notice: notice ? { title: notice.title ?? '', text: notice.text ?? '' } : null,
          // The address and browser are evidence, not something to read on a screen.
          evidence: {
            form: evidence.form,
            reference: evidence.reference,
            device: Boolean(evidence.ip || evidence.userAgent),
          },
          writtenReceipt: doc.writtenReceipt ?? null,
        }
      }),
    },
    incidents: incidents.docs.map((doc) => ({
      id: doc.id,
      title: doc.title,
      detectedAt: doc.detectedAt,
      status: doc.status,
      ...incidentClockStates(doc, now),
    })),
  })
}
