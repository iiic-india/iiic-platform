// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The account step's records (docs/20 §3.6, §4.5; D-113, D-131), run over an in-memory stand-in
// for Payload whose transactions roll back: which earlier record becomes the account's own, the
// newsletter's placeholder name counting as no name, and consent before storage (CLAUDE.md #4),
// the consent, the person and the account standing or falling together, with Better Auth's user
// made only after they commit; a second detail, given to Better Auth's user before it is marked
// proven; and closing, whose withdrawal of the account consent carries the evidence of the
// person's own request. Obviously fake people and addresses only.

vi.mock('server-only', () => ({}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('@/lib/privacy/consents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/privacy/consents')>()),
  currentNotice: vi.fn(async () => ({ id: NOTICE, text: 'Fake account notice for tests.' })),
}))
// No Better Auth here: closing removes no user, and A2 is planned by a stand-in.
vi.mock('@/lib/accounts/auth/instance', () => ({ customerAuthFor: () => null }))
vi.mock('@/lib/messaging/deliver', () => ({
  deliver: vi.fn(async () => ({ ok: true, value: {} })),
}))

const { closeAccount, createAccountRecords, newestRecord } =
  await import('@/lib/accounts/lifecycle')
const { createAccountWith } = await import('@/lib/accounts/signIn/steps')
const { sealAttempt } = await import('@/lib/accounts/signIn/cookie')
const { ADD_DETAIL_COOKIE, SIGN_IN_COOKIE } = await import('@/lib/accounts/contract')
const { confirmDetailWith } = await import('@/lib/accounts/details')
const { NEWSLETTER_PERSON_NAME } = await import('@/lib/newsletter/subscriptions')
const { contextActor } = await import('@/lib/audit/actor')

type Doc = Record<string, unknown> & { id: number }
type Where = Record<string, unknown>

const NOTICE = 77
const SECRET = 'test-only-better-auth-secret-0000000000000000'
const EMAIL = 'someone.own-record@fake.example.invalid'
const NOW = new Date('2099-05-04T11:00:00+05:30')
const TYPED = 'Fake Asha Example'

/** A `where` as Payload reads it, for the few operators these functions use. */
function holds(doc: Doc, where: Where | undefined): boolean {
  if (!where) return true
  if (Array.isArray(where.and)) return (where.and as Where[]).every((each) => holds(doc, each))
  if (Array.isArray(where.or)) return (where.or as Where[]).some((each) => holds(doc, each))
  return Object.entries(where).every(([field, condition]) => {
    const value = doc[field]
    const test = condition as Record<string, unknown>
    if ('equals' in test) return value != null && String(value) === String(test.equals)
    // As SQL: an empty field is not "not equal" to anything (NOT_UNDER_18 asks for it apart).
    if ('not_equals' in test) return value != null && String(value) !== String(test.not_equals)
    if ('exists' in test) return test.exists ? value != null : value == null
    if ('in' in test) return (test.in as unknown[]).map(String).includes(String(value))
    throw new Error(`the stand-in has no rule for ${field}`)
  })
}

/** Payload, in memory: writes go straight in, and a rolled-back transaction puts back what was. */
class FakePayload {
  rows: Record<string, Doc[]> = { people: [], consents: [], accounts: [], 'audit-log': [] }
  next = 100
  tick = 0
  /** A collection whose next create fails, as a database refusal would. */
  failOn: string | null = null
  saved: Record<string, Doc[]> | null = null
  commits = 0
  rollbacks = 0
  /**
   * Each write to a record, with the actor the audit plugin would name for it: the request has no
   * Payload user, so the account on its context, if any (src/plugins/auditLog.ts; D-133).
   */
  writes: { op: string; collection: string; actor: unknown }[] = []

  wrote(op: string, collection: string, req: unknown) {
    if (collection === 'audit-log') return
    const actor = req ? contextActor(req as Parameters<typeof contextActor>[0]) : undefined
    this.writes.push({ op, collection, actor })
  }

  seed(collection: string, data: Record<string, unknown>): Doc {
    const doc: Doc = { ...data, id: this.next++, createdAt: this.tick++ }
    this.of(collection).push(doc)
    return doc
  }

  of(collection: string): Doc[] {
    const rows = this.rows[collection]
    if (!rows) throw new Error(`the stand-in has no ${collection}`)
    return rows
  }

  get inTransaction(): boolean {
    return this.saved !== null
  }

  payload = {
    db: {
      beginTransaction: async () => {
        this.saved = structuredClone(this.rows)
        return 'fake-transaction'
      },
      commitTransaction: async () => {
        this.saved = null
        this.commits += 1
      },
      rollbackTransaction: async () => {
        if (this.saved) this.rows = this.saved
        this.saved = null
        this.rollbacks += 1
      },
    },
    findGlobal: async () => ({ flags: { accountsEnabled: true } }),
    find: async ({
      collection,
      where,
      sort,
      limit,
    }: {
      collection: string
      where?: Where
      sort?: string
      limit?: number
    }) => {
      let docs = this.of(collection).filter((doc) => holds(doc, where))
      if (sort === '-createdAt')
        docs = [...docs].sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
      return { docs: limit ? docs.slice(0, limit) : docs }
    },
    count: async ({ collection, where }: { collection: string; where?: Where }) => ({
      totalDocs: this.of(collection).filter((doc) => holds(doc, where)).length,
    }),
    findByID: async ({ collection, id }: { collection: string; id: number }) => {
      const doc = this.of(collection).find((row) => row.id === id)
      if (!doc) throw new Error('not found')
      return { ...doc }
    },
    create: async ({
      collection,
      data,
      req,
    }: {
      collection: string
      data: Record<string, unknown>
      req?: unknown
    }) => {
      if (this.failOn === collection) throw new Error(`the stand-in refused a ${collection} row`)
      this.wrote('create', collection, req)
      return { ...this.seed(collection, data) }
    },
    update: async ({
      collection,
      id,
      data,
      req,
    }: {
      collection: string
      id: number
      data: Doc
      req?: unknown
    }) => {
      const doc = this.of(collection).find((row) => row.id === id)
      if (!doc) throw new Error('not found')
      this.wrote('update', collection, req)
      Object.assign(doc, data)
      return { ...doc }
    },
    delete: async ({ collection, id }: { collection: string; id: number }) => {
      const rows = this.of(collection)
      const at = rows.findIndex((row) => row.id === id)
      if (at < 0) throw new Error('not found')
      return rows.splice(at, 1)[0]
    },
  }

  /** A fresh request, as each server action makes one. */
  req() {
    return { payload: this.payload, headers: new Headers(), context: {} } as never
  }
}

let db: FakePayload

beforeEach(() => {
  db = new FakePayload()
})

const records = (input: { fullName?: string } = {}) =>
  createAccountRecords(db.req(), {
    channel: 'email',
    value: EMAIL,
    fullName: input.fullName ?? TYPED,
    noticeVersionId: NOTICE,
    evidence: { ip: '203.0.113.7', userAgent: 'Fake browser' },
    now: NOW,
  })

/** The record the newsletter makes when someone no record holds confirms the Journal. */
const newsletterRecord = () =>
  db.seed('people', {
    fullName: NEWSLETTER_PERSON_NAME,
    email: EMAIL,
    emailVerifiedAt: '2099-01-02T10:00:00.000Z',
    language: 'en-IN',
    source: 'newsletter',
  })

describe('the account’s own record (docs/20 §3.6, §4.5; D-131)', () => {
  it('is the record the newsletter made, which takes the name typed in place of its placeholder', async () => {
    const made = newsletterRecord()
    const { personId, accountId } = await records()
    expect(personId).toBe(made.id)
    expect(db.of('people')).toHaveLength(1)
    expect(db.of('people')[0]).toMatchObject({ fullName: TYPED, account: accountId })
    expect(db.of('consents')[0]).toMatchObject({ person: made.id, purpose: 'account' })
    expect(db.of('accounts')[0]).toMatchObject({ person: made.id })
  })

  it('never offers the placeholder as the name, and offers the newest name a person gave', async () => {
    expect(await newestRecord(db.req(), 'email', EMAIL)).toBeNull()
    newsletterRecord()
    expect(await newestRecord(db.req(), 'email', EMAIL)).toBeNull()
    const named = db.seed('people', { fullName: 'Fake Earlier Booking', email: EMAIL })
    newsletterRecord()
    expect(await newestRecord(db.req(), 'email', EMAIL)).toEqual({
      id: named.id,
      fullName: 'Fake Earlier Booking',
    })
  })

  it('keeps the name on a proven record that a person gave, whatever is typed', async () => {
    const earlier = db.seed('people', {
      fullName: 'Fake Earlier Name',
      email: EMAIL,
      emailVerifiedAt: '2099-01-02T10:00:00.000Z',
    })
    const { personId } = await records()
    expect(personId).toBe(earlier.id)
    expect(db.of('people')).toHaveLength(1)
    expect(db.of('people')[0]?.fullName).toBe('Fake Earlier Name')
  })

  it('is the newest earlier record when its name is the one typed, else a new record', async () => {
    const booked = db.seed('people', { fullName: '  fake asha   EXAMPLE ', email: EMAIL })
    expect((await records()).personId).toBe(booked.id)

    db = new FakePayload()
    const other = db.seed('people', { fullName: 'Fake Someone Else', email: EMAIL })
    const { personId } = await records()
    expect(personId).not.toBe(other.id)
    expect(db.of('people')).toHaveLength(2)
    expect(db.of('people').find((row) => row.id === personId)).toMatchObject({
      fullName: TYPED,
      email: EMAIL,
      source: 'My IIIC',
    })
    // The earlier record keeps its name; attaching it is the sign-in's (docs/20 §6).
    expect(db.of('people').find((row) => row.id === other.id)?.fullName).toBe('Fake Someone Else')
  })
})

describe('the audit log’s actor in the account step (D-133)', () => {
  it('is the new account for every write made once its row exists', async () => {
    const req = db.req() as { context: Record<string, unknown> }
    const { accountId } = await createAccountRecords(req as never, {
      channel: 'email',
      value: EMAIL,
      fullName: TYPED,
      noticeVersionId: NOTICE,
      evidence: { ip: null, userAgent: null },
      now: NOW,
    })
    expect(req.context.auditActor).toEqual({ id: `account:${accountId}` })
    expect(db.of('audit-log').at(-1)).toMatchObject({ actorId: `account:${accountId}` })
  })

  it('is none for the person, consent and account rows written before the account has an id', async () => {
    // The order rulings E and I.1 of the join require: the person (when none is adopted), the
    // consent that names them, then the account. The log is append-only, so the rows written
    // before the account exists keep no actor; D-133 and docs/20 §8 say so.
    const { accountId } = await records()
    const account = { id: `account:${accountId}` }
    expect(db.writes).toEqual([
      { op: 'create', collection: 'people', actor: undefined },
      { op: 'create', collection: 'consents', actor: undefined },
      { op: 'create', collection: 'accounts', actor: undefined },
      { op: 'update', collection: 'people', actor: account },
    ])
    expect(db.of('audit-log')).toEqual([
      expect.objectContaining({ action: 'create-account', actorId: account.id }),
    ])
  })
})

describe('consent before storage in the account step (CLAUDE.md #4; D-113)', () => {
  it('keeps no person, account or audit entry when the consent cannot be written', async () => {
    db.failOn = 'consents'
    await expect(records()).rejects.toThrow(/consents/)
    expect(db.rollbacks).toBe(1)
    expect(db.commits).toBe(0)
    expect(db.of('people')).toEqual([])
    expect(db.of('accounts')).toEqual([])
    expect(db.of('consents')).toEqual([])
    expect(db.of('audit-log')).toEqual([])
  })

  it('leaves an earlier record as it was when the consent cannot be written', async () => {
    const made = newsletterRecord()
    const before = structuredClone(made)
    db.failOn = 'consents'
    await expect(records()).rejects.toThrow(/consents/)
    expect(db.of('people')).toEqual([before])
    expect(db.of('accounts')).toEqual([])
  })

  it('makes Better Auth’s user and the session only after the records commit, and neither when the consent fails', async () => {
    const seen: { consents: number; inTransaction: boolean }[] = []
    const createCustomer = vi.fn(async () => {
      seen.push({ consents: db.of('consents').length, inTransaction: db.inTransaction })
      return { userId: 'fake-user-1', created: true }
    })
    const startSession = vi.fn(async () => ({ replaced: false }))
    const cookies = new Map<string, string>()
    const settings = {
      VERCEL_ENV: undefined,
      BETTER_AUTH_SECRET: SECRET,
      siteUrl: 'http://localhost:3000',
      MESSAGING_TRANSPORT: 'fake' as const,
      RESEND_API_KEY: undefined,
      WHATSAPP_API_KEY: undefined,
    }
    const step = createAccountWith({
      settings: () => settings,
      deps: async () =>
        ({
          env: settings,
          auth: { api: { createCustomer, startSession } },
          headers: new Headers({ 'user-agent': 'Fake browser' }),
          jar: {
            get: (name: string) => cookies.get(name),
            set: (name: string, value: string) => void cookies.set(name, value),
            delete: (name: string) => void cookies.delete(name),
          },
          turnstile: null,
          deliver: vi.fn(),
        }) as never,
    })
    const proven = async () =>
      cookies.set(
        SIGN_IN_COOKIE.name,
        await sealAttempt(
          SECRET,
          {
            v: 1,
            purpose: 'signIn',
            channel: 'email',
            address: EMAIL,
            requestId: 41,
            sentAt: NOW.getTime() - 120_000,
            provenAt: NOW.getTime() - 60_000,
          },
          NOW,
        ),
      )
    const input = {
      fullName: TYPED,
      consent: true as const,
      adult: true as const,
      noticeVersionId: NOTICE,
      trustDevice: false,
    }

    await proven()
    db.failOn = 'consents'
    await expect(step(db.req(), input, NOW)).rejects.toThrow(/consents/)
    expect(createCustomer).not.toHaveBeenCalled()
    expect(startSession).not.toHaveBeenCalled()
    expect(db.of('people')).toEqual([])
    expect(db.of('accounts')).toEqual([])

    db.failOn = null
    const signingIn = db.req() as { context: Record<string, unknown> }
    expect(await step(signingIn as never, input, NOW)).toMatchObject({ ok: true })
    expect(seen).toEqual([{ consents: 1, inTransaction: false }])
    expect(startSession).toHaveBeenCalledTimes(1)
    expect(db.of('accounts')[0]).toMatchObject({ authUserId: 'fake-user-1' })
    // The sign-in that follows writes in the account's name (D-133).
    expect(signingIn.context.auditActor).toEqual({ id: `account:${db.of('accounts')[0]?.id}` })
  })
})

describe('closing an account (docs/20 §7.6; D-113)', () => {
  it('withdraws the account consent with the evidence of the person’s own request', async () => {
    const own = db.seed('people', {
      fullName: TYPED,
      email: EMAIL,
      emailVerifiedAt: '2099-01-02T10:00:00.000Z',
    })
    const account = db.seed('accounts', { person: own.id, authUserId: null })
    own.account = account.id
    db.seed('consents', {
      person: own.id,
      purpose: 'account',
      grantedAt: '2099-01-02T10:00:00.000Z',
      channel: 'web',
    })
    // The request accountRequest builds: the address and the browser, the account as the actor.
    const req = {
      payload: db.payload,
      headers: new Headers({ 'x-forwarded-for': '203.0.113.30', 'user-agent': 'Fake browser' }),
      context: { auditActor: { id: `account:${account.id}` } },
    } as never
    expect(await closeAccount(req, { accountId: account.id, reason: 'person' })).toEqual({
      ok: true,
      value: { closed: true },
    })
    const withdrawal = db.of('consents').find((row) => row.withdraws != null)
    expect(withdrawal).toMatchObject({
      channel: 'web',
      evidence: { form: 'My IIIC', ip: '203.0.113.30', userAgent: 'Fake browser' },
    })
    expect(db.of('accounts')).toEqual([])
    expect(db.of('people')[0]).toMatchObject({ account: null, emailVerifiedAt: expect.any(String) })
    expect(db.of('audit-log').at(-1)).toMatchObject({
      action: 'close-account',
      actorId: `account:${account.id}`,
    })
  })
})

describe('a second detail (docs/20 §4.6)', () => {
  const MOBILE = '+919000000001'
  const ADDED = 'someone.added@fake.example.invalid'

  /** A WhatsApp account adding an email, its code checked by a stand-in for Better Auth. */
  async function confirming(addDetail: (input: unknown) => Promise<unknown>) {
    const own = db.seed('people', {
      fullName: TYPED,
      mobile: MOBILE,
      mobileVerifiedAt: '2099-01-02T10:00:00.000Z',
    })
    const account = db.seed('accounts', { person: own.id, authUserId: 'fake-user-9' })
    own.account = account.id
    const cookies = new Map<string, string>()
    cookies.set(
      ADD_DETAIL_COOKIE.name,
      await sealAttempt(
        SECRET,
        {
          v: 1,
          purpose: 'addDetail',
          channel: 'email',
          address: ADDED,
          requestId: 5,
          sentAt: NOW.getTime() - 60_000,
          accountId: account.id,
        },
        NOW,
      ),
    )
    const settings = {
      VERCEL_ENV: undefined,
      BETTER_AUTH_SECRET: SECRET,
      siteUrl: 'http://localhost:3000',
      MESSAGING_TRANSPORT: 'fake' as const,
      RESEND_API_KEY: undefined,
      WHATSAPP_API_KEY: undefined,
    }
    const confirm = confirmDetailWith({
      settings: () => settings,
      deps: async () =>
        ({
          env: settings,
          auth: {
            api: {
              checkVerificationOTP: vi.fn(async () => ({ success: true })),
              forgetCode: vi.fn(async () => ({ ok: true })),
              addDetail,
            },
          },
          headers: new Headers(),
          jar: {
            get: (name: string) => cookies.get(name),
            set: (name: string, value: string) => void cookies.set(name, value),
            delete: (name: string) => void cookies.delete(name),
          },
          turnstile: null,
          deliver: vi.fn(),
        }) as never,
    })
    const session = {
      accountId: account.id,
      personId: own.id,
      authUserId: 'fake-user-9',
      sessionId: 'fake-session-9',
      signedInAt: NOW,
      expiresAt: new Date(NOW.getTime() + 86_400_000),
      trustedDevice: false,
      verified: { email: null, mobile: MOBILE },
    }
    return { own, account, run: () => confirm(db.req(), session, { code: '123456' }, NOW) }
  }

  it('reaches Better Auth’s user before the record is marked proven, then audits the mark with it', async () => {
    const markerSeen: unknown[] = []
    const { own, account, run } = await confirming(async () => {
      markerSeen.push(own.emailVerifiedAt ?? null)
      return { ok: true }
    })
    expect(await run()).toEqual({ ok: true, value: { attached: 0 } })
    expect(markerSeen).toEqual([null])
    expect(own).toMatchObject({ email: ADDED, emailVerifiedAt: NOW.toISOString() })
    expect(db.of('audit-log').find((row) => row.action === 'add-contact-detail')).toMatchObject({
      actorId: `account:${account.id}`,
    })
  })

  it('marks nothing when Better Auth’s user cannot take the detail', async () => {
    const { own, run } = await confirming(async () => {
      throw new Error('the stand-in refused: another user holds this email')
    })
    await expect(run()).rejects.toThrow(/another user holds/)
    expect(own.email).toBeUndefined()
    expect(own.emailVerifiedAt).toBeUndefined()
    expect(db.of('audit-log').filter((row) => row.action === 'add-contact-detail')).toEqual([])
  })
})
