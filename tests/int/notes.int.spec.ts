import { sql } from '@payloadcms/db-postgres'
import { createLocalReq, getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import type { Booking, Person, Practitioner, Service, User } from '@/payload-types'
import config from '@/payload.config'

import { removeQueuedJobs } from '../helpers/queuedJobs'

vi.mock('server-only', () => ({}))

const { notesWith } = await import('@/lib/notes/notes')
const { loadKeyring } = await import('@/lib/notes/keys')
const { rekeyNotesWith } = await import('@/lib/notes/rekey')
const { recordAudit } = await import('@/lib/audit/record')

// Session notes against the real database (D-11; CLAUDE.md #3; docs/18 §3, §9): the author alone
// reads a note, not another practitioner, not an owner, not the operator; the row holds only
// ciphertext; every read writes `read-note` first and a read whose entry fails does not open; no
// key, no note; a rotation moves what the previous key sealed. Fake staff, people, words and keys.

let payload: Payload
const TAG = 'int.notes'
const PASSWORD = 'test-only-password-notes'
const WORDS = 'Fake session words int.notes, never real.'
const KEY = Buffer.alloc(32, 21).toString('base64')
const KEY_NEXT = Buffer.alloc(32, 22).toString('base64')
const KEY_OTHER = Buffer.alloc(32, 23).toString('base64')

const keyringOf = (current?: string, previous?: string) => () =>
  loadKeyring({ NOTES_ENCRYPTION_KEY: current, NOTES_ENCRYPTION_KEY_PREVIOUS: previous })
const notes = notesWith({ keyring: keyringOf(KEY), audit: recordAudit })

type Staff = 'authorA' | 'authorB' | 'owner' | 'countingOwner' | 'operator'
const staff = {} as Record<Staff, User>
let service: Service
let person: Person
let profileA: Practitioner
let profileB: Practitioner
let bookingA: Booking
let keys = 0

/** A staff user as Payload sees them after they entered their two-factor code. */
const verified = (user: User) => ({ ...user, collection: 'users', _strategy: 'totp' }) as User
const reqAs = (who: Staff) => createLocalReq({ user: verified(staff[who]) }, payload)

async function removeTestData() {
  const bookings = await payload.find({
    collection: 'bookings',
    where: { 'person.fullName': { like: TAG } },
    pagination: false,
    depth: 0,
  })
  await removeQueuedJobs(payload, { bookingIds: bookings.docs.map((booking) => booking.id) })
  await payload.delete({ collection: 'session-notes', where: { 'person.fullName': { like: TAG } } })
  await payload.delete({ collection: 'bookings', where: { 'person.fullName': { like: TAG } } })
  await payload.delete({ collection: 'practitioners', where: { publicName: { like: TAG } } })
  await payload.delete({ collection: 'services', where: { slug: { like: 'int-notes' } } })
  await payload.delete({ collection: 'people', where: { fullName: { like: TAG } } })
  await payload.delete({ collection: 'users', where: { email: { like: `${TAG}.` } } })
}

const user = (label: Staff, roles: User['roles']) =>
  payload.create({
    collection: 'users',
    data: { name: `Fake ${label}`, email: `${TAG}.${label}@example.invalid`, password: PASSWORD, roles },
  })

const booking = (practitioner: Practitioner, day: string) =>
  payload.create({
    collection: 'bookings',
    data: {
      reference: `IN-${Date.now().toString(36)}-${++keys}`,
      type: 'session',
      status: 'confirmed',
      paymentStatus: 'notRequired',
      service: service.id,
      durationMinutes: 30,
      person: person.id,
      practitioner: practitioner.id,
      startsAt: new Date(`${day}T10:00:00+05:30`).toISOString(),
      endsAt: new Date(`${day}T10:30:00+05:30`).toISOString(),
    } as Booking,
  })

const readEntries = async (noteId: number) =>
  (
    await payload.find({
      collection: 'audit-log',
      where: { and: [{ action: { equals: 'read-note' } }, { entityId: { equals: String(noteId) } }] },
      pagination: false,
    })
  ).totalDocs

const write = async (who: Staff = 'authorA', bookingId = bookingA.id, body = WORDS) => {
  const written = await notes.writeNote(await reqAs(who), { bookingId, body })
  if (!written.ok) throw new Error(`the note was refused: ${written.error.code}`)
  return written.value.id
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await removeTestData()
  staff.owner = await user('owner', ['owner'])
  staff.countingOwner = await user('countingOwner', ['owner', 'practitioner'])
  staff.authorA = await user('authorA', ['practitioner'])
  staff.authorB = await user('authorB', ['practitioner'])
  staff.operator = await user('operator', ['operator'])
  service = await payload.create({
    collection: 'services',
    data: {
      name: `Fake service ${TAG}`,
      type: 'session',
      slug: `int-notes-${Date.now()}`,
      register: 'counselling',
      format: 'online',
      active: true,
      options: [{ label: 'Fake 30', duration: 30 }],
    } as Service,
  })
  profileA = await payload.create({
    collection: 'practitioners',
    data: { publicName: `Fake ${TAG} A`, active: true, staff: staff.authorA.id } as Practitioner,
  })
  profileB = await payload.create({
    collection: 'practitioners',
    data: { publicName: `Fake ${TAG} B`, active: true, staff: staff.authorB.id } as Practitioner,
  })
  person = await payload.create({
    collection: 'people',
    data: { fullName: `Fake Person ${TAG}` } as Person,
  })
  bookingA = await booking(profileA, '2099-05-04')
  // B's own session, so B is a practitioner with bookings of their own, not one without any.
  await booking(profileB, '2099-05-05')
})

afterAll(async () => {
  await removeTestData()
})

describe('who writes a note (D-11)', () => {
  it('lets the booking’s own practitioner write, and nobody on another’s booking', async () => {
    expect(await write('authorA')).toBeGreaterThan(0)
    const other = await notes.writeNote(await reqAs('authorB'), {
      bookingId: bookingA.id,
      body: WORDS,
    })
    expect(other).toEqual({ ok: false, error: { code: 'not-own-booking' } })
    // An owner who counsels sees every booking, and still writes only on their own.
    const owner = await notes.writeNote(await reqAs('countingOwner'), {
      bookingId: bookingA.id,
      body: WORDS,
    })
    expect(owner).toEqual({ ok: false, error: { code: 'not-own-booking' } })
  })

  it('refuses roles without notes, and nobody writes a note through the API', async () => {
    for (const who of ['owner', 'operator'] as const) {
      const refused = await notes.writeNote(await reqAs(who), { bookingId: bookingA.id, body: WORDS })
      expect(refused.ok || refused.error.code, who).toBe('refused')
    }
    await expect(
      payload.create({
        collection: 'session-notes',
        data: {
          booking: bookingA.id,
          person: person.id,
          author: staff.authorA.id,
          sealed: { text: WORDS },
          keyId: 'fake',
        },
        user: verified(staff.authorA),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('stores only ciphertext, and names the act in the audit log', async () => {
    const id = await write()
    const { rows } = await payload.db.drizzle.execute(
      sql`SELECT * FROM "session_notes" WHERE "id" = ${id}`,
    )
    expect(rows).toHaveLength(1)
    expect(JSON.stringify(rows[0])).not.toContain('Fake session words')
    const entries = await payload.find({
      collection: 'audit-log',
      where: { and: [{ action: { equals: 'write-note' } }, { entityId: { equals: String(id) } }] },
    })
    expect(entries.totalDocs).toBe(1)
  })

  it('refuses without a key and stores nothing', async () => {
    const keyless = notesWith({ keyring: keyringOf(undefined), audit: recordAudit })
    const before = await payload.count({ collection: 'session-notes' })
    const refused = await keyless.writeNote(await reqAs('authorA'), {
      bookingId: bookingA.id,
      body: WORDS,
    })
    expect(refused).toEqual({ ok: false, error: { code: 'notes-key-missing' } })
    expect((await payload.count({ collection: 'session-notes' })).totalDocs).toBe(before.totalDocs)
  })
})

describe('who reads a note (D-11; docs/18 §9)', () => {
  it('opens a note for its author, and each read writes read-note first', async () => {
    const id = await write()
    const opened = await notes.readNote(await reqAs('authorA'), id)
    expect(opened.ok && opened.value.body).toBe(WORDS)
    expect(await readEntries(id)).toBe(1)
    await notes.readNote(await reqAs('authorA'), id)
    expect(await readEntries(id)).toBe(2)
  })

  it('answers another practitioner and an owner who counsels as if the note did not exist', async () => {
    const id = await write()
    for (const who of ['authorB', 'countingOwner'] as const) {
      expect(await notes.readNote(await reqAs(who), id), who).toEqual({
        ok: false,
        error: { code: 'not-found' },
      })
    }
    expect(await notes.readNote(await reqAs('authorA'), 999_999_999)).toEqual({
      ok: false,
      error: { code: 'not-found' },
    })
    expect(await readEntries(id)).toBe(0)
  })

  it('refuses an owner and the operator, who hold no notes role', async () => {
    const id = await write()
    for (const who of ['owner', 'operator'] as const) {
      const refused = await notes.readNote(await reqAs(who), id)
      expect(refused.ok || refused.error.code, who).toBe('refused')
    }
  })

  it('returns nothing of a note to anyone but its author through the API', async () => {
    const id = await write()
    for (const who of ['authorB', 'owner', 'countingOwner', 'operator'] as const) {
      const found = await payload.find({
        collection: 'session-notes',
        where: { id: { equals: id } },
        user: verified(staff[who]),
        overrideAccess: false,
      })
      expect(found.docs, who).toEqual([])
    }
    const own = await payload.find({
      collection: 'session-notes',
      where: { id: { equals: id } },
      user: verified(staff.authorA),
      overrideAccess: false,
    })
    expect(own.docs).toHaveLength(1)
    // The sealed body is never part of a read.
    expect(own.docs[0]).not.toHaveProperty('sealed')
    // Without the two-factor code the author's own rule does not apply either: refused or empty.
    const noCode = await payload
      .find({
        collection: 'session-notes',
        where: { id: { equals: id } },
        user: { ...staff.authorA, collection: 'users' } as User,
        overrideAccess: false,
      })
      .then(
        ({ docs }) => docs,
        () => [],
      )
    expect(noCode).toEqual([])
  })

  it('does not open a note when its read cannot be recorded', async () => {
    const id = await write()
    const failing = notesWith({
      keyring: keyringOf(KEY),
      audit: async () => {
        throw new Error('fake audit failure (int.notes)')
      },
    })
    await expect(failing.readNote(await reqAs('authorA'), id)).rejects.toThrow('fake audit failure')
    expect(await readEntries(id)).toBe(0)
  })

  it('is unreadable without the key it was sealed under', async () => {
    const id = await write()
    const otherKey = notesWith({ keyring: keyringOf(KEY_OTHER), audit: recordAudit })
    expect(await otherKey.readNote(await reqAs('authorA'), id)).toEqual({
      ok: false,
      error: { code: 'unreadable' },
    })
    const keyless = notesWith({ keyring: keyringOf(undefined), audit: recordAudit })
    expect(await keyless.readNote(await reqAs('authorA'), id)).toEqual({
      ok: false,
      error: { code: 'notes-key-missing' },
    })
  })

  it('does not open a sealed body copied onto another booking’s note', async () => {
    const original = await write('authorA', bookingA.id)
    // A second booking of A's, and a note on it, then the first note's body copied over it.
    const second = await booking(profileA, '2099-05-06')
    const target = await write('authorA', second.id, 'Fake other words int.notes.')
    await payload.db.drizzle.execute(
      sql`UPDATE "session_notes" SET "sealed" = (SELECT "sealed" FROM "session_notes" WHERE "id" = ${original}) WHERE "id" = ${target}`,
    )
    expect(await notes.readNote(await reqAs('authorA'), target)).toEqual({
      ok: false,
      error: { code: 'unreadable' },
    })
  })

  it('lists the author’s own notes by date, without their words', async () => {
    const listed = await notes.listOwnNotes(await reqAs('authorA'), { bookingId: bookingA.id })
    expect(listed.ok).toBe(true)
    if (!listed.ok) return
    expect(listed.value.length).toBeGreaterThan(0)
    expect(JSON.stringify(listed.value)).not.toContain('Fake session words')
    const others = await notes.listOwnNotes(await reqAs('authorB'), { bookingId: bookingA.id })
    expect(others).toEqual({ ok: true, value: [] })
  })

  it('tells an owner how many notes a person has, and nothing else', async () => {
    const counted = await notes.countNotesForOwner(await reqAs('owner'), person.id)
    expect(counted.ok && counted.value.count).toBeGreaterThan(0)
    expect(Object.keys(counted.ok ? counted.value : {}).sort()).toEqual(['count', 'latestAt'])
    const operator = await notes.countNotesForOwner(await reqAs('operator'), person.id)
    expect(operator.ok || operator.error.code).toBe('refused')
  })

  it('lets the author change a note, and records the change by name', async () => {
    const id = await write()
    const changed = await notes.updateNote(await reqAs('authorA'), {
      noteId: id,
      body: 'Fake changed words int.notes.',
    })
    expect(changed).toEqual({ ok: true, value: { id } })
    const opened = await notes.readNote(await reqAs('authorA'), id)
    expect(opened.ok && opened.value.body).toBe('Fake changed words int.notes.')
    expect(
      await notes.updateNote(await reqAs('authorB'), { noteId: id, body: 'Fake intrusion.' }),
    ).toEqual({ ok: false, error: { code: 'not-found' } })
    const entries = await payload.find({
      collection: 'audit-log',
      where: { and: [{ action: { equals: 'update-note' } }, { entityId: { equals: String(id) } }] },
    })
    expect(entries.totalDocs).toBe(1)
  })
})

describe('rotating the notes key (pnpm notes:rekey; docs/18 §3)', () => {
  it('re-seals what the previous key sealed, once, and it opens under the new key alone', async () => {
    const id = await write()
    const rotating = loadKeyring({ NOTES_ENCRYPTION_KEY: KEY_NEXT, NOTES_ENCRYPTION_KEY_PREVIOUS: KEY })
    if (!rotating.ok) throw new Error('the fake keys did not load')
    const first = await rekeyNotesWith(await createLocalReq({}, payload), rotating.value)
    expect(first.moved).toBeGreaterThanOrEqual(1)
    const second = await rekeyNotesWith(await createLocalReq({}, payload), rotating.value)
    expect(second.moved).toBe(0)
    const next = notesWith({ keyring: keyringOf(KEY_NEXT), audit: recordAudit })
    const opened = await next.readNote(await reqAs('authorA'), id)
    expect(opened.ok && opened.value.body).toBe(WORDS)
    // Back to the old key for the rest of the file's notes.
    const back = loadKeyring({ NOTES_ENCRYPTION_KEY: KEY, NOTES_ENCRYPTION_KEY_PREVIOUS: KEY_NEXT })
    if (back.ok) await rekeyNotesWith(await createLocalReq({}, payload), back.value)
  })
})
