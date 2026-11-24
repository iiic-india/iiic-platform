import { decodeProtectedHeader, FlattenedEncrypt, flattenedDecrypt } from 'jose'
import { z } from 'zod'

import { err, ok } from '@/lib/result'

import type { NoteContext, NoteKey, OpenNote, SealNote, SealedNote } from './contract'

/**
 * A note's body at rest (D-11; CLAUDE.md #3; docs/18 §3): jose's flattened JWE, `alg: 'dir'`,
 * `enc: 'A256GCM'`, the key's id in the protected header, and additional authenticated data that
 * names the booking and the author, so a sealed body copied to another row or author does not
 * open. jose draws a fresh IV for every seal. No cryptography of our own.
 *
 * Pure: the keyring is handed in (src/lib/notes/keys.ts). Neither function logs, and a failure to
 * open says only `unreadable`, never why or what.
 */

const ALG = 'dir'
const ENC = 'A256GCM'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** What binds a sealed body to its row: the booking and the author. */
const additionalData = ({ bookingId, authorId }: NoteContext): string =>
  Buffer.from(`session-note|booking:${bookingId}|author:${authorId}`).toString('base64url')

/** The stored form, checked before anything is decrypted. */
const sealedShape = z.object({
  protected: z.string().min(1),
  iv: z.string().min(1),
  ciphertext: z.string().min(1),
  tag: z.string().min(1),
})

export const sealNote: SealNote = async (keyring, body, context) => {
  const { current } = keyring
  const jwe = await new FlattenedEncrypt(encoder.encode(body))
    .setProtectedHeader({ alg: ALG, enc: ENC, kid: current.id })
    .setAdditionalAuthenticatedData(Buffer.from(additionalData(context), 'base64url'))
    .encrypt(current.key)
  if (!jwe.protected || !jwe.iv || !jwe.tag) throw new Error('The note could not be sealed.')
  // The additional data is not stored: it is worked out again from the row when the note opens.
  const sealed: SealedNote = {
    protected: jwe.protected,
    iv: jwe.iv,
    ciphertext: jwe.ciphertext,
    tag: jwe.tag,
  }
  return { sealed, keyId: current.id }
}

/** The key a sealed body names, among those the deployment holds. */
function keyFor(keyring: { current: NoteKey; previous?: NoteKey }, sealed: SealedNote) {
  const header = decodeProtectedHeader(sealed)
  if (header.alg !== ALG || header.enc !== ENC || typeof header.kid !== 'string') return undefined
  return [keyring.current, keyring.previous].find((key) => key?.id === header.kid)
}

export const openNote: OpenNote = async (keyring, sealed, context) => {
  const shape = sealedShape.safeParse(sealed)
  if (!shape.success) return err({ code: 'unreadable' })
  try {
    const key = keyFor(keyring, shape.data)
    if (!key) return err({ code: 'unreadable' })
    const { plaintext } = await flattenedDecrypt(
      { ...shape.data, aad: additionalData(context) },
      key.key,
      { keyManagementAlgorithms: [ALG], contentEncryptionAlgorithms: [ENC] },
    )
    return ok(decoder.decode(plaintext))
  } catch {
    return err({ code: 'unreadable' })
  }
}

/** The key id a sealed body names, without opening it (for the rotation), or null. */
export function sealedKeyId(sealed: unknown): string | null {
  const shape = sealedShape.safeParse(sealed)
  if (!shape.success) return null
  try {
    const { kid } = decodeProtectedHeader(shape.data)
    return typeof kid === 'string' ? kid : null
  } catch {
    return null
  }
}
