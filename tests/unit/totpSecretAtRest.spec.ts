// @vitest-environment node
import type { Config, FieldHook, TextField } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { decryptTotpSecret, encryptTotpSecret } from '@/lib/security/totpSecret'
import { totpSecretAtRest } from '@/plugins/totpSecretAtRest'

// Obviously fake values.
const KEY = 'test-only-payload-secret-00000000000000'
const OLD_KEY = 'test-only-previous-secret-0000000000000'
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'

function hooks(previousSecret?: string) {
  const config = totpSecretAtRest({ collection: 'users', previousSecret })({
    secret: KEY,
    collections: [
      {
        slug: 'users',
        fields: [
          { name: 'name', type: 'text' },
          { name: 'totpSecret', type: 'text' },
        ],
      },
    ],
  } as unknown as Config)
  const field = config.collections?.[0]?.fields[1] as TextField
  const warn = vi.fn()
  // One request: an update reads the stored document, then writes it, with the same req.
  const req = { context: {}, payload: { logger: { warn } } }
  const args = (value: unknown) => ({ value, req }) as unknown as Parameters<FieldHook>[0]
  return {
    field,
    warn,
    encrypt: (value: unknown) => field.hooks?.beforeChange?.[0]?.(args(value)),
    decrypt: (value: unknown) => field.hooks?.afterRead?.[0]?.(args(value)),
    untouched: config.collections?.[0]?.fields[0],
  }
}

describe('totpSecretAtRest', () => {
  it('encrypts what is written and decrypts what is read', () => {
    const { encrypt, decrypt } = hooks()
    const stored = encrypt(SECRET) as string
    expect(decryptTotpSecret(stored, KEY)).toBe(SECRET)
    expect(decrypt(stored)).toBe(SECRET)
  })

  it('does not encrypt twice, and leaves an empty secret empty', () => {
    const { encrypt } = hooks()
    const stored = encryptTotpSecret(SECRET, KEY)
    expect(encrypt(stored)).toBe(stored)
    expect(encrypt(null)).toBeNull()
    expect(encrypt('')).toBe('')
  })

  it('hides the field, so only reads that ask for hidden fields carry the secret', () => {
    expect(hooks().field.hidden).toBe(true)
  })

  it('fails closed on a secret no key opens, and says so in the log without details', () => {
    const { decrypt, warn } = hooks()
    const result = decrypt(encryptTotpSecret(SECRET, `${KEY}-unknown`))
    expect(result).toMatch(/^[A-Z2-7]{32}$/)
    expect(result).not.toBe(SECRET)
    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0]?.[0])).not.toContain(SECRET)
  })

  it('keeps the stored value when an update writes back the stand-in it read', () => {
    const { decrypt, encrypt } = hooks()
    const unreadable = encryptTotpSecret(SECRET, `${KEY}-unknown`)
    expect(encrypt(decrypt(unreadable))).toBe(unreadable)
  })

  it('passes an already opened secret through on a second read, without a warning', () => {
    const { decrypt, warn } = hooks()
    const first = decrypt(encryptTotpSecret(SECRET, KEY))
    expect(decrypt(first)).toBe(SECRET)
    expect(warn).not.toHaveBeenCalled()
  })

  it('opens a secret under the previous key, and moves it to the current key on a write', () => {
    const { decrypt, encrypt } = hooks(OLD_KEY)
    const underOldKey = encryptTotpSecret(SECRET, OLD_KEY)
    expect(decrypt(underOldKey)).toBe(SECRET)
    expect(decryptTotpSecret(encrypt(underOldKey) as string, KEY)).toBe(SECRET)
  })

  it('leaves every other field alone, and refuses a collection without the field', () => {
    expect(hooks().untouched).toEqual({ name: 'name', type: 'text' })
    expect(() =>
      totpSecretAtRest({ collection: 'users' })({
        secret: KEY,
        collections: [{ slug: 'users', fields: [] }],
      } as unknown as Config),
    ).toThrow(/no totpSecret field/)
  })
})
