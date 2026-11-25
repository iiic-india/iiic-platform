import { sql } from '@payloadcms/db-postgres'
import { createLocalReq, getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { AccountSession } from '@/lib/accounts/contract'
import type { ConsentVersion, Person, Testimonial } from '@/payload-types'
import config from '@/payload.config'

import { removeQueuedJobs } from '../helpers/queuedJobs'

// My IIIC's privacy functions against the real database (docs/20 §7.5, §11; slice C): a
// withdrawal reaches every record of the account that holds the purpose and takes reviews down;
// a marketing consent is recorded under the notice in force, a changed notice refused, the
// Journal's subscriber confirmed once; nothing is offered to a record under 18; a request is
// recorded for the account's own record with its clocks and acknowledged by O4 or O7; a copy or
// an erasure needs a recent sign-in; a second account touches none of the first's consents
// or requests; and closing, through builder A's real function, keeps the records, their other
// consents and requests while it ends the account and its links. Needs the r2a_accounts migration (people.account, accounts). The accounts are
// made here directly, as the hooks' test makes them: the sessions are fake, Better Auth is
// builder A's. Obviously fake people, addresses and words, removed at the end; consent texts in
// force are kept for good, as every test that writes one keeps them.
vi.mock('server-only', () => ({}))

const { listOwnConsents, giveConsent, withdrawConsent } =
  await import('@/lib/accounts/privacy/consents')
const { createOwnRequest, listOwnRequests } = await import('@/lib/accounts/privacy/requests')
const { closeAccount, ownPersonIds } = await import('@/lib/accounts/privacy/seams')
const { createAccountRecords } = await import('@/lib/accounts/lifecycle')
const { consentFor, currentNotice } = await import('@/lib/privacy/consents')
const { runO4, runO7 } = await import('@/lib/automations/privacy/run')

let payload: Payload
const TAG = 'int.accounts-privacy'
const STARTED = new Date()
const MINUTE = 60_000
const address = (label: string) => `${label}.${TAG}@example.invalid`
const created = { accounts: [] as number[], people: [] as number[], requests: [] as number[] }

const notices = {} as Record<'marketingEmail' | 'testimonialPublication', ConsentVersion>

let firstAccount: AccountSession
let secondAccount: AccountSession
/** Record 1 is the first account's own; 2 is attached; 3 holds the address but no account. */
const records = {} as Record<'own' | 'attached' | 'loose' | 'other', Person>

async function removeTestData() {
  const people = await payload.find({
    collection: 'people',
    where: { fullName: { like: TAG } },
    pagination: false,
    depth: 0,
  })
  const ids = [...new Set([...created.people, ...people.docs.map((person) => person.id)])]
  if (ids.length) {
    const requests = await payload.find({
      collection: 'data-requests',
      where: { person: { in: ids } },
      pagination: false,
      depth: 0,
    })
    const requestIds = [...new Set([...created.requests, ...requests.docs.map((doc) => doc.id)])]
    // Recording a request queues M6's O4 or O7 (src/lib/automations/privacy/hooks.ts).
    await removeQueuedJobs(payload, { dataRequestIds: requestIds })
    if (requestIds.length) {
      await payload.delete({
        collection: 'messages',
        where: {
          and: [
            { subjectCollection: { equals: 'data-requests' } },
            { subjectId: { in: requestIds } },
          ],
        },
      })
    }
    await payload.delete({ collection: 'data-requests', where: { person: { in: ids } } })
    // Closing an account plans A2, a message about the account (src/lib/accounts/lifecycle.ts).
    if (created.accounts.length) {
      await payload.delete({
        collection: 'messages',
        where: {
          and: [
            { subjectCollection: { equals: 'accounts' } },
            { subjectId: { in: created.accounts } },
          ],
        },
      })
    }
    await payload.delete({ collection: 'accounts', where: { person: { in: ids } } })
    // Deleting a person deletes their reviews and marks their consents withdrawn (docs/04).
    await payload.delete({ collection: 'people', where: { id: { in: ids } } })
  }
  if (created.accounts.length) {
    await payload.delete({ collection: 'accounts', where: { id: { in: created.accounts } } })
  }
  await payload.delete({ collection: 'subscribers', where: { email: { like: TAG } } })
  // The jobs this file's consents, withdrawals and subscribers queued (V2, N2, N3).
  await payload.db.drizzle.execute(
    sql`DELETE FROM "payload_jobs" WHERE "created_at" >= ${STARTED.toISOString()} AND ("input"->>'consentId' IS NOT NULL OR "input"->>'subscriberId' IS NOT NULL)`,
  )
}

async function person(label: string, data: Partial<Person> = {}): Promise<Person> {
  const doc = (await payload.create({
    collection: 'people',
    data: { fullName: `Example Client ${label} ${TAG}`, ...data } as Person,
    overrideAccess: true,
  })) as Person
  created.people.push(doc.id)
  return doc
}

async function account(own: Person, label: string): Promise<number> {
  const doc = await payload.create({
    collection: 'accounts',
    data: { person: own.id, authUserId: `${TAG}-${label}`, lastSignInChannel: 'email' },
    overrideAccess: true,
  })
  created.accounts.push(doc.id)
  await attach(own, doc.id)
  return doc.id
}

/** As builder A's attaching does: the server sets `people.account` (docs/20 §6). */
const attach = (record: Person, accountId: number) =>
  payload.update({
    collection: 'people',
    id: record.id,
    data: { account: accountId },
    overrideAccess: true,
  })

/** A consent given on the site, recorded by the server. */
const consent = (record: Person, purpose: keyof typeof notices, minutesAgo = 5) =>
  payload.create({
    collection: 'consents',
    data: {
      person: record.id,
      noticeVersion: notices[purpose].id,
      channel: 'web',
      grantedAt: new Date(Date.now() - minutesAgo * MINUTE).toISOString(),
      evidence: { form: `Fake form ${TAG}`, ip: '203.0.113.5', userAgent: 'Fake browser' },
    } as never,
    overrideAccess: true,
  })

const session = (
  accountId: number,
  own: Person,
  label: string,
  over: Partial<AccountSession> = {},
): AccountSession => ({
  accountId,
  personId: own.id,
  authUserId: `${TAG}-${label}`,
  sessionId: `${TAG}-session-${label}`,
  signedInAt: new Date(),
  expiresAt: new Date(Date.now() + 24 * 60 * MINUTE),
  trustedDevice: false,
  verified: { email: own.email ?? null, mobile: null },
  ...over,
})

/** The jobs waiting under an event's key (src/lib/automations/emit.ts). */
const queued = async (key: string) =>
  (
    await payload.count({
      collection: 'payload-jobs',
      where: { 'input.key': { equals: key } },
      overrideAccess: true,
    })
  ).totalDocs

const request = () =>
  createLocalReq(
    {
      req: {
        headers: new Headers({ 'user-agent': 'Fake browser', 'x-forwarded-for': '203.0.113.6' }),
      },
    },
    payload,
  )

/**
 * The account notice in force, for an account made through builder A's account step; one dated a
 * day ago when none is, as tests/int/accountsAttach.int.spec.ts makes it.
 */
async function accountNoticeId(): Promise<number> {
  const found = await currentNotice(payload, 'account', 'en-IN')
  if (found) return found.id
  const made = await payload.create({
    collection: 'consent-versions',
    data: {
      purpose: 'account',
      language: 'en-IN',
      text: `Fake account notice for tests (${TAG}): keep my My IIIC account.`,
      effectiveFrom: new Date(Date.now() - 24 * 60 * MINUTE).toISOString(),
      effectiveFrom_tz: 'Asia/Kolkata',
    } as never,
    overrideAccess: true,
  })
  return made.id
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await removeTestData()
  for (const purpose of ['marketingEmail', 'testimonialPublication'] as const) {
    notices[purpose] = await payload.create({
      collection: 'consent-versions',
      data: {
        purpose,
        language: 'en-IN',
        text: `Fake consent text for ${purpose} (${TAG}).`,
        effectiveFrom: new Date(Date.now() - 10 * MINUTE).toISOString(),
      } as ConsentVersion,
    })
  }
  const verifiedNow = new Date().toISOString()
  records.own = await person('own', {
    email: address('client'),
    emailVerifiedAt: verifiedNow,
    ageBand: 'adult',
  })
  records.attached = await person('attached', { email: address('client') })
  records.loose = await person('loose', { email: address('client') })
  records.other = await person('other', {
    email: address('other-client'),
    emailVerifiedAt: verifiedNow,
    ageBand: 'adult',
  })
  const firstId = await account(records.own, 'first')
  await attach(records.attached, firstId)
  const secondId = await account(records.other, 'second')
  firstAccount = session(firstId, records.own, 'first')
  secondAccount = session(secondId, records.other, 'second')
})

afterAll(async () => {
  await removeTestData()
})

describe('the account’s records (docs/20 §6)', () => {
  it('are its own record and those attached, never a record that only shares the address', async () => {
    const req = await request()
    expect((await ownPersonIds(req, firstAccount)).sort()).toEqual(
      [records.own.id, records.attached.id].sort(),
    )
    expect(await ownPersonIds(req, secondAccount)).toEqual([records.other.id])
  })
})

describe('withdrawing from My IIIC', () => {
  it('reaches every record of the account that holds the purpose, at once, and takes reviews down', async () => {
    await consent(records.own, 'testimonialPublication')
    await consent(records.attached, 'testimonialPublication')
    await consent(records.loose, 'testimonialPublication')
    await consent(records.other, 'testimonialPublication')
    const review = (await payload.create({
      collection: 'testimonials',
      data: {
        status: 'received',
        person: records.attached.id,
        designation: 'Fake designation',
        place: 'Fakepur',
        programme: `Fake programme ${TAG}`,
        year: 2016,
        doors: ['consultancy'],
        text: 'Fake review words, exactly as written.',
        language: 'en-IN',
        connection: 'none',
        source: 'whatsapp',
        intakeRef: `fake-${TAG}`,
      } as Testimonial,
      overrideAccess: true,
    })) as Testimonial

    const result = await withdrawConsent(
      await request(),
      firstAccount,
      { purpose: 'testimonialPublication' },
      new Date(),
    )
    expect(result).toEqual({ ok: true, value: { withdrawn: 2 } })
    for (const record of [records.own, records.attached]) {
      expect(await consentFor(payload, record.id, 'testimonialPublication')).toBe('withdrawn')
    }
    // A record that only shares the address, and the second account's, keep theirs.
    expect(await consentFor(payload, records.loose.id, 'testimonialPublication')).toBe('granted')
    expect(await consentFor(payload, records.other.id, 'testimonialPublication')).toBe('granted')
    const after = await payload.findByID({ collection: 'testimonials', id: review.id, depth: 0 })
    expect(after.status).toBe('withdrawn')
    const withdrawal = await payload.find({
      collection: 'consents',
      where: {
        and: [
          { person: { equals: records.own.id } },
          { purpose: { equals: 'testimonialPublication' } },
          { withdraws: { exists: true } },
        ],
      },
      depth: 0,
    })
    expect(withdrawal.docs[0]).toMatchObject({
      channel: 'web',
      evidence: { form: 'My IIIC', ip: '203.0.113.6', userAgent: 'Fake browser' },
    })
  })

  it('cannot touch another account’s consent: the second account has none of it in force', async () => {
    await consent(records.own, 'marketingEmail', 4)
    expect(
      await withdrawConsent(
        await request(),
        secondAccount,
        { purpose: 'marketingEmail' },
        new Date(),
      ),
    ).toEqual({ ok: false, error: { code: 'none-in-force' } })
    expect(await consentFor(payload, records.own.id, 'marketingEmail')).toBe('granted')
    // Then the first account withdraws its own, so the next case starts from a withdrawal.
    expect(
      (
        await withdrawConsent(
          await request(),
          firstAccount,
          { purpose: 'marketingEmail' },
          new Date(),
        )
      ).ok,
    ).toBe(true)
  })
})

describe('giving a marketing consent from My IIIC (D-119)', () => {
  it('records it under the notice in force and refuses a notice that changed', async () => {
    expect(
      await giveConsent(
        await request(),
        secondAccount,
        {
          purpose: 'marketingEmail',
          noticeVersionId: notices.marketingEmail.id - 1,
          consent: true,
        },
        new Date(),
      ),
    ).toEqual({ ok: false, error: { code: 'notice-changed' } })

    const rows = await listOwnConsents(await request(), secondAccount)
    const offer = rows.find((row) => row.purpose === 'marketingEmail')
    expect(offer).toMatchObject({ canGive: true, noticeVersionId: notices.marketingEmail.id })
    expect(offer?.noticeText).toBe(`Fake consent text for marketingEmail (${TAG}).`)

    const given = await giveConsent(
      await request(),
      secondAccount,
      { purpose: 'marketingEmail', noticeVersionId: notices.marketingEmail.id, consent: true },
      new Date(),
    )
    expect(given.ok).toBe(true)
    const entry = await payload.findByID({
      collection: 'consents',
      id: given.ok ? given.value.consentId : 0,
      depth: 0,
    })
    expect(entry).toMatchObject({
      person: records.other.id,
      purpose: 'marketingEmail',
      noticeVersion: notices.marketingEmail.id,
      channel: 'web',
      evidence: { form: 'My IIIC' },
    })
    expect(await consentFor(payload, records.other.id, 'marketingEmail')).toBe('granted')
    // The Journal's list, confirmed at once (the address is proven), linked to the consent.
    const subscribers = await payload.find({
      collection: 'subscribers',
      where: { email: { equals: address('other-client') } },
      depth: 0,
    })
    expect(subscribers.docs[0]).toMatchObject({
      status: 'confirmed',
      source: 'My IIIC',
      person: records.other.id,
      consent: entry.id,
    })
    // N2 welcomes them: `newsletter.confirmed` queued once, in the same transaction.
    expect(await queued(`newsletter.confirmed:${subscribers.docs[0]?.id}`)).toBeGreaterThan(0)

    expect(
      await giveConsent(
        await request(),
        secondAccount,
        { purpose: 'marketingEmail', noticeVersionId: notices.marketingEmail.id, consent: true },
        new Date(),
      ),
    ).toEqual({ ok: false, error: { code: 'already-given' } })
  })

  it('offers nothing to an account whose record says under 18', async () => {
    const young = await person('young', { email: address('client'), ageBand: 'under18' })
    await attach(young, firstAccount.accountId)
    try {
      const rows = await listOwnConsents(await request(), firstAccount)
      expect(rows.filter((row) => row.canGive)).toEqual([])
      expect(
        await giveConsent(
          await request(),
          firstAccount,
          { purpose: 'marketingEmail', noticeVersionId: notices.marketingEmail.id, consent: true },
          new Date(),
        ),
      ).toEqual({ ok: false, error: { code: 'not-offered' } })
      expect(await consentFor(payload, records.own.id, 'marketingEmail')).toBe('withdrawn')
    } finally {
      await payload.update({
        collection: 'people',
        id: young.id,
        data: { account: null },
        overrideAccess: true,
      })
    }
  })
})

describe('requests about one’s data (docs/03 F11; D-121)', () => {
  it('records one for the account’s own record, with its clocks, and O4 acknowledges it', async () => {
    const now = new Date()
    const result = await createOwnRequest(
      await request(),
      firstAccount,
      { type: 'access', summary: `Fake: a copy of my data, please (${TAG}).` },
      now,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    created.requests.push(result.value.requestId)
    const stored = await payload.findByID({
      collection: 'data-requests',
      id: result.value.requestId,
      depth: 0,
    })
    expect(stored).toMatchObject({
      type: 'access',
      status: 'received',
      person: records.own.id,
      channel: 'web',
      verificationMethod: 'oneTimeCode',
    })
    expect(new Date(stored.acknowledgeBy ?? '').getTime()).toBe(now.getTime() + 48 * 60 * MINUTE)
    expect(new Date(stored.resolveBy ?? '').getTime()).toBe(now.getTime() + 30 * 24 * 60 * MINUTE)
    expect(result.value.resolveBy.getTime()).toBe(now.getTime() + 30 * 24 * 60 * MINUTE)
    // Its creation queued `dataRequest.received` (O4, O7) in the same transaction.
    expect(await queued(`dataRequest.received:${stored.id}`)).toBeGreaterThan(0)
    // O4 plans the acknowledgement to the person.
    await runO4(await request(), { dataRequestId: stored.id }, now)
    const planned = await payload.find({
      collection: 'messages',
      where: {
        and: [
          { subjectCollection: { equals: 'data-requests' } },
          { subjectId: { equals: stored.id } },
          { template: { equals: 'data-request-ack' } },
        ],
      },
      depth: 0,
    })
    expect(planned.docs).toHaveLength(1)
    expect(planned.docs[0]).toMatchObject({ automation: 'O4', person: records.own.id })
  })

  it('takes a complaint, which O7 acknowledges, and one open request of a kind at a time', async () => {
    const now = new Date()
    const complaint = await createOwnRequest(
      await request(),
      firstAccount,
      { type: 'consumerComplaint', summary: `Fake complaint (${TAG}).` },
      now,
    )
    expect(complaint.ok).toBe(true)
    if (!complaint.ok) return
    created.requests.push(complaint.value.requestId)
    await runO7(await request(), { dataRequestId: complaint.value.requestId }, now)
    const planned = await payload.find({
      collection: 'messages',
      where: {
        and: [
          { subjectCollection: { equals: 'data-requests' } },
          { subjectId: { equals: complaint.value.requestId } },
          { template: { equals: 'complaint-ack' } },
        ],
      },
      depth: 0,
    })
    expect(planned.docs).toHaveLength(1)
    expect(
      await createOwnRequest(
        await request(),
        firstAccount,
        { type: 'consumerComplaint', summary: 'Fake: the same again.' },
        now,
      ),
    ).toEqual({ ok: false, error: { code: 'open-request-exists' } })
  })

  it('refuses a copy or an erasure on a sign-in older than ten minutes, and records nothing', async () => {
    const stale = { ...firstAccount, signedInAt: new Date(Date.now() - 11 * MINUTE) }
    const before = await payload.count({
      collection: 'data-requests',
      where: { person: { equals: records.own.id } },
    })
    expect(
      await createOwnRequest(
        await request(),
        stale,
        { type: 'erasure', summary: 'Fake.' },
        new Date(),
      ),
    ).toEqual({ ok: false, error: { code: 'sign-in-again' } })
    const after = await payload.count({
      collection: 'data-requests',
      where: { person: { equals: records.own.id } },
    })
    expect(after.totalDocs).toBe(before.totalDocs)
  })

  it('lists each account’s own requests, never another’s', async () => {
    const first = await listOwnRequests(await request(), firstAccount)
    expect(first.map((row) => row.type).sort()).toEqual(['access', 'consumerComplaint'])
    expect(await listOwnRequests(await request(), secondAccount)).toEqual([])
  })

  // Closing is builder A's `CloseAccount` (docs/20 §7.6), which the privacy page reaches through
  // src/lib/accounts/privacy/seams.ts. This file runs without Better Auth's secret, so the user
  // and its sessions are tests/int/accountsSignIn.int.spec.ts's, with the bookings, payments and
  // invoices kept; here, what the privacy page's records hold before and after.
  it('closing, through the real CloseAccount, keeps the records, their other consents and requests, and ends the account and its links', async () => {
    const email = address('closing-client')
    const { accountId, personId } = await createAccountRecords(await request(), {
      channel: 'email',
      value: email,
      fullName: `Example Client closing ${TAG}`,
      noticeVersionId: await accountNoticeId(),
      evidence: { ip: null, userAgent: null },
      now: new Date(),
    })
    created.accounts.push(accountId)
    created.people.push(personId)
    const own = (await payload.findByID({ collection: 'people', id: personId, depth: 0 })) as Person
    const earlier = await person('closing earlier', { email })
    await attach(earlier, accountId)
    await consent(own, 'marketingEmail', 3)
    await consent(earlier, 'testimonialPublication', 3)
    const closing = session(accountId, own, 'closing')
    const asked = await createOwnRequest(
      await request(),
      closing,
      { type: 'correction', summary: `Fake: my city is spelt wrong (${TAG}).` },
      new Date(),
    )
    expect(asked.ok).toBe(true)
    if (asked.ok) created.requests.push(asked.value.requestId)
    expect((await ownPersonIds(await request(), closing)).sort()).toEqual(
      [own.id, earlier.id].sort(),
    )

    // As accountRequest builds it (src/lib/accounts/scope.ts) for C's close action.
    const req = await createLocalReq(
      {
        req: {
          headers: new Headers({ 'user-agent': 'Fake browser', 'x-forwarded-for': '203.0.113.7' }),
        },
        context: { auditActor: { id: `account:${accountId}` } },
      },
      payload,
    )
    expect(await closeAccount(req, { accountId, reason: 'person' })).toEqual({
      ok: true,
      value: { closed: true },
    })

    // The account row is gone, and every record it held is kept, its link cleared.
    expect(
      await payload.findByID({
        collection: 'accounts',
        id: accountId,
        depth: 0,
        disableErrors: true,
      }),
    ).toBeNull()
    for (const record of [own, earlier]) {
      const after = await payload.findByID({ collection: 'people', id: record.id, depth: 0 })
      expect(after.account ?? null, after.fullName).toBeNull()
    }
    const ownAfter = await payload.findByID({ collection: 'people', id: own.id, depth: 0 })
    expect(ownAfter.email).toBe(email)
    expect(ownAfter.emailVerifiedAt).toBeTruthy()
    // The account consent is withdrawn with the request's evidence; the other consents stay.
    expect(await consentFor(payload, own.id, 'account')).toBe('withdrawn')
    expect(await consentFor(payload, own.id, 'marketingEmail')).toBe('granted')
    expect(await consentFor(payload, earlier.id, 'testimonialPublication')).toBe('granted')
    const { docs: withdrawals } = await payload.find({
      collection: 'consents',
      where: {
        and: [
          { person: { equals: own.id } },
          { purpose: { equals: 'account' } },
          { withdraws: { exists: true } },
        ],
      },
      depth: 0,
    })
    expect(withdrawals).toHaveLength(1)
    expect(withdrawals[0]).toMatchObject({
      channel: 'web',
      evidence: { form: 'My IIIC', ip: '203.0.113.7', userAgent: 'Fake browser' },
    })
    // The request the person made is kept for the office.
    const { totalDocs: requests } = await payload.count({
      collection: 'data-requests',
      where: { person: { equals: own.id } },
    })
    expect(requests).toBe(1)
    // One close-account entry, in the account's name.
    const { docs: entries } = await payload.find({
      collection: 'audit-log',
      where: {
        and: [{ action: { equals: 'close-account' } }, { entityId: { equals: String(accountId) } }],
      },
      depth: 0,
      overrideAccess: true,
    })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      actorId: `account:${accountId}`,
      changed: 'person',
      ip: '203.0.113.7',
    })
    // The session read before the close holds no records, and writes nothing more.
    expect(await ownPersonIds(await request(), closing)).toEqual([])
    expect(
      await createOwnRequest(
        await request(),
        closing,
        { type: 'access', summary: `Fake: after closing (${TAG}).` },
        new Date(),
      ),
    ).toEqual({ ok: false, error: { code: 'closed-here' } })
  })
})

describe('the audit log for what an account does here (docs/20 §8; D-133)', () => {
  it('names the account as the actor of every row its request writes, with the address, and no email', async () => {
    // As accountRequest builds it (src/lib/accounts/scope.ts): no user, the network address and
    // the browser, and the account on the context.
    const req = await createLocalReq(
      {
        req: {
          headers: new Headers({ 'user-agent': 'Fake browser', 'x-forwarded-for': '203.0.113.6' }),
        },
        context: { auditActor: { id: `account:${secondAccount.accountId}` } },
      },
      payload,
    )
    const result = await createOwnRequest(
      req,
      secondAccount,
      { type: 'nomination', summary: `Fake: a nominee for my account (${TAG}).` },
      new Date(),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    created.requests.push(result.value.requestId)
    const { docs } = await payload.find({
      collection: 'audit-log',
      where: {
        and: [
          { entity: { equals: 'data-requests' } },
          { entityId: { equals: String(result.value.requestId) } },
        ],
      },
      depth: 0,
      overrideAccess: true,
    })
    expect(docs.length).toBeGreaterThan(0)
    for (const entry of docs) {
      expect(entry).toMatchObject({
        actorId: `account:${secondAccount.accountId}`,
        ip: '203.0.113.6',
      })
      expect(entry.actorEmail ?? null).toBeNull()
    }
  })
})

describe('an account whose row has gone since its session was read', () => {
  it('writes no request and no consent for it (B’s ownPersonIds answers no records)', async () => {
    const own = await person('gone', {
      email: address('gone-client'),
      emailVerifiedAt: new Date().toISOString(),
      ageBand: 'adult',
    })
    const goneId = await account(own, 'gone')
    const gone = session(goneId, own, 'gone')
    // Closed in another tab, say: the row goes and the session read before it is still in hand.
    await payload.update({
      collection: 'people',
      id: own.id,
      data: { account: null },
      overrideAccess: true,
    })
    await payload.delete({ collection: 'accounts', id: goneId, overrideAccess: true })
    expect(await ownPersonIds(await request(), gone)).toEqual([])
    expect(
      await createOwnRequest(
        await request(),
        gone,
        { type: 'correction', summary: `Fake: too late (${TAG}).` },
        new Date(),
      ),
    ).toEqual({ ok: false, error: { code: 'closed-here' } })
    expect(
      await giveConsent(
        await request(),
        gone,
        { purpose: 'marketingEmail', noticeVersionId: notices.marketingEmail.id, consent: true },
        new Date(),
      ),
    ).toEqual({ ok: false, error: { code: 'closed-here' } })
    const written = async (collection: 'data-requests' | 'consents') =>
      (await payload.count({ collection, where: { person: { equals: own.id } } })).totalDocs
    expect(await written('data-requests')).toBe(0)
    expect(await written('consents')).toBe(0)
  })
})
