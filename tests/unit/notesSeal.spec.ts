// @vitest-environment node
import { createHash } from 'node:crypto'

import { decodeProtectedHeader } from 'jose'
import { describe, expect, it } from 'vitest'

import { keyId, loadKeyring } from '@/lib/notes/keys'
import { openNote, sealNote } from '@/lib/notes/seal'

// A session note's body at rest (D-11; CLAUDE.md #3; docs/18 §3): sealed with jose's flattened JWE
// (dir, A256GCM) under NOTES_ENCRYPTION_KEY, bound to its booking and author, opened only with a
// key the deployment holds. The keys are fixed fake bytes for this test, never a real key.

const KEY_OLD = Buffer.alloc(32, 7).toString('base64')
const KEY_NEW = Buffer.alloc(32, 9).toString('base64url')
const KEY_OTHER = Buffer.alloc(32, 11).toString('base64')
const BODY = 'Fake note words for the seal test only.'
const CONTEXT = { bookingId: 41, authorId: 7 }

const ring = (current: string, previous?: string) => {
  const loaded = loadKeyring({
    NOTES_ENCRYPTION_KEY: current,
    NOTES_ENCRYPTION_KEY_PREVIOUS: previous,
  })
  if (!loaded.ok) throw new Error('the fake key did not load')
  return loaded.value
}

describe('the notes keyring (LoadKeyring)', () => {
  it('refuses without a key, and an empty value is no key', () => {
    expect(loadKeyring({})).toEqual({ ok: false, error: { code: 'notes-key-missing' } })
    expect(loadKeyring({ NOTES_ENCRYPTION_KEY: '' })).toEqual({
      ok: false,
      error: { code: 'notes-key-missing' },
    })
  })

  it('names a key by the first 12 base64url characters of its SHA-256', () => {
    const bytes = Buffer.from(KEY_OLD, 'base64')
    const expected = createHash('sha256').update(bytes).digest('base64url').slice(0, 12)
    expect(keyId(new Uint8Array(bytes))).toBe(expected)
    expect(ring(KEY_OLD).current.id).toBe(expected)
  })

  it('reads base64 and base64url alike, and holds the previous key while rotating', () => {
    const rotating = ring(KEY_NEW, KEY_OLD)
    expect(rotating.current.key).toHaveLength(32)
    expect(rotating.previous?.id).toBe(ring(KEY_OLD).current.id)
    expect(rotating.current.id).not.toBe(rotating.previous?.id)
    expect(ring(KEY_NEW).previous).toBeUndefined()
  })
})

describe('sealing and opening a note (SealNote, OpenNote)', () => {
  it('opens what it sealed, for the same booking and author', async () => {
    const keyring = ring(KEY_OLD)
    const { sealed, keyId: id } = await sealNote(keyring, BODY, CONTEXT)
    expect(id).toBe(keyring.current.id)
    expect(await openNote(keyring, sealed, CONTEXT)).toEqual({ ok: true, value: BODY })
  })

  it('stores a flattened JWE, dir and A256GCM, naming its key, and never the words', async () => {
    const keyring = ring(KEY_OLD)
    const { sealed } = await sealNote(keyring, BODY, CONTEXT)
    expect(Object.keys(sealed).sort()).toEqual(['ciphertext', 'iv', 'protected', 'tag'])
    expect(decodeProtectedHeader(sealed)).toEqual({
      alg: 'dir',
      enc: 'A256GCM',
      kid: keyring.current.id,
    })
    const stored = JSON.stringify(sealed)
    expect(stored).not.toContain('Fake note words')
    expect(stored).not.toContain(Buffer.from(BODY).toString('base64url').slice(0, 16))
  })

  it('seals the same words differently each time (a fresh IV)', async () => {
    const keyring = ring(KEY_OLD)
    const first = await sealNote(keyring, BODY, CONTEXT)
    const second = await sealNote(keyring, BODY, CONTEXT)
    expect(first.sealed.iv).not.toBe(second.sealed.iv)
    expect(first.sealed.ciphertext).not.toBe(second.sealed.ciphertext)
  })

  it('is unreadable without the key it was sealed under', async () => {
    const { sealed } = await sealNote(ring(KEY_OLD), BODY, CONTEXT)
    expect(await openNote(ring(KEY_OTHER), sealed, CONTEXT)).toEqual({
      ok: false,
      error: { code: 'unreadable' },
    })
  })

  it('does not open on another booking or for another author', async () => {
    const keyring = ring(KEY_OLD)
    const { sealed } = await sealNote(keyring, BODY, CONTEXT)
    for (const context of [
      { bookingId: 42, authorId: 7 },
      { bookingId: 41, authorId: 8 },
    ]) {
      expect(await openNote(keyring, sealed, context)).toEqual({
        ok: false,
        error: { code: 'unreadable' },
      })
    }
  })

  it('does not open once a byte of it has changed', async () => {
    const keyring = ring(KEY_OLD)
    const { sealed } = await sealNote(keyring, BODY, CONTEXT)
    const bytes = Buffer.from(sealed.ciphertext, 'base64url')
    bytes[0] = (bytes[0] ?? 0) ^ 1
    const tampered = { ...sealed, ciphertext: bytes.toString('base64url') }
    expect((await openNote(keyring, tampered, CONTEXT)).ok).toBe(false)
    expect((await openNote(keyring, { ...sealed, tag: 'AAAA' }, CONTEXT)).ok).toBe(false)
    expect((await openNote(keyring, { ...sealed, protected: 'e30' }, CONTEXT)).ok).toBe(false)
  })

  it('opens a note under the previous key while rotating, and seals new ones under the new', async () => {
    const { sealed } = await sealNote(ring(KEY_OLD), BODY, CONTEXT)
    const rotating = ring(KEY_NEW, KEY_OLD)
    expect(await openNote(rotating, sealed, CONTEXT)).toEqual({ ok: true, value: BODY })
    expect((await sealNote(rotating, BODY, CONTEXT)).keyId).toBe(rotating.current.id)
    // Once the previous key is gone, what was left under it no longer opens.
    expect((await openNote(ring(KEY_NEW), sealed, CONTEXT)).ok).toBe(false)
  })

  it('answers unreadable, not a fault, for something that is not a sealed note', async () => {
    const keyring = ring(KEY_OLD)
    for (const junk of [
      null,
      'text',
      {},
      { protected: 1, iv: 2, ciphertext: 3, tag: 4 },
    ] as unknown[]) {
      expect(await openNote(keyring, junk as never, CONTEXT)).toEqual({
        ok: false,
        error: { code: 'unreadable' },
      })
    }
  })
})
