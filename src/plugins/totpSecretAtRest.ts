import type { Config, Field, FieldHook } from 'payload'

import {
  decryptTotpSecret,
  encryptTotpSecret,
  unknowableTotpSecret,
} from '@/lib/security/totpSecret'

/**
 * Encrypts payload-totp's `totpSecret` field at rest (src/lib/security/totpSecret.ts). Listed
 * after payloadTotp, which adds the field. Every write through Payload passes beforeChange,
 * the plugin's own included; Payload's sign-in, refresh and sign-out copy the raw row, so the
 * stored value stays encrypted.
 */
export function totpSecretAtRest({ collection }: { collection: string }) {
  return (config: Config): Config => {
    const secret = config.secret
    if (!secret) throw new Error('totpSecretAtRest needs the Payload secret.')

    const encrypt: FieldHook = ({ value }) => {
      if (typeof value !== 'string' || value === '') return value
      // Already encrypted (a document passed back in as it was stored).
      if (decryptTotpSecret(value, secret) !== null) return value
      return encryptTotpSecret(value, secret)
    }

    const decrypt: FieldHook = ({ value, req }) => {
      if (typeof value !== 'string' || value === '') return value
      const plain = decryptTotpSecret(value, secret)
      if (plain !== null) return plain
      req.payload.logger.warn(
        'A staff TOTP secret could not be decrypted; that account cannot verify until an owner resets its two-factor.',
      )
      return unknowableTotpSecret()
    }

    const isSecret = (field: Field) => field.type === 'text' && field.name === 'totpSecret'
    const withHooks = (field: Field): Field =>
      field.type === 'text' && field.name === 'totpSecret'
        ? {
            ...field,
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
