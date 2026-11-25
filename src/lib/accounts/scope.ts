import 'server-only'

import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { createLocalReq, getPayload, type PayloadRequest, type Where } from 'payload'

import { readFlags } from '@/lib/settings/source'
import type { BookingsSelect, CertificatesSelect, InvoicesSelect } from '@/payload-types'
import config from '@payload-config'

import type { AccountActor, AccountSession, OwnPersonIds } from './contract'
import { getAccountSession, requireAccount, signOut } from './session'

/**
 * Who is asking, and what they may read (docs/20 §8; D-127). Every My IIIC page, action and route
 * starts here: the flag, then the session, then the account's own `people` records, and every
 * read of a person's records in this folder goes through the scoped readers below, which add
 * "the record is one of the account's" to every query. A record of anyone else is answered
 * exactly as one that does not exist.
 *
 * `overrideAccess: true` appears in `src/lib/accounts/**` only behind such a scope: each one
 * carries a `// scope:` line naming what keeps it to the account, and
 * tests/unit/accountsScope.spec.ts fails on one without it.
 */

// ---- The session (docs/20 §3.5) ----
//
// Slice A's own functions from ./session, imported above for the door below and passed on to
// My IIIC's pages, layout and actions, so that every one of them shares A's request-cached
// getAccountSession. This is the whole seam between slices A and B.

export { getAccountSession, requireAccount, signOut }

// ---- The door ----

/**
 * Whether `accountsEnabled` is on, read from the settings at this request, as A's sign-in and
 * session read it (src/lib/accounts/session.ts). Never the site's cached flags
 * (src/lib/settings/read.ts): a change that did not reach that cache would leave My IIIC the 404
 * after a good sign-in, or open after it was switched off.
 */
export async function accountsOn(): Promise<boolean> {
  return (await readFlags(await getPayload({ config }))).accountsEnabled
}

/**
 * The first lines of every My IIIC page and route: the 404 while `accountsEnabled` is off
 * (docs/20 §4.9; D-122), then the session or the way to sign in (CLAUDE.md #6). Nothing is read
 * before both.
 */
export async function openMyIiic(next: string): Promise<AccountSession> {
  if (!(await accountsOn())) notFound()
  return requireAccount({ next })
}

/** What a My IIIC route sends besides its body: never cached, never indexed, no referrer. */
export const PRIVATE_FILE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex',
  'X-Content-Type-Options': 'nosniff',
} as const

/**
 * The same door for a route handler (a file to download), which answers with a response of its
 * own and never a cached one: the 404 while `accountsEnabled` is off, a 303 to /login (with the
 * page to come back to) for nobody signed in, else the session.
 */
export async function openMyIiicRoute(next: string): Promise<AccountSession | Response> {
  if (!(await accountsOn())) {
    return new Response('Not found', { status: 404, headers: PRIVATE_FILE_HEADERS })
  }
  const account = await getAccountSession()
  if (account) return account
  return new Response(null, {
    status: 303,
    headers: {
      ...PRIVATE_FILE_HEADERS,
      Location: next.startsWith('/account') ? `/login?next=${encodeURIComponent(next)}` : '/login',
    },
  })
}

/** The audit log's actor for a customer's own act: the account, never an address (docs/20 §8). */
export function accountActor(account: Pick<AccountSession, 'accountId'>): AccountActor {
  return { id: `account:${account.accountId}` }
}

/**
 * A request of the account's own for the scoped readers: no Payload user (customers are not
 * staff, D-127), and of the browser's headers only the network address, which the audit log
 * keeps beside a download (src/lib/audit/record.ts). The cookies stay out of it.
 */
export async function accountRequest(): Promise<PayloadRequest> {
  const incoming = await headers()
  const kept = new Headers()
  for (const name of ['x-forwarded-for', 'x-real-ip']) {
    const value = incoming.get(name)
    if (value) kept.set(name, value)
  }
  return createLocalReq({ req: { headers: kept } }, await getPayload({ config }))
}

// ---- The account's records ----

const idOf = (value: unknown): number | null =>
  typeof value === 'number'
    ? value
    : value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'number'
      ? (value as { id: number }).id
      : null

/** The account's own record (docs/20 §3.6), from its `accounts` row; null when the account is gone. */
async function ownRecordId(
  req: PayloadRequest,
  account: Pick<AccountSession, 'accountId'>,
): Promise<number | null> {
  // scope: the account's own row, by the id of the signed-in session's account.
  const row = await req.payload.findByID({
    collection: 'accounts',
    id: account.accountId,
    select: { person: true },
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
  return row ? idOf(row.person) : null
}

/** The first word of the name on the account's own record, for the overview's heading. */
export async function ownFirstName(
  req: PayloadRequest,
  account: Pick<AccountSession, 'accountId'>,
): Promise<string | null> {
  const own = await ownRecordId(req, account)
  if (own === null) return null
  // scope: the account's own record, found through its own row just above; the name only.
  const person = await req.payload.findByID({
    collection: 'people',
    id: own,
    select: { fullName: true },
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
  return person?.fullName?.trim().split(/\s+/)[0] || null
}

/**
 * The `people` records this account holds (docs/20 §3.6, §6): its own record, read from the
 * `accounts` row rather than taken from the session, and every record attached to it through
 * `people.account`. Empty when the account is gone, so nothing can be read.
 */
export const ownPersonIds: OwnPersonIds = async (req, account) => {
  const own = await ownRecordId(req, account)
  if (own === null) return []
  // scope: the records attached to this account and to no other (people.account).
  const attached = await req.payload.find({
    collection: 'people',
    where: { account: { equals: account.accountId } },
    // The id comes with every row; the link is the one field asked for.
    select: { account: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })
  return [...new Set([own, ...attached.docs.map((person) => person.id)])].sort((a, b) => a - b)
}

/** "The record is one of the account's", added to every query below. */
export function ownedBy(field: string, personIds: readonly number[]): Where {
  return { [field]: { in: [...personIds] } }
}

const and = (scope: Where, where?: Where): Where => (where ? { and: [scope, where] } : scope)

/**
 * The account's bookings (each one's client is one of its records), with the fields asked for.
 * No records, no query.
 */
export async function findOwnBookings<S extends BookingsSelect<true>>(
  req: PayloadRequest,
  personIds: readonly number[],
  query: { select: S; where?: Where; sort?: string; limit?: number },
) {
  if (!personIds.length) return []
  // scope: the bookings whose client is one of the account's records (ownedBy).
  const { docs } = await req.payload.find({
    collection: 'bookings',
    where: and(ownedBy('person', personIds), query.where),
    select: query.select,
    sort: query.sort,
    limit: query.limit ?? 200,
    depth: 0,
    overrideAccess: true,
    req,
  })
  return docs
}

/** The account's certificates (each one's person is one of its records). */
export async function findOwnCertificates<S extends CertificatesSelect<true>>(
  req: PayloadRequest,
  personIds: readonly number[],
  query: { select: S; where?: Where; sort?: string; limit?: number },
) {
  if (!personIds.length) return []
  // scope: the certificates whose person is one of the account's records (ownedBy).
  const { docs } = await req.payload.find({
    collection: 'certificates',
    where: and(ownedBy('person', personIds), query.where),
    select: query.select,
    sort: query.sort,
    limit: query.limit ?? 200,
    depth: 0,
    overrideAccess: true,
    req,
  })
  return docs
}

/**
 * The account's invoices and credit notes: those of a booking whose client is one of its records
 * (docs/20 §7.4). The bookings are read through the scope first; an invoice of no booking (an
 * engagement's) is not the account's to see.
 */
export async function findOwnInvoices<S extends InvoicesSelect<true>>(
  req: PayloadRequest,
  personIds: readonly number[],
  query: { select: S; where?: Where; sort?: string; limit?: number },
) {
  const bookings = await findOwnBookings(req, personIds, {
    select: { reference: true },
    limit: 1000,
  })
  const bookingIds = bookings.map((booking) => booking.id)
  if (!bookingIds.length) return []
  // scope: the invoices of the account's own bookings, read through findOwnBookings just above.
  const { docs } = await req.payload.find({
    collection: 'invoices',
    where: and({ booking: { in: bookingIds } }, query.where),
    select: query.select,
    sort: query.sort,
    limit: query.limit ?? 200,
    depth: 0,
    overrideAccess: true,
    req,
  })
  return docs
}
