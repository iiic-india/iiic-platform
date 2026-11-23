// @vitest-environment node
import type { PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import type { AuditEntry } from '@/lib/audit/record'
import { loadKeyring } from '@/lib/notes/keys'
import { sealNote } from '@/lib/notes/seal'

vi.mock('server-only', () => ({}))

const { notesWith } = await import('@/lib/notes/notes')

// The notes module's own locks, with a fake database (D-11; CLAUDE.md #3; docs/18 §3): the author
// alone opens a note, even if the collection's rule let a row through; an owner and the operator
// are refused before anything is read; the read is recorded before the words come back, and a
// read whose entry fails does not open. The int suite runs the same against Postgres.

const KEY = Buffer.alloc(32, 31).toString('base64')
const WORDS = 'Fake words for the notes access test only.'
const keyring = () => loadKeyring({ NOTES_ENCRYPTION_KEY: KEY })

const staff = (id: number, roles: string[]) => ({
  id,
  roles,
  collection: 'users',
  _strategy: 'totp',
  active: true,
})

async function storedNote() {
  const ring = keyring()
  if (!ring.ok) throw new Error('the fake key did not load')
  const { sealed, keyId } = await sealNote(ring.value, WORDS, { bookingId: 5, authorId: 1 })
  return {
    id: 9,
    booking: 5,
    person: 3,
    author: 1,
    sealed,
    keyId,
    createdAt: '2027-01-04T05:00:00.000Z',
    updatedAt: '2027-01-04T05:00:00.000Z',
  }
}

/** A request whose database ignores every rule and hands back the note: only the module guards. */
async function fakeReq(user: ReturnType<typeof staff>) {
  const note = await storedNote()
  const find = vi.fn(async () => ({ docs: [note], totalDocs: 1 }))
  const req = { user, context: {}, payload: { find, db: {} } } as unknown as PayloadRequest
  return { req, find }
}

describe('opening a note', () => {
  it('opens for its author, after the read is recorded', async () => {
    const calls: string[] = []
    const audit = vi.fn(async (_req: PayloadRequest, entry: AuditEntry) => {
      calls.push(entry.action)
    })
    const { req } = await fakeReq(staff(1, ['practitioner']))
    const opened = await notesWith({ keyring, audit }).readNote(req, 9)
    expect(opened).toEqual({
      ok: true,
      value: {
        id: 9,
        bookingId: 5,
        body: WORDS,
        createdAt: '2027-01-04T05:00:00.000Z',
        updatedAt: '2027-01-04T05:00:00.000Z',
      },
    })
    expect(audit).toHaveBeenCalledWith(req, {
      action: 'read-note',
      entity: 'session-notes',
      entityId: 9,
    })
    expect(calls).toEqual(['read-note'])
  })

  it('asks the database with the author’s own access', async () => {
    const { req, find } = await fakeReq(staff(1, ['practitioner']))
    await notesWith({ keyring, audit: async () => {} }).readNote(req, 9)
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'session-notes',
        overrideAccess: false,
        user: req.user,
      }),
    )
  })

  it('answers another practitioner not-found, even when a row comes back', async () => {
    const audit = vi.fn(async () => {})
    const { req } = await fakeReq(staff(2, ['practitioner']))
    expect(await notesWith({ keyring, audit }).readNote(req, 9)).toEqual({
      ok: false,
      error: { code: 'not-found' },
    })
    expect(audit).not.toHaveBeenCalled()
  })

  it('refuses an owner and the operator before anything is read', async () => {
    for (const roles of [['owner'], ['operator'], ['finance'], ['editor']]) {
      const { req, find } = await fakeReq(staff(1, roles))
      const refused = await notesWith({ keyring, audit: async () => {} }).readNote(req, 9)
      expect(refused, roles[0]).toEqual({
        ok: false,
        error: { code: 'refused', refusal: { status: 403, code: 'not-allowed' } },
      })
      expect(find).not.toHaveBeenCalled()
    }
  })

  it('refuses a session without the two-factor code', async () => {
    const { req, find } = await fakeReq({ ...staff(1, ['practitioner']), _strategy: 'local' })
    const refused = await notesWith({ keyring, audit: async () => {} }).readNote(req, 9)
    expect(refused).toEqual({
      ok: false,
      error: { code: 'refused', refusal: { status: 403, code: 'enter-code' } },
    })
    expect(find).not.toHaveBeenCalled()
  })

  it('does not open when the read cannot be recorded', async () => {
    const { req } = await fakeReq(staff(1, ['practitioner']))
    const failing = notesWith({
      keyring,
      audit: async () => {
        throw new Error('fake audit failure')
      },
    })
    await expect(failing.readNote(req, 9)).rejects.toThrow('fake audit failure')
  })

  it('answers notes-key-missing without a key, and reads nothing', async () => {
    const { req, find } = await fakeReq(staff(1, ['practitioner']))
    const keyless = notesWith({ keyring: () => loadKeyring({}), audit: async () => {} })
    expect(await keyless.readNote(req, 9)).toEqual({
      ok: false,
      error: { code: 'notes-key-missing' },
    })
    expect(find).not.toHaveBeenCalled()
  })
})

describe('writing a note', () => {
  it('names the field, never the words, when the input is wrong', async () => {
    const { req } = await fakeReq(staff(1, ['practitioner']))
    const refused = await notesWith({ keyring, audit: async () => {} }).writeNote(req, {
      bookingId: 'five',
      body: 'Fake words that must not appear in an error.',
    })
    expect(refused.ok).toBe(false)
    expect(JSON.stringify(refused)).not.toContain('Fake words')
  })
})
