import { createHash } from 'node:crypto'

import { err, ok } from '@/lib/result'

import type { LoadKeyring, NoteKey } from './contract'

/**
 * The notes keys (D-11; docs/18 §3). Pure: the caller hands in the environment's values
 * (src/lib/env.ts has already checked each is 32 bytes in base64), so the rotation script, which
 * runs outside Next.js, loads them the same way the app does. Nothing here logs a key or its bytes.
 */

const KEY_BYTES = 32

/** A key's id, as the JWE header names it: the first 12 base64url characters of its SHA-256. */
export function keyId(key: Uint8Array): string {
  return createHash('sha256').update(key).digest('base64url').slice(0, 12)
}

/** A key from its base64 or base64url text, or null when it is not 32 bytes. */
function toKey(value: string | undefined): NoteKey | null {
  if (!value) return null
  const key = new Uint8Array(Buffer.from(value, 'base64'))
  return key.length === KEY_BYTES ? { id: keyId(key), key } : null
}

/**
 * The keyring: NOTES_ENCRYPTION_KEY seals and opens; NOTES_ENCRYPTION_KEY_PREVIOUS, only while it
 * is being rotated, still opens what was sealed under it. Without a usable current key there is no
 * keyring, and notes are refused rather than stored in the clear.
 */
export const loadKeyring: LoadKeyring = (env) => {
  const current = toKey(env.NOTES_ENCRYPTION_KEY)
  if (!current) return err({ code: 'notes-key-missing' })
  const previous = toKey(env.NOTES_ENCRYPTION_KEY_PREVIOUS)
  return ok(previous && previous.id !== current.id ? { current, previous } : { current })
}
