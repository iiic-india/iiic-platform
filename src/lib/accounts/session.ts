import 'server-only'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload, type Payload, type PayloadRequest } from 'payload'
import { cache } from 'react'

import { recordAudit } from '@/lib/audit/record'
import { env } from '@/lib/env'
import { idOf } from '@/lib/privacy/consentLedger'
import { readFlags } from '@/lib/settings/source'
import type { Person } from '@/payload-types'
import config from '@payload-config'

import { accountActor, provenDetails } from './attach'
import { customerAuthFor, type CustomerAuth } from './auth/instance'
import {
  SIGN_IN,
  type AccountSession,
  type DeviceSession,
  type GetAccountSession,
  type ListDevices,
  type RequireAccount,
  type SignOut,
  type SignOutEverywhere,
} from './contract'
import { safeNext } from './signIn/cookie'
import { deviceName } from './signIn/device'
import { deploymentGate } from './signIn/gate'

/**
 * Reading the signed-in customer in App Router code (docs/20 §3.5, §4.7). Customers are never
 * Payload's `req.user`: a page or action under /account asks `requireAccount()` first (CLAUDE.md
 * #6) and passes the `AccountSession` to the functions that read its own records (docs/20 §8).
 * Server components read and never write a cookie, which is why sessions do not slide.
 */

/** A session longer than a day was started on a device the person chose to keep (D-115). */
const UNTRUSTED_MS = SIGN_IN.untrustedSessionHours * 60 * 60 * 1000

const asDate = (value: unknown): Date => new Date(value as string | Date)

/**
 * The session these headers carry, as the platform knows it: Better Auth's session, then the
 * account that holds its user, then the account's own record. A Better Auth user with no account
 * row is no session (the account step was not finished, docs/20 §4.5).
 */
export async function sessionFrom(
  payload: Payload,
  auth: CustomerAuth,
  requestHeaders: Headers,
): Promise<AccountSession | null> {
  const found = await auth.api.getSession({ headers: requestHeaders })
  if (!found) return null
  const { docs } = await payload.find({
    collection: 'accounts',
    where: { authUserId: { equals: found.user.id } },
    limit: 1,
    depth: 0,
    select: { person: true },
    overrideAccess: true,
  })
  const account = docs[0]
  if (!account) return null
  const personId = Number(idOf(account.person))
  const record = (await payload.findByID({
    collection: 'people',
    id: personId,
    depth: 0,
    disableErrors: true,
    select: { email: true, mobile: true, emailVerifiedAt: true, mobileVerifiedAt: true },
    overrideAccess: true,
  })) as Pick<Person, 'email' | 'mobile' | 'emailVerifiedAt' | 'mobileVerifiedAt'> | null
  if (!record) return null
  const signedInAt = asDate(found.session.createdAt)
  const expiresAt = asDate(found.session.expiresAt)
  return {
    accountId: account.id,
    personId,
    authUserId: found.user.id,
    sessionId: found.session.id,
    signedInAt,
    expiresAt,
    trustedDevice: expiresAt.getTime() - signedInAt.getTime() > UNTRUSTED_MS + 60_000,
    verified: provenDetails(record),
  }
}

/**
 * The session of this request, or null: a preview, sign-in not set up or switched off, no
 * cookie, a session expired or revoked, an account gone. A preview is answered from the
 * environment alone, without reading anything (D-122). Cached for the request.
 */
export const getAccountSession: GetAccountSession = cache(async () => {
  const settings = env()
  if (deploymentGate(settings) !== 'open') return null
  const payload = await getPayload({ config })
  if (!(await readFlags(payload)).accountsEnabled) return null
  const auth = customerAuthFor(payload, settings)
  if (!auth) return null
  return sessionFrom(payload, auth, await headers())
})

/** Where to sign in, keeping `next` when it is a path under /account. */
export function loginPath(next?: string, again = false): string {
  const kept = safeNext(next)
  const query = new URLSearchParams({
    ...(kept ? { next: kept } : {}),
    ...(again ? { again: '1' } : {}),
  }).toString()
  return query ? `/login?${query}` : '/login'
}

/** Whether a session began within the last `minutes` (D-121). */
export function signedInWithin(session: AccountSession, minutes: number, now: Date): boolean {
  return now.getTime() - session.signedInAt.getTime() <= minutes * 60 * 1000
}

export const requireAccount: RequireAccount = async (options = {}) => {
  const session = await getAccountSession()
  if (!session) redirect(loginPath(options.next))
  if (
    options.recentMinutes !== undefined &&
    !signedInWithin(session, options.recentMinutes, new Date())
  ) {
    redirect(loginPath(options.next, true))
  }
  return session
}

async function authOrNull(): Promise<CustomerAuth | null> {
  if (deploymentGate(env()) !== 'open') return null
  return customerAuthFor(await getPayload({ config }))
}

/** Every session of the account, newest first, each named by its browser and system only. */
export const listDevices: ListDevices = async (account) => {
  const auth = await authOrNull()
  if (!auth) return []
  const sessions = await auth.api.listSessions({ headers: await headers() })
  return sessions
    .filter((session) => session.userId === account.authUserId)
    .map((session): DeviceSession => ({
      id: session.id,
      current: session.id === account.sessionId,
      signedInAt: asDate(session.createdAt),
      expiresAt: asDate(session.expiresAt),
      trustedDevice:
        asDate(session.expiresAt).getTime() - asDate(session.createdAt).getTime() >
        UNTRUSTED_MS + 60_000,
      device: deviceName(session.userAgent),
    }))
    .sort((a, b) => b.signedInAt.getTime() - a.signedInAt.getTime())
}

/** Ends this session and clears its cookies (from a server action, which may write them). */
export const signOut: SignOut = async () => {
  const auth = await authOrNull()
  if (!auth) return
  await auth.api.signOut({ headers: await headers() })
}

/** Ends every other session of the account; audited as `sign-out-everywhere`. */
export const signOutEverywhere: SignOutEverywhere = async (req: PayloadRequest, account) => {
  const auth = await authOrNull()
  if (!auth) return 0
  const requestHeaders = await headers()
  const others = (await auth.api.listSessions({ headers: requestHeaders })).filter(
    (session) => session.userId === account.authUserId && session.id !== account.sessionId,
  ).length
  await auth.api.revokeOtherSessions({ headers: requestHeaders })
  await recordAudit(
    req,
    {
      action: 'sign-out-everywhere',
      entity: 'accounts',
      entityId: account.accountId,
      changed: [`sessions:${others}`],
    },
    accountActor(account.accountId),
  )
  return others
}
