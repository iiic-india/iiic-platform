import type { CollectionSlug, Config, Field, FieldHook, PayloadRequest } from 'payload'

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

/**
 * Encrypts payload-totp's `totpSecret` field at rest (src/lib/security/totpSecret.ts). Listed
 * after payloadTotp, which adds the field.
 *
 * - Every write through Payload passes beforeChange, the plugin's own included; Payload's
 *   sign-in, refresh and sign-out copy the raw row, so the stored value stays encrypted.
 * - The field is hidden: a read drops it before any hook runs unless it asks for hidden fields,
 *   as payload-totp's own lookup and Payload's update do. The user on each request
 *   (`req.user`) therefore never carries the secret.
 * - A secret only the previous key opens is written again under the current key the first
 *   time it is read, so a rotation completes as accounts are read.
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

    /** Stores a value straight through the database adapter, so no hook runs again. */
    const rewrite = async (req: PayloadRequest, id: number | string, stored: string) => {
      try {
        await req.payload.db.updateOne({
          collection,
          id,
          data: { totpSecret: stored },
          req,
          returning: false,
        })
      } catch (error) {
        req.payload.logger.warn(
          `A staff TOTP secret could not be written under the current key (${error instanceof Error ? error.name : 'unknown error'}); the next read tries again.`,
        )
      }
    }

    const encrypt: FieldHook = ({ value }) => {
      if (typeof value !== 'string' || value === '') return value
      if (!isEncryptedTotpSecret(value)) return encryptTotpSecret(value, secret)
      // A stored value passed back in: under the previous key it is written again under the
      // current one; otherwise it stays as it is (one neither key opens keeps failing closed).
      const opened = open(value)
      return opened?.stale ? encryptTotpSecret(opened.plain, secret) : value
    }

    const decrypt: FieldHook = async ({ value, data, req }) => {
      // Not in the stored format: a value an earlier read of the same document already opened.
      if (typeof value !== 'string' || !isEncryptedTotpSecret(value)) return value
      const opened = open(value)
      if (!opened) {
        req.payload.logger.warn(
          'A staff TOTP secret could not be decrypted; that account cannot verify until an owner resets its two-factor.',
        )
        return unknowableTotpSecret()
      }
      const id = (data as { id?: number | string } | undefined)?.id
      if (opened.stale && id !== undefined) {
        await rewrite(req, id, encryptTotpSecret(opened.plain, secret))
      }
      return opened.plain
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
