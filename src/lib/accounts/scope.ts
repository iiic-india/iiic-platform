import 'server-only'

import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { createLocalReq, getPayload, type PayloadRequest, type Where } from 'payload'

import { getFlags } from '@/lib/settings/read'
import type { BookingsSelect, CertificatesSelect, InvoicesSelect } from '@/payload-types'
import config from '@payload-config'

import type {
  AccountActor,
  AccountSession,
  GetAccountSession,
  OwnPersonIds,
  RequireAccount,
  SignOut,
} from './contract'

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

// ---- The session (builder A's; docs/20 §3.5) ----
//
// STUB until builder A lands (docs/20 §13: "B and C build against a fake requireAccount until A
// lands"). Nobody is signed in here, so every My IIIC page sends the person to /login and nothing
// of anyone's is read. At the join the lead replaces this block with A's functions:
//
//   export { getAccountSession, requireAccount } from './session'
//   export { signOut } from '<A's module>'
//
// Nothing else in slice B imports A's modules, so this block is the whole seam.

export const getAccountSession: GetAccountSession = async () => null

export const requireAccount: RequireAccount = async (options) => {
  const next = options?.next?.startsWith('/account') ? options.next : null
  redirect(next ? `/login?next=${encodeURIComponent(next)}` : '/login')
}

export const signOut: SignOut = async () => {}

// ---- The door ----

/**
 * The first lines of every My IIIC page and route: the 404 while `accountsEnabled` is off
 * (docs/20 §4.9; D-122), then the session or the way to sign in (CLAUDE.md #6). Nothing is read
 * before both.
 */
export async function openMyIiic(next: string): Promise<AccountSession> {
  if (!(await getFlags()).accountsEnabled) notFound()
  return requireAccount({ next })
}

/**
 * The same door for a route handler, which answers with a response of its own: null while
 * `accountsEnabled` is off (the route answers 404), else the session or the way to sign in.
 */
export async function openMyIiicRoute(next: string): Promise<AccountSession | null> {
  if (!(await getFlags()).accountsEnabled) return null
  return requireAccount({ next })
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
