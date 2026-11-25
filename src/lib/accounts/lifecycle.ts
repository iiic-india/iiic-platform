import 'server-only'

import type { PayloadRequest } from 'payload'

import { viewRefusal } from '@/access/views'
import { setAuditActor } from '@/lib/audit/actor'
import { recordAudit } from '@/lib/audit/record'
import { env } from '@/lib/env'
import { deliver } from '@/lib/messaging/deliver'
import { NEWSLETTER_PERSON_NAME } from '@/lib/newsletter/subscriptions'
import { evidenceOf, withdrawPurpose } from '@/lib/newsletter/withdrawals'
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

// scope: none of its own; each spread of SERVER below carries its own scope line (D-132)
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
    // scope: a count of the records holding the proven detail that say under 18; nothing of them is read
    overrideAccess: true,
    req,
  })
  return totalDocs > 0
}

/**
 * Whether a record carries a name the person gave: the newsletter's placeholder for a record it
 * made from an address alone ("Newsletter subscriber") is no name (CR-05; D-131).
 */
export const givenName = (fullName: string | null | undefined): boolean =>
  typeof fullName === 'string' && fullName.trim() !== '' && fullName !== NEWSLETTER_PERSON_NAME

/**
 * The newest adult record holding the detail that no account holds and that carries a name the
 * person gave: the name the account step offers, and the record the name typed is matched
 * against. A record named by the newsletter's placeholder is never offered (D-131).
 */
export async function newestRecord(
  req: PayloadRequest,
  channel: SignInChannel,
  value: string,
): Promise<{ id: number; fullName: string } | null> {
  const { field } = DETAIL_FIELDS[channel]
  const { docs } = await req.payload.find({
    collection: 'people',
    where: {
      and: [
        { [field]: { equals: value } },
        { account: { exists: false } },
        NOT_UNDER_18,
        { fullName: { not_equals: NEWSLETTER_PERSON_NAME } },
      ],
    },
    sort: '-createdAt',
    limit: 1,
    select: { fullName: true },
    req,
    // scope: adult records holding the detail this sign-in's code has just proven, with no account; the newest one's name only
    ...SERVER,
  })
  const found = docs[0]
  return found ? { id: found.id, fullName: found.fullName } : null
}

/**
 * The record that becomes the account's own (docs/20 §3.6, §4.5; D-131): one that already holds
 * the detail proven (the own record of an account closed earlier, whose markers stay, or a record
 * the newsletter made when the person confirmed the Journal), since only one record may hold a
 * detail proven (`oneVerifiedPerson`); else the newest earlier record holding it when its name is
 * the one the person gave; else none and a new record is made. A record with a name the person
 * gave is never renamed: when they give another, theirs is a new record and the earlier ones are
 * attached to it, for the office to merge if they are one person (docs/05, People). The
 * newsletter's placeholder is no name, so an adopted record that carries it takes the name typed
 * (`createAccountRecords`).
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
    // scope: the record holding the detail this sign-in's code has just proven, with its proven marker and no account
    ...SERVER,
  })
  if (docs[0]) return docs[0].id
  const newest = await newestRecord(req, channel, value)
  return newest && sameName(newest.fullName, fullName) ? newest.id : null
}

/**
 * The account step's records, in one Payload transaction (docs/20 §4.5, step 2; CLAUDE.md #4):
 * the own record (an earlier one, or a new one with the name given, written first because the
 * consent names its person), the account consent under the notice in force, the `accounts` row
 * with no Better Auth user yet, the proven marker, and `create-account` in the audit log. If any
 * write fails, all roll back, so no person is kept without the consent. Nothing here signs anyone
 * in: Better Auth's user and the session come after it commits.
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
          // scope: the new own record, made from the name typed and the detail just proven
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
      // scope: the account consent on that own record, under the notice the step showed
      ...SERVER,
    })
    const account = await req.payload.create({
      collection: 'accounts',
      data: { person: personId },
      req,
      // scope: the account row of that own record
      ...SERVER,
    })
    // From here on the account is the actor of every write on the request (D-133).
    setAuditActor(req, accountActor(account.id))
    const record = (await req.payload.findByID({
      collection: 'people',
      id: personId,
      select: { ageBand: true, fullName: true },
      req,
      // scope: that own record again; its age band and name only
      ...SERVER,
    })) as Pick<Person, 'ageBand' | 'fullName'>
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
        // An adopted record named only by the newsletter's placeholder takes the name the
        // person typed; a name a person gave is never changed (D-131).
        ...(givenName(record.fullName) ? {} : { fullName: input.fullName }),
      },
      req,
      // scope: that own record, linked to its new account with the detail's proven marker
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
    // scope: the own record of the account being closed, as its accounts row names it; its proven details only
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
    // scope: the account being closed, by its own id: the signed-in session's, or the one whose own record an owner's erasure erases
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
      // scope: the records attached to the account being closed, and no other
      ...SERVER,
    })
    for (const record of docs) {
      await req.payload.update({
        collection: 'people',
        id: record.id,
        data: { account: null },
        req,
        // scope: each of those records, its link to the closing account cleared
        ...SERVER,
      })
    }
    // Withdrawing the account consent is closing the account (D-113). An erasure has withdrawn
    // every consent already, in its own transaction. When the person closes it, the withdrawal
    // carries the same evidence as every other from the privacy page: the form, and the address
    // and the browser of the person's own request (`accountRequest`). A `staff` close withdraws
    // nothing today: nothing calls it, and the ledger takes no channel `web` from staff; it is
    // decided when something first does (docs/20 §7.6).
    if (reason === 'person') {
      await withdrawPurpose(
        req,
        { personId, purpose: 'account', channel: 'web', evidence: evidenceOf(req, 'My IIIC') },
        now,
      )
    }
    // scope: the closing account's own row
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
    // scope: the account whose own record the owner's erasure is erasing (H7), and no other
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
    // scope: the record that erasure is erasing; its account link only
    ...SERVER,
  })
  if (!record || idOf(record.account) === null) return { closed: 0, detached: 0 }
  await req.payload.update({
    collection: 'people',
    id: personId,
    data: { account: null },
    req,
    // scope: that same record, detached from the account it was attached to
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
    // scope: the account an owner acts on, after viewRefusal and the preview check above
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
 * booking?"). The account's own record cannot be detached: closing does that. The owner role and
 * the two-factor code first (CLAUDE.md #6); not on a preview, which shares production's database
 * and acts on nothing (D-122), as `endAccountSessions`.
 */
export const detachRecord: DetachRecord = async (req, personId) => {
  if (viewRefusal(req.user, 'accountActions')) return err({ code: 'refused' })
  if (deploymentGate(env()) === 'preview') return err({ code: 'refused' })
  const record = await req.payload.findByID({
    collection: 'people',
    id: personId,
    disableErrors: true,
    select: { account: true },
    req,
    // scope: the record an owner detaches, after viewRefusal and the preview check above; its account link only
    ...SERVER,
  })
  const accountId = record ? idOf(record.account) : null
  if (accountId === null) return err({ code: 'not-found' })
  const { totalDocs } = await req.payload.count({
    collection: 'accounts',
    where: { person: { equals: personId } },
    // scope: a count of the accounts whose own record this is, for an owner's act checked first by viewRefusal
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
      // scope: that record, detached by the owner from its account, which the count above showed is not its own
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
