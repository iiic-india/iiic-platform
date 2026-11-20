import type { CollectionSlug, Config, Field, FieldHook } from 'payload'

import {
  decryptTotpSecret,
  encryptTotpSecret,
  isEncryptedTotpSecret,
  unknowableTotpSecret,
} from '@/lib/security/totpSecret'

type Options = {
  collection: CollectionSlug
  /** PAYLOAD_SECRET_PREVIOUS, while PAYLOAD_SECRET is being rotated (docs/08 §9). */
  previousSecret?: string
}

/** Where a read leaves each stand-in it returned, with the stored value it stands for. */
const STAND_INS = 'totpSecretStandIns'

/**
 * Encrypts payload-totp's `totpSecret` field at rest (src/lib/security/totpSecret.ts). Listed
 * after payloadTotp, which adds the field.
 *
 * - Every write through Payload passes beforeChange, the plugin's own included; Payload's
 *   sign-in, refresh and sign-out copy the raw row, so the stored value stays encrypted.
 * - The field is hidden: a read drops it before any hook runs unless it asks for hidden fields,
 *   as payload-totp's own lookup and Payload's update do. The user on each request
 *   (`req.user`) therefore never carries the secret.
 * - A secret only the previous key opens still works, and moves to the current key when its
 *   account is written; `pnpm totp:rekey` moves the rest after a rotation. Reads never write:
 *   a sign-in that reads holds the row.
 * - A secret no key opens reads as a random one nobody holds (fail closed), and a write of the
 *   same document keeps what was stored rather than that stand-in.
 */
export function totpSecretAtRest({ collection, previousSecret }: Options) {
  return (config: Config): Config => {
    const secret = config.secret
    if (!secret) throw new Error('totpSecretAtRest needs the Payload secret.')

    /** The secret in a stored value, and whether only the previous key opens it. */
    const open = (stored: string) => {
      const current = decryptTotpSecret(stored, secret)
      if (current !== null) return { plain: current, stale: false }
      const previous = previousSecret ? decryptTotpSecret(stored, previousSecret) : null
      return previous === null ? null : { plain: previous, stale: true }
    }

    const encrypt: FieldHook = ({ value, req }) => {
      if (typeof value !== 'string' || value === '') return value
      // The stand-in a read gave for a secret no key opens: keep what was stored.
      const original = (req.context[STAND_INS] as Record<string, string> | undefined)?.[value]
      if (original) return original
      if (!isEncryptedTotpSecret(value)) return encryptTotpSecret(value, secret)
      // A stored value passed back in: under the previous key it moves to the current one.
      const opened = open(value)
      return opened?.stale ? encryptTotpSecret(opened.plain, secret) : value
    }

    const decrypt: FieldHook = ({ value, req }) => {
      // Not in the stored format: a value an earlier read of the same document already opened.
      if (typeof value !== 'string' || !isEncryptedTotpSecret(value)) return value
      const opened = open(value)
      if (opened) return opened.plain
      req.payload.logger.warn(
        'A staff TOTP secret could not be decrypted; that account cannot verify until an owner resets its two-factor.',
      )
      const standIn = unknowableTotpSecret()
      req.context[STAND_INS] = {
        ...(req.context[STAND_INS] as Record<string, string> | undefined),
        [standIn]: value,
      }
      return standIn
    }

    const isSecret = (field: Field) => field.type === 'text' && field.name === 'totpSecret'
    const withHooks = (field: Field): Field =>
      field.type === 'text' && field.name === 'totpSecret'
        ? {
            ...field,
            hidden: true,
            hooks: {
              ...field.hooks,
              beforeChange: [...(field.hooks?.beforeChange ?? []), encrypt],
              afterRead: [...(field.hooks?.afterRead ?? []), decrypt],
            },
          }
        : field

    let found = false
    const collections = (config.collections ?? []).map((entry) => {
      if (entry.slug !== collection) return entry
      found = entry.fields.some(isSecret)
      return { ...entry, fields: entry.fields.map(withHooks) }
    })
    if (!found) throw new Error(`totpSecretAtRest: no totpSecret field on "${collection}".`)
    return { ...config, collections }
  }
}
