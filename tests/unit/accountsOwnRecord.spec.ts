// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The account step's records (docs/20 §3.6, §4.5; D-131), run over an in-memory stand-in for
// Payload whose transactions roll back: which earlier record becomes the account's own, the
// newsletter's placeholder name counting as no name. Obviously fake people and addresses only.

vi.mock('server-only', () => ({}))
vi.mock('@payload-config', () => ({ default: {} }))

const { createAccountRecords, newestRecord } = await import('@/lib/accounts/lifecycle')
const { NEWSLETTER_PERSON_NAME } = await import('@/lib/newsletter/subscriptions')

type Doc = Record<string, unknown> & { id: number }
type Where = Record<string, unknown>

const NOTICE = 77
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
    create: async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => {
      if (this.failOn === collection) throw new Error(`the stand-in refused a ${collection} row`)
      return { ...this.seed(collection, data) }
    },
    update: async ({ collection, id, data }: { collection: string; id: number; data: Doc }) => {
      const doc = this.of(collection).find((row) => row.id === id)
      if (!doc) throw new Error('not found')
      Object.assign(doc, data)
      return { ...doc }
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
