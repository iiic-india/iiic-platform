import 'server-only'

import type { CollectionSlug, PayloadRequest, Where } from 'payload'
import { z } from 'zod'

import { viewRefusal } from '@/access/views'
import { recordAudit } from '@/lib/audit/record'
import { err, ok, type Result } from '@/lib/result'
import { formatIstDate, formatIstTime } from '@/lib/time/ist'

import type { ExportPersonData, RequestError } from './requests'
import { codeEnteredRecently } from './stepUp'
import { isSafeKey, privateStore, type PrivateStore } from './store'

/**
 * The export an access request produces (docs/05: "an access request produces a data export for
 * the person"; docs/18 §5): the person's own records as JSON and as a readable page, written to
 * the private store for an owner to send. Session notes are left out: D-11 is open and the design
 * assumes they are not disclosed until IIIC decides. The audit log, the analytics events and other
 * people's records are not the person's own and are left out too. M4's and M6's records about the
 * person are in: the enquiries they sent, their newsletter entry (never its token's hash), their
 * suppressed addresses, and the log of messages sent to them, as ids, kinds and states only: the
 * log holds no body, and nothing in it is anything said in a session.
 *
 * Only an owner makes one (VIEW_POLICY.privacyDecision), after entering the code again, for a
 * verified access request still open; the request records where the export is (`exportKey`),
 * and downloading it writes `download-export` (src/lib/privacy/endpoints.ts).
 */

export type ExportError = RequestError | { code: 'storage-missing' }

/** The sections of an export, in the order the page shows them. */
export const EXPORT_SECTIONS = [
  { key: 'person', title: 'Your record' },
  { key: 'consents', title: 'What you agreed to, and any withdrawal' },
  { key: 'bookings', title: 'Bookings' },
  { key: 'payments', title: 'Payments' },
  { key: 'refunds', title: 'Refunds' },
  { key: 'invoices', title: 'Invoices' },
  { key: 'certificates', title: 'Certificates' },
  { key: 'feedback', title: 'Feedback you gave' },
  { key: 'reviews', title: 'Reviews you gave' },
  { key: 'enquiries', title: 'Enquiries you sent through the site' },
  { key: 'newsletter', title: 'Your newsletter subscription' },
  { key: 'suppressions', title: 'Addresses we send nothing to' },
  { key: 'messages', title: 'Messages we sent you' },
  { key: 'account', title: 'Your My IIIC account' },
  { key: 'requests', title: 'Your privacy requests' },
] as const

type SectionKey = (typeof EXPORT_SECTIONS)[number]['key']
export type PersonExport = { generatedAt: string } & Record<SectionKey, Record<string, unknown>[]>

const requestId = z.number().int().positive()

const idOf = (value: unknown): number | undefined => {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'number') {
    return (value as { id: number }).id
  }
  return undefined
}

/**
 * Every record of one kind matching `where`, without hidden fields (hashes, keys, tokens), or
 * with only the fields `select` names.
 */
async function all(
  req: PayloadRequest,
  collection: CollectionSlug,
  where: Where,
  select?: Record<string, true>,
) {
  const { docs } = await req.payload.find({
    collection,
    where,
    depth: 0,
    pagination: false,
    ...(select ? { select } : {}),
    overrideAccess: true,
    req,
  })
  return docs as unknown as Record<string, unknown>[]
}

/** What a newsletter entry shows the person: never its confirmation token's hash. */
const SUBSCRIBER_FIELDS = {
  email: true,
  status: true,
  source: true,
  notice: true,
  consent: true,
  confirmedAt: true,
  unsubscribedAt: true,
  lastEngagedAt: true,
  createdAt: true,
} as const

/** A message as the log keeps it: what it was, by which channel, and what became of it. */
const MESSAGE_FIELDS = {
  template: true,
  channel: true,
  kind: true,
  status: true,
  skipReason: true,
  sendAt: true,
  sentAt: true,
  deliveredAt: true,
  readAt: true,
} as const

/**
 * A My IIIC account as the person may read it (Release 2; docs/20 §12 H8): when it was made, when
 * and how they last signed in. Never Better Auth's id; the sign-in details are the record's own.
 */
const ACCOUNT_FIELDS = {
  createdAt: true,
  lastSignInAt: true,
  lastSignInChannel: true,
} as const

/** The person's own records, gathered past the rules once the owner's checks have passed. */
export async function gatherPersonData(
  req: PayloadRequest,
  personId: number,
  now = new Date(),
): Promise<PersonExport> {
  const person = { person: { equals: personId } }
  const people = await all(req, 'people', { id: { equals: personId } })
  const bookings = await all(req, 'bookings', person)
  const onBookings: Where = {
    booking: { in: bookings.length ? bookings.map((booking) => booking.id as number) : [0] },
  }
  // A newsletter entry is the person's once confirmed, or still pending under their email; a
  // suppressed address is theirs when linked to them or when it is their email or mobile.
  const record = people[0] ?? {}
  const email = typeof record.email === 'string' ? record.email.trim().toLowerCase() : ''
  const mobile = typeof record.mobile === 'string' ? record.mobile.trim() : ''
  const addresses = [email, mobile].filter(Boolean)
  const newsletter = await all(
    req,
    'subscribers',
    { or: [person, ...(email ? [{ email: { equals: email } }] : [])] },
    SUBSCRIBER_FIELDS,
  )
  const subscriberIds = newsletter.map((entry) => entry.id as number)
  return {
    generatedAt: now.toISOString(),
    // The joins list the consents, bookings and suppressed addresses again; each has its section.
    person: people.map((record) => {
      const copy = { ...record }
      delete copy.consents
      delete copy.bookings
      delete copy.suppressions
      // The account has a section of its own.
      delete copy.account
      return copy
    }),
    consents: await all(req, 'consents', person),
    bookings,
    payments: await all(req, 'payments', onBookings),
    refunds: await all(req, 'refunds', onBookings),
    invoices: await all(req, 'invoices', onBookings),
    certificates: await all(req, 'certificates', person),
    feedback: await all(req, 'feedback', person),
    reviews: await all(req, 'testimonials', person),
    enquiries: await all(req, 'enquiries', person),
    newsletter,
    suppressions: await all(req, 'suppressions', {
      or: [person, ...(addresses.length ? [{ address: { in: addresses } }] : [])],
    }),
    messages: await all(
      req,
      'messages',
      {
        or: [person, ...(subscriberIds.length ? [{ subscriber: { in: subscriberIds } }] : [])],
      },
      MESSAGE_FIELDS,
    ),
    requests: await all(req, 'data-requests', person),
    // The account whose own record this is, or the one the record is attached to.
    account: await all(
      req,
      'accounts',
      {
        or: [
          person,
          ...(idOf(record.account) !== undefined ? [{ id: { equals: idOf(record.account) } }] : []),
        ],
      },
      ACCOUNT_FIELDS,
    ),
  }
}

const escape = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/

/** One value as a person reads it: times in India, lists and groups spelt out. */
function shown(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'string' && ISO.test(value)) {
    const at = new Date(value)
    return `${formatIstDate(at)}, ${formatIstTime(at)} IST`
  }
  if (Array.isArray(value)) return value.length ? value.map(shown).join('; ') : '—'
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'id' && !key.endsWith('_tz'))
      .map(([key, inner]) => `${key}: ${shown(inner)}`)
      .join(', ')
  }
  return String(value)
}

/** The readable page: one section per kind, one list of fields per record. */
export function renderExportPage(data: PersonExport): string {
  const sections = EXPORT_SECTIONS.map(({ key, title }) => {
    const records = data[key]
    const body = records.length
      ? records
          .map(
            (record) =>
              `<dl>${Object.entries(record)
                .filter(([field]) => !field.endsWith('_tz'))
                .map(
                  ([field, value]) => `<dt>${escape(field)}</dt><dd>${escape(shown(value))}</dd>`,
                )
                .join('')}</dl>`,
          )
          .join('\n')
      : '<p>None.</p>'
    return `<section><h2>${escape(title)} (${records.length})</h2>\n${body}</section>`
  }).join('\n')
  const made = shown(data.generatedAt)
  return `<!doctype html>
<html lang="en-IN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Your data held by IIIC</title>
<style>body{font-family:system-ui,sans-serif;max-width:48rem;margin:2rem auto;padding:0 1rem;line-height:1.5}dl{display:grid;grid-template-columns:minmax(8rem,auto) 1fr;gap:.25rem 1rem;border-top:1px solid;padding-top:.5rem}dt{font-weight:600}dd{margin:0;overflow-wrap:anywhere}</style>
</head>
<body>
<h1>Your data held by IIIC</h1>
<p>Made on ${escape(made)}, in answer to your access request. Times are India Standard Time.</p>
${sections}
</body>
</html>
`
}

/** Where one request's export files live in the store. */
export const exportKeys = (id: number, at: Date) => {
  const stamp = at
    .toISOString()
    .replace(/[^0-9]/g, '')
    .slice(0, 14)
  const base = `privacy-exports/request-${id}/export-${stamp}`
  return { json: `${base}.json`, html: `${base}.html` }
}

/** The page's key beside a JSON export's key. */
export const pageKeyOf = (jsonKey: string) => jsonKey.replace(/\.json$/, '.html')

export type ExportPersonDataWith = (
  req: PayloadRequest,
  requestId: number,
) => Promise<Result<{ key: string }, ExportError>>

export function exportPersonDataWith(
  store: () => PrivateStore | null,
  clock: () => Date = () => new Date(),
): ExportPersonDataWith {
  return async (req, id) => {
    const refusal = viewRefusal(req.user, 'privacyDecision')
    if (refusal) return err({ code: 'refused', refusal })
    if (!codeEnteredRecently(req)) {
      return err({ code: 'refused', refusal: { status: 403, code: 'enter-code' } })
    }
    const parsed = requestId.safeParse(id)
    if (!parsed.success) return err({ code: 'invalid', issues: ['requestId: invalid'] })
    const request = await req.payload
      .findByID({
        collection: 'data-requests',
        id: parsed.data,
        depth: 0,
        disableErrors: true,
        overrideAccess: false,
        user: req.user,
        req,
      })
      .catch(() => null)
    const personId = idOf(request?.person)
    if (!request || personId === undefined) return err({ code: 'not-found' })
    if (request.type !== 'access' || request.status === 'closed') {
      return err({ code: 'not-now', status: request.status })
    }
    if (!request.verifiedAt) return err({ code: 'not-verified' })
    const target = store()
    if (!target) return err({ code: 'storage-missing' })

    const now = clock()
    const data = await gatherPersonData(req, personId, now)
    const keys = exportKeys(request.id, now)
    await target.put(keys.json, JSON.stringify(data, null, 2), 'application/json')
    await target.put(keys.html, renderExportPage(data), 'text/html; charset=utf-8')
    await req.payload.update({
      collection: 'data-requests',
      id: request.id,
      data: { exportKey: keys.json },
      depth: 0,
      overrideAccess: true,
      req,
      context: { auditAction: 'export-person-data' },
    })
    return ok({ key: keys.json })
  }
}

export const exportPersonData: ExportPersonData = exportPersonDataWith(privateStore)

export type ExportDownload = { body: Buffer; contentType: string; filename: string }

/**
 * An export's file for an owner to send: the JSON or the readable page. Every download writes
 * `download-export` first; if the entry fails, nothing is handed back.
 */
export async function downloadExportWith(
  store: () => PrivateStore | null,
  req: PayloadRequest,
  id: unknown,
  format: 'json' | 'html',
): Promise<Result<ExportDownload, ExportError>> {
  const refusal = viewRefusal(req.user, 'privacyDecision')
  if (refusal) return err({ code: 'refused', refusal })
  const parsed = requestId.safeParse(id)
  if (!parsed.success) return err({ code: 'invalid', issues: ['requestId: invalid'] })
  const request = await req.payload
    .findByID({
      collection: 'data-requests',
      id: parsed.data,
      depth: 0,
      disableErrors: true,
      overrideAccess: false,
      user: req.user,
      req,
    })
    .catch(() => null)
  const jsonKey = request?.exportKey
  if (!request || typeof jsonKey !== 'string' || !isSafeKey(jsonKey)) {
    return err({ code: 'not-found' })
  }
  const target = store()
  if (!target) return err({ code: 'storage-missing' })
  const key = format === 'json' ? jsonKey : pageKeyOf(jsonKey)
  await recordAudit(req, {
    action: 'download-export',
    entity: 'data-requests',
    entityId: request.id,
  })
  const body = await target.get(key)
  if (!body) return err({ code: 'not-found' })
  return ok({
    body,
    contentType: format === 'json' ? 'application/json' : 'text/html; charset=utf-8',
    filename: `iiic-data-request-${request.id}.${format}`,
  })
}

export const downloadExport = (req: PayloadRequest, id: unknown, format: 'json' | 'html') =>
  downloadExportWith(privateStore, req, id, format)
