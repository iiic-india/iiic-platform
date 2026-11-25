import type { CollectionAfterChangeHook, PayloadRequest, Where } from 'payload'

import { recordAudit } from '@/lib/audit/record'
import { env } from '@/lib/env'
import { inTransaction } from '@/lib/payments/store'
import { idOf } from '@/lib/privacy/consentLedger'

import type { AccountActor, AttachEarlierRecords, SignInChannel } from './contract'
import { deploymentGate } from './signIn/gate'

/**
 * Attaching earlier records (docs/03 F7: "A booking made without an account is attached to the
 * account with the same verified mobile or email"; docs/20 §6; D-120). M3 makes a new `people`
 * record for every booking, so a returning client has several. After a code proves a detail,
 * every record holding it that no account holds yet, and that does not say under 18, is linked
 * to the account through `people.account`: linked, never merged, and nothing in its bookings,
 * consents, payments, invoices or certificates rewritten. A record already attached to another
 * account stays there. One `attach-records` entry names how many; the audit plugin logs each
 * record's change by field name as well.
 *
 * Free of `server-only`: the `people` collection's create hook (below) is loaded by the Payload
 * CLI too.
 */

/** A customer's own acts are audited under the account, never an address (docs/20 §8). */
export const accountActor = (accountId: number): AccountActor => ({ id: `account:${accountId}` })

/** The `people` field that holds each channel's detail, and the marker of its being proven. */
export const DETAIL_FIELDS = {
  email: { field: 'email', verifiedAt: 'emailVerifiedAt' },
  whatsapp: { field: 'mobile', verifiedAt: 'mobileVerifiedAt' },
} as const satisfies Record<SignInChannel, { field: string; verifiedAt: string }>

/** The details of a record, as the account's own: those proven with a code. */
export type ProvenDetails = { email: string | null; mobile: string | null }

export function provenDetails(
  record: {
    email?: string | null
    mobile?: string | null
    emailVerifiedAt?: string | null
    mobileVerifiedAt?: string | null
  } | null,
): ProvenDetails {
  return {
    email: record?.emailVerifiedAt && record.email ? record.email : null,
    mobile: record?.mobileVerifiedAt && record.mobile ? record.mobile : null,
  }
}

/** Not a record that says under 18 (D-114); a record without an age band is an adult's booking. */
export const NOT_UNDER_18: Where = {
  or: [{ ageBand: { not_equals: 'under18' } }, { ageBand: { exists: false } }],
}

/** Links the records to the account in one transaction, with one audit entry. */
async function link(
  req: PayloadRequest,
  accountId: number,
  personIds: readonly number[],
  actor: AccountActor | null,
): Promise<void> {
  if (personIds.length === 0) return
  await inTransaction(req, async () => {
    for (const id of personIds) {
      await req.payload.update({
        collection: 'people',
        id,
        data: { account: accountId },
        // scope: the records just found holding this account's proven detail, or the one record the create hook was given
        overrideAccess: true,
        depth: 0,
        req,
      })
    }
    await recordAudit(
      req,
      {
        action: 'attach-records',
        entity: 'accounts',
        entityId: accountId,
        changed: [`records:${personIds.length}`],
      },
      actor,
    )
  })
}

/** The unattached adult records holding a detail. */
async function unattachedHolding(
  req: PayloadRequest,
  channel: SignInChannel,
  value: string,
): Promise<number[]> {
  const { field } = DETAIL_FIELDS[channel]
  const { docs } = await req.payload.find({
    collection: 'people',
    where: { and: [{ [field]: { equals: value } }, { account: { exists: false } }, NOT_UNDER_18] },
    pagination: false,
    depth: 0,
    select: { account: true },
    // scope: records holding the detail a code has just proven, with no account yet; nobody's records are returned to a person
    overrideAccess: true,
    req,
  })
  return docs.map((doc) => doc.id)
}

export const attachEarlierRecords: AttachEarlierRecords = async (req, input) => {
  const attached = await unattachedHolding(req, input.channel, input.value)
  await link(req, input.accountId, attached, accountActor(input.accountId))
  return { attached }
}

/**
 * The account that has verified a detail, if any: the account of the one record holding the
 * detail with its proven marker (the account's own record; `oneVerifiedPerson` keeps it to one).
 */
export async function accountVerifying(
  req: PayloadRequest,
  channel: SignInChannel,
  value: string,
): Promise<number | null> {
  const { field, verifiedAt } = DETAIL_FIELDS[channel]
  const { docs } = await req.payload.find({
    collection: 'people',
    where: {
      and: [
        { [field]: { equals: value } },
        { [verifiedAt]: { exists: true } },
        { account: { exists: true } },
      ],
    },
    limit: 1,
    depth: 0,
    select: { account: true },
    // scope: the one record holding this detail with its proven marker; only its account id is read
    overrideAccess: true,
    req,
  })
  const id = idOf(docs[0]?.account)
  return id === null ? null : Number(id)
}

/**
 * The `people` create hook (docs/20 §6): a record made later holding a detail an account has
 * verified (a booking made as a guest by a person with an account) joins that account at once,
 * so the booking shows in My IIIC. Not for a record that says under 18. The system attaches it,
 * so the entry has no actor. It stands down on a preview, as `endAccountSessions` does: a preview
 * shares production's database and acts on nothing (D-122), so a person added in a preview's
 * admin is not attached to a production account from there.
 */
export const attachNewRecord: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation !== 'create' || idOf(doc.account) !== null || doc.ageBand === 'under18') return doc
  if (deploymentGate(env()) === 'preview') return doc
  for (const channel of ['email', 'whatsapp'] as const) {
    const value = doc[DETAIL_FIELDS[channel].field]
    if (typeof value !== 'string' || value === '') continue
    const accountId = await accountVerifying(req, channel, value)
    if (accountId === null) continue
    await link(req, accountId, [doc.id], null)
    return { ...doc, account: accountId }
  }
  return doc
}
