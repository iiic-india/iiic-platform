import { sql } from '@payloadcms/db-postgres'
import { createLocalReq, getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { Person } from '@/payload-types'

// Attaching earlier records (docs/03 F7; docs/20 §6; D-120), against the real database: the
// records holding the proven detail join the account, others do not; a record of another account
// is never moved; a record that says under 18 never joins; a record made later joins through the
// `people` create hook; nothing in a record's consents is rewritten; one audit entry names how
// many. And the owner's detach, and the erasure's hook (H7). Needs the r2a_accounts migration.
// Obviously fake people and addresses, removed at the end; no staff user is made.

vi.mock('server-only', () => ({}))

const { default: config } = await import('@/payload.config')
const { attachEarlierRecords } = await import('@/lib/accounts/attach')
const { closeAccountsOfPerson, createAccountRecords, detachRecord } =
  await import('@/lib/accounts/lifecycle')
const { currentNotice } = await import('@/lib/privacy/consents')

const TAG = 'int.accounts-attach'
const RUN = Date.now().toString(36)
const SHARED = `${TAG}.shared.${RUN}@fake.example.invalid`
const OTHER = `${TAG}.other.${RUN}@fake.example.invalid`
const NOTICE_TEXT = `Fake account notice for tests (${TAG}): keep my My IIIC account.`

let payload: Payload
let jobsBefore = 0
const accounts: number[] = []

const SERVER = { overrideAccess: true, depth: 0 } as const

async function person(
  name: string,
  data: { email?: string; ageBand?: 'under18' | 'adult' } = {},
): Promise<Person> {
  return (await payload.create({
    collection: 'people',
    data: { fullName: `Fake ${TAG} ${name}`, ...data } as never,
    ...SERVER,
  })) as Person
}

const accountOf = async (id: number) => {
  const record = (await payload.findByID({ collection: 'people', id, ...SERVER })) as Person
  return typeof record.account === 'object'
    ? (record.account?.id ?? null)
    : (record.account ?? null)
}

async function noticeId(): Promise<number> {
  const found = await currentNotice(payload, 'account', 'en-IN')
  if (found) return found.id
  const made = await payload.create({
    collection: 'consent-versions',
    data: {
      purpose: 'account',
      language: 'en-IN',
      text: NOTICE_TEXT,
      effectiveFrom: new Date(Date.now() - 86_400_000).toISOString(),
      effectiveFrom_tz: 'Asia/Kolkata',
    } as never,
    ...SERVER,
  })
  return made.id
}

const owner = (roles: string[], strategy = 'totp') =>
  createLocalReq(
    {
      user: { id: 999_002, collection: 'users', roles, active: true, _strategy: strategy } as never,
    },
    payload,
  )

async function newAccount(email: string, name: string) {
  const made = await createAccountRecords(await createLocalReq({}, payload), {
    channel: 'email',
    value: email,
    fullName: `Fake ${TAG} ${name}`,
    noticeVersionId: await noticeId(),
    evidence: { ip: null, userAgent: null },
    now: new Date(),
  })
  accounts.push(made.accountId)
  return made
}

beforeAll(async () => {
  payload = await getPayload({ config })
  const result = await payload.db.drizzle.execute(
    sql`SELECT COALESCE(MAX("id"), 0) AS "max" FROM "payload_jobs"`,
  )
  jobsBefore = Number((result as unknown as { rows: { max: number }[] }).rows[0]?.max ?? 0)
})

afterAll(async () => {
  if (accounts.length) {
    await payload.delete({ collection: 'accounts', where: { id: { in: accounts } }, ...SERVER })
  }
  await payload.delete({ collection: 'people', where: { fullName: { like: TAG } }, ...SERVER })
  await payload.db.drizzle.execute(sql`DELETE FROM "payload_jobs" WHERE "id" > ${jobsBefore}`)
})

describe('attaching earlier records', () => {
  it('attaches the records holding the proven detail, and only those', async () => {
    const first = await person('first booking', { email: SHARED, ageBand: 'adult' })
    const second = await person('second booking', { email: SHARED })
    const elsewhere = await person('other address', { email: OTHER })
    const minor = await person('a child', { email: SHARED, ageBand: 'under18' })
    const { accountId: otherAccount } = await newAccount(OTHER, 'other holder')
    // A record of another account (attached by its mobile, say) stays there.
    const held = await person('held elsewhere', { email: SHARED })
    await payload.update({
      collection: 'people',
      id: held.id,
      data: { account: otherAccount },
      ...SERVER,
    })
    const consent = await payload.create({
      collection: 'consents',
      data: {
        person: first.id,
        noticeVersion: await noticeId(),
        purpose: 'account',
        language: 'en-IN',
        grantedAt: new Date(Date.now() - 60_000).toISOString(),
        channel: 'web',
        evidence: { form: `${TAG} fake form` },
      } as never,
      ...SERVER,
    })

    const { accountId, personId } = await newAccount(SHARED, 'the holder')
    const req = await createLocalReq({}, payload)
    const { attached } = await attachEarlierRecords(req, {
      accountId,
      channel: 'email',
      value: SHARED,
    })
    expect([...attached].sort()).toEqual([first.id, second.id].sort())
    expect(await accountOf(first.id)).toBe(accountId)
    expect(await accountOf(second.id)).toBe(accountId)
    expect(await accountOf(personId)).toBe(accountId)
    // Another address is another person's: no account proved it, and this one did not.
    expect(await accountOf(elsewhere.id)).toBeNull()
    expect(await accountOf(held.id)).toBe(otherAccount)
    expect(await accountOf(minor.id)).toBeNull()

    // Linked, never rewritten: the earlier record's consent is as it was.
    const after = await payload.findByID({ collection: 'consents', id: consent.id, ...SERVER })
    expect(after.updatedAt).toBe(consent.updatedAt)
    expect(after.person).toBe(first.id)
    const record = (await payload.findByID({
      collection: 'people',
      id: first.id,
      ...SERVER,
    })) as Person
    expect(record.fullName).toBe(first.fullName)
    expect(record.emailVerifiedAt ?? null).toBeNull()

    const { docs: entries } = await payload.find({
      collection: 'audit-log',
      where: {
        and: [
          { action: { equals: 'attach-records' } },
          { entityId: { equals: String(accountId) } },
        ],
      },
      ...SERVER,
    })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.changed).toBe('records:2')
    expect(entries[0]?.actorId).toBe(`account:${accountId}`)
  })

  it('attaches a record made later through the people create hook, but never a minor’s', async () => {
    const email = `${TAG}.later.${RUN}@fake.example.invalid`
    const { accountId } = await newAccount(email, 'later holder')
    const later = await person('a later booking', { email })
    expect(await accountOf(later.id)).toBe(accountId)
    const child = await person('a later child', { email, ageBand: 'under18' })
    expect(await accountOf(child.id)).toBeNull()
  })
})

describe('an owner’s detach (D-120)', () => {
  it('needs the owner role and the code, and never takes the account’s own record', async () => {
    const email = `${TAG}.detach.${RUN}@fake.example.invalid`
    const earlier = await person('not theirs', { email })
    const { accountId, personId } = await newAccount(email, 'detach holder')
    await attachEarlierRecords(await createLocalReq({}, payload), {
      accountId,
      channel: 'email',
      value: email,
    })
    expect(await accountOf(earlier.id)).toBe(accountId)
    expect(await detachRecord(await owner(['operator']), earlier.id)).toEqual({
      ok: false,
      error: { code: 'refused' },
    })
    expect(await detachRecord(await owner(['owner'], 'local-jwt'), earlier.id)).toEqual({
      ok: false,
      error: { code: 'refused' },
    })
    expect(await detachRecord(await owner(['owner']), personId)).toEqual({
      ok: false,
      error: { code: 'own-record' },
    })
    expect(await detachRecord(await owner(['owner']), earlier.id)).toEqual({
      ok: true,
      value: { detached: true },
    })
    expect(await accountOf(earlier.id)).toBeNull()
    expect(await detachRecord(await owner(['owner']), earlier.id)).toEqual({
      ok: false,
      error: { code: 'not-found' },
    })
  })
})

describe('an erasure’s accounts (H7)', () => {
  it('closes the account whose own record it is, and detaches an attached record', async () => {
    const email = `${TAG}.erased.${RUN}@fake.example.invalid`
    const attachedOne = await person('attached, then erased', { email })
    const { accountId, personId } = await newAccount(email, 'erased holder')
    await attachEarlierRecords(await createLocalReq({}, payload), {
      accountId,
      channel: 'email',
      value: email,
    })
    const req = await owner(['owner'])
    expect(await closeAccountsOfPerson(req, attachedOne.id)).toEqual({ closed: 0, detached: 1 })
    expect(await accountOf(attachedOne.id)).toBeNull()
    expect(await closeAccountsOfPerson(req, personId)).toEqual({ closed: 1, detached: 0 })
    expect(
      await payload.findByID({
        collection: 'accounts',
        id: accountId,
        disableErrors: true,
        ...SERVER,
      }),
    ).toBeNull()
    expect(await accountOf(personId)).toBeNull()
    // No A2 for an erasure: the person did not close it.
    const { totalDocs } = await payload.count({
      collection: 'messages',
      where: { and: [{ automation: { equals: 'A2' } }, { subjectId: { equals: accountId } }] },
      overrideAccess: true,
    })
    expect(totalDocs).toBe(0)
  })
})
