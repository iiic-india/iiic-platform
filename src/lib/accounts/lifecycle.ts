import 'server-only'

import type { PayloadRequest } from 'payload'

import { viewRefusal } from '@/access/views'
import { recordAudit } from '@/lib/audit/record'
import { env } from '@/lib/env'
import { deliver } from '@/lib/messaging/deliver'
import { withdrawPurpose } from '@/lib/newsletter/withdrawals'
import { inTransaction } from '@/lib/payments/store'
import { idOf } from '@/lib/privacy/consentLedger'
import { err, ok } from '@/lib/result'
import { DEFAULT_LANGUAGE } from '@/lib/site/languages'
import { IST } from '@/lib/time/ist'
import type { Person } from '@/payload-types'

import {
  accountActor,
  DETAIL_FIELDS,
  NOT_UNDER_18,
  provenDetails,
  type ProvenDetails,
} from './attach'
import { customerAuthFor } from './auth/instance'
import type {
  CloseAccount,
  CloseAccountsOfPerson,
  CloseReason,
  DetachRecord,
  EndAccountSessions,
  SignInChannel,
} from './contract'
import { deploymentGate } from './signIn/gate'

/**
 * The account's life (docs/20 §4.5, §4.7, §6, §7.6; builder A): making an account's records after
 * the account consent, closing an account, closing the accounts of a person being erased, and an
 * owner's acts on an account from the admin (ending its sessions, detaching a record). Payload's
 * records change in one transaction; Better Auth's user is removed first, on its own connection,
 * so that a closing account never keeps a working session, and a closing that fails part-way is
 * finished by the next sign-in.
 */

const SERVER = { overrideAccess: true, depth: 0 } as const

const sameName = (a: string, b: string) =>
  a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase()

/** Whether any record of this detail says under 18 (D-114): no account for the address. */
export async function under18Holds(
  req: PayloadRequest,
  channel: SignInChannel,
  value: string,
): Promise<boolean> {
  const { field } = DETAIL_FIELDS[channel]
  const { totalDocs } = await req.payload.count({
    collection: 'people',
    where: { and: [{ [field]: { equals: value } }, { ageBand: { equals: 'under18' } }] },
    overrideAccess: true,
    req,
  })
  return totalDocs > 0
}

/** The newest adult record holding the detail that no account holds: the name it offers. */
export async function newestRecord(
  req: PayloadRequest,
  channel: SignInChannel,
  value: string,
): Promise<{ id: number; fullName: string } | null> {
  const { field } = DETAIL_FIELDS[channel]
  const { docs } = await req.payload.find({
    collection: 'people',
    where: { and: [{ [field]: { equals: value } }, { account: { exists: false } }, NOT_UNDER_18] },
    sort: '-createdAt',
    limit: 1,
    select: { fullName: true },
    req,
    ...SERVER,
  })
  const found = docs[0]
  return found ? { id: found.id, fullName: found.fullName } : null
}

/**
 * The record that becomes the account's own (docs/20 §3.6, §4.5): one that already holds the
 * detail proven (the own record of an account closed earlier, whose markers stay), else the
 * newest earlier record holding it when its name is the one the person gave, else none and a new
 * record is made. A record is never renamed: when the person gives another name, theirs is a new
 * record and the earlier ones are attached to it, for the office to merge if they are one person
 * (docs/05, People).
 */
async function ownRecordFor(
  req: PayloadRequest,
  channel: SignInChannel,
  value: string,
  fullName: string,
): Promise<number | null> {
  const { field, verifiedAt } = DETAIL_FIELDS[channel]
  const { docs } = await req.payload.find({
    collection: 'people',
    where: {
      and: [
        { [field]: { equals: value } },
        { [verifiedAt]: { exists: true } },
        { account: { exists: false } },
      ],
    },
    limit: 1,
    select: { account: true },
    req,
    ...SERVER,
  })
  if (docs[0]) return docs[0].id
  const newest = await newestRecord(req, channel, value)
  return newest && sameName(newest.fullName, fullName) ? newest.id : null
}

/**
 * The account step's records, in one Payload transaction (docs/20 §4.5, step 2; CLAUDE.md #4):
 * the account consent under the notice in force, the own record (an earlier one, or a new one
 * with the name given), the `accounts` row with no Better Auth user yet, the proven marker, and
 * `create-account` in the audit log. Nothing here signs anyone in: Better Auth's user and the
 * session come after it commits.
 */
export async function createAccountRecords(
  req: PayloadRequest,
  input: {
    channel: SignInChannel
    value: string
    fullName: string
    noticeVersionId: number
    evidence: { ip: string | null; userAgent: string | null }
    now: Date
  },
): Promise<{ accountId: number; personId: number }> {
  const at = input.now.toISOString()
  return inTransaction(req, async () => {
    const existing = await ownRecordFor(req, input.channel, input.value, input.fullName)
    const personId =
      existing ??
      (
        await req.payload.create({
          collection: 'people',
          data: {
            fullName: input.fullName,
            ...(input.channel === 'email' ? { email: input.value } : { mobile: input.value }),
            language: DEFAULT_LANGUAGE,
            source: 'My IIIC',
            ageBand: 'adult',
          },
          req,
          ...SERVER,
        })
      ).id
    await req.payload.create({
      collection: 'consents',
      data: {
        person: personId,
        noticeVersion: input.noticeVersionId,
        purpose: 'account',
        language: DEFAULT_LANGUAGE,
        grantedAt: at,
        grantedAt_tz: IST,
        channel: 'web',
        evidence: {
          form: '/login/verify',
          ...(input.evidence.ip ? { ip: input.evidence.ip.slice(0, 500) } : {}),
          ...(input.evidence.userAgent
            ? { userAgent: input.evidence.userAgent.slice(0, 500) }
            : {}),
        },
      },
      req,
      ...SERVER,
    })
    const account = await req.payload.create({
      collection: 'accounts',
      data: { person: personId },
      req,
      ...SERVER,
    })
    const record = (await req.payload.findByID({
      collection: 'people',
      id: personId,
      select: { ageBand: true },
      req,
      ...SERVER,
    })) as Pick<Person, 'ageBand'>
    await req.payload.update({
      collection: 'people',
      id: personId,
      data: {
        account: account.id,
        ...(input.channel === 'email'
          ? { emailVerifiedAt: at, emailVerifiedAt_tz: IST }
          : { mobileVerifiedAt: at, mobileVerifiedAt_tz: IST }),
        // The person said they are 18 or older (D-114); a band the office set stays.
        ...(record.ageBand ? {} : { ageBand: 'adult' as const }),
      },
      req,
      ...SERVER,
    })
    await recordAudit(
      req,
      { action: 'create-account', entity: 'accounts', entityId: account.id },
      accountActor(account.id),
    )
    return { accountId: account.id, personId }
  })
}

/** Removes Better Auth's user (its sessions and identities go with it) and its details' codes. */
async function removeSignIn(
  req: PayloadRequest,
  authUserId: string | null | undefined,
  details: ProvenDetails,
): Promise<void> {
  const auth = customerAuthFor(req.payload)
  if (!auth) return
  if (authUserId) {
    const context = await auth.$context
    await context.internalAdapter.deleteUser(authUserId)
  }
  const forget = async (channel: SignInChannel, value: string | null) => {
    if (!value) return
    for (const purpose of ['signIn', 'addDetail'] as const) {
      await auth.api.forgetCode({ body: { purpose, channel, value } })
    }
  }
  await forget('email', details.email)
  await forget('whatsapp', details.mobile)
}

/** The account's own record, with its proven details. */
async function ownRecordOf(req: PayloadRequest, personId: number) {
  return (await req.payload.findByID({
    collection: 'people',
    id: personId,
    disableErrors: true,
    select: { email: true, mobile: true, emailVerifiedAt: true, mobileVerifiedAt: true },
    req,
    ...SERVER,
  })) as Pick<Person, 'email' | 'mobile' | 'emailVerifiedAt' | 'mobileVerifiedAt'> | null
}

async function close(
  req: PayloadRequest,
  accountId: number,
  reason: CloseReason,
  now: Date,
): Promise<boolean> {
  const account = await req.payload.findByID({
    collection: 'accounts',
    id: accountId,
    disableErrors: true,
    select: { person: true, authUserId: true },
    req,
    ...SERVER,
  })
  if (!account) return false
  const personId = Number(idOf(account.person))
  const details = provenDetails(await ownRecordOf(req, personId))
  // First: no session of this account works from here on.
  await removeSignIn(req, account.authUserId, details)
  await inTransaction(req, async () => {
    const { docs } = await req.payload.find({
      collection: 'people',
      where: { account: { equals: accountId } },
      pagination: false,
      select: { account: true },
      req,
      ...SERVER,
    })
    for (const record of docs) {
      await req.payload.update({
        collection: 'people',
        id: record.id,
        data: { account: null },
        req,
        ...SERVER,
      })
    }
    // Withdrawing the account consent is closing the account (D-113). An erasure has withdrawn
    // every consent already, in its own transaction; an owner who closes an account at the
    // person's request records that request's withdrawal in the ledger with its evidence.
    if (reason === 'person') {
      await withdrawPurpose(
        req,
        {
          personId,
          purpose: 'account',
          channel: 'web',
          evidence: { form: 'My IIIC' },
        },
        now,
      )
    }
    await req.payload.delete({ collection: 'accounts', id: accountId, req, ...SERVER })
    await recordAudit(
      req,
      { action: 'close-account', entity: 'accounts', entityId: accountId, changed: [reason] },
      reason === 'person' ? accountActor(accountId) : undefined,
    )
  })
  // A2: the person closed it themselves, and has an email proven to write to.
  if (reason === 'person' && details.email) {
    const planned = await deliver(req, {
      automation: 'A2',
      template: 'account-closed',
      channel: 'email',
      recipient: { kind: 'person', id: personId },
      subject: { collection: 'accounts', id: accountId },
      sendAt: now,
    })
    if (!planned.ok) {
      req.payload.logger.warn({ msg: `accounts: A2 not planned (${planned.error.code})` })
    }
  }
  return true
}

export const closeAccount: CloseAccount = async (req, input) =>
  (await close(req, input.accountId, input.reason, new Date()))
    ? ok({ closed: true })
    : err({ code: 'not-found' })

/**
 * For the erasure an owner confirms, in its transaction (src/lib/privacy/erasure.ts, H7): the
 * account whose own record is being erased closes (no A2), and the record leaves any other
 * account it is attached to.
 */
export const closeAccountsOfPerson: CloseAccountsOfPerson = async (req, personId) => {
  const { docs } = await req.payload.find({
    collection: 'accounts',
    where: { person: { equals: personId } },
    limit: 1,
    select: { person: true },
    req,
    ...SERVER,
  })
  if (docs[0]) {
    await close(req, docs[0].id, 'erasure', new Date())
    return { closed: 1, detached: 0 }
  }
  const record = await req.payload.findByID({
    collection: 'people',
    id: personId,
    disableErrors: true,
    select: { account: true },
    req,
    ...SERVER,
  })
  if (!record || idOf(record.account) === null) return { closed: 0, detached: 0 }
  await req.payload.update({
    collection: 'people',
    id: personId,
    data: { account: null },
    req,
    ...SERVER,
  })
  await recordAudit(req, { action: 'detach-record', entity: 'people', entityId: personId })
  return { closed: 0, detached: 1 }
}

/**
 * An owner ends every session of an account from its record (D-125): the owner role and the
 * two-factor code first (CLAUDE.md #6), then the account. Not on a preview, which acts on
 * nothing (D-122).
 */
export const endAccountSessions: EndAccountSessions = async (req, accountId) => {
  if (viewRefusal(req.user, 'accountActions')) return err({ code: 'refused' })
  if (deploymentGate(env()) === 'preview') return err({ code: 'refused' })
  const account = await req.payload.findByID({
    collection: 'accounts',
    id: accountId,
    disableErrors: true,
    select: { authUserId: true },
    req,
    ...SERVER,
  })
  if (!account) return err({ code: 'not-found' })
  let ended = 0
  const auth = customerAuthFor(req.payload)
  if (auth && account.authUserId) {
    const context = await auth.$context
    ended = (await context.internalAdapter.listSessions(account.authUserId)).length
    await context.internalAdapter.deleteUserSessions(account.authUserId)
  }
  await recordAudit(req, {
    action: 'end-account-sessions',
    entity: 'accounts',
    entityId: accountId,
    changed: [`sessions:${ended}`],
  })
  return ok({ ended })
}

/**
 * An owner detaches an earlier record the person says is not theirs (D-120; "Not your
 * booking?"). The account's own record cannot be detached: closing does that.
 */
export const detachRecord: DetachRecord = async (req, personId) => {
  if (viewRefusal(req.user, 'accountActions')) return err({ code: 'refused' })
  const record = await req.payload.findByID({
    collection: 'people',
    id: personId,
    disableErrors: true,
    select: { account: true },
    req,
    ...SERVER,
  })
  const accountId = record ? idOf(record.account) : null
  if (accountId === null) return err({ code: 'not-found' })
  const { totalDocs } = await req.payload.count({
    collection: 'accounts',
    where: { person: { equals: personId } },
    overrideAccess: true,
    req,
  })
  if (totalDocs > 0) return err({ code: 'own-record' })
  await inTransaction(req, async () => {
    await req.payload.update({
      collection: 'people',
      id: personId,
      data: { account: null },
      req,
      ...SERVER,
    })
    await recordAudit(req, {
      action: 'detach-record',
      entity: 'people',
      entityId: personId,
      changed: [`account:${accountId}`],
    })
  })
  return ok({ detached: true })
}
