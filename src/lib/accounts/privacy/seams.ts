import 'server-only'

import { redirect } from 'next/navigation'
import type { PayloadRequest } from 'payload'

import { err } from '@/lib/result'

import type {
  CloseAccount,
  ConfirmDetail,
  GetAccountSession,
  ListDevices,
  OwnPersonIds,
  RequestDetailCode,
  RequireAccount,
  SignOut,
  SignOutEverywhere,
} from '../contract'

/**
 * What the privacy page calls in the other slices (docs/20 §13): builder A's sign-in, sessions and
 * the account's life, and builder B's `OwnPersonIds`. Slice C calls them only through this file,
 * so the join changes one import per function and nothing else in `src/lib/accounts/privacy`.
 *
 * Every A function here is a STUB until A lands, and each stub is the safe answer: no session
 * (every page and action under /account/privacy sends the person to /login), no devices, nothing
 * signed out, nothing closed, no code sent. The page therefore shows nobody's data before the
 * join. B's `OwnPersonIds` is written out in full, because the privacy functions' tests need the
 * attached records; at the join it gives way to B's `src/lib/accounts/scope.ts`.
 */

/** STUB (A, `src/lib/accounts/session.ts`): no session until A lands. */
export const getAccountSession: GetAccountSession = async () => null

/** STUB (A, `src/lib/accounts/session.ts`): without A there is no session, so always /login. */
export const requireAccount: RequireAccount = async () => redirect('/login')

/** STUB (A, `src/lib/accounts/auth`): ends this session and clears its cookies. */
export const signOut: SignOut = async () => {}

/** STUB (A): the account's sessions, by browser. */
export const listDevices: ListDevices = async () => []

/** STUB (A): ends every session but this one, audited as `sign-out-everywhere`. */
export const signOutEverywhere: SignOutEverywhere = async () => 0

/** STUB (A, `src/lib/accounts/lifecycle.ts`): closes the account (docs/20 §7.6). */
export const closeAccount: CloseAccount = async () => err({ code: 'not-found' })

/** STUB (A, `src/lib/accounts/details.ts`): a code for a second detail (docs/20 §4.6). */
export const requestDetailCode: RequestDetailCode = async () => err({ code: 'closed-here' })

/** STUB (A, `src/lib/accounts/details.ts`): the code that adds the second detail. */
export const confirmDetail: ConfirmDetail = async () => err({ code: 'no-request' })

/**
 * Whether codes on WhatsApp are open here (docs/20 §4.3: the channel, the authentication
 * template, quiet hours and the flag). STUB (A): the contract has no function for it, so slice C
 * offers "Add a mobile number" only once A exposes one; until then email only (D-126).
 */
export const whatsAppCodesOpen = async (): Promise<boolean> => false

/**
 * The account's records: its own and every earlier one attached through `people.account`
 * (docs/20 §6, §8). Written out here until B's `ownPersonIds` (src/lib/accounts/scope.ts)
 * replaces it at the join. Scoped to this account's own id; the own record always comes first.
 */
export const ownPersonIds: OwnPersonIds = async (req: PayloadRequest, account) => {
  const { docs } = await req.payload.find({
    collection: 'people',
    where: { account: { equals: account.accountId } },
    pagination: false,
    depth: 0,
    select: { account: true },
    overrideAccess: true,
    req,
  })
  return [...new Set([account.personId, ...docs.map((person) => person.id)])]
}
