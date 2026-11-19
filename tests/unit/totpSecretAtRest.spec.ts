// @vitest-environment node
import type { Config, FieldHook, TextField } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { decryptTotpSecret, encryptTotpSecret } from '@/lib/security/totpSecret'
import { totpSecretAtRest } from '@/plugins/totpSecretAtRest'

// Obviously fake values.
const KEY = 'test-only-payload-secret-00000000000000'
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'

function hooks() {
  const config = totpSecretAtRest({ collection: 'users' })({
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
  const call = (hook: FieldHook | undefined, value: unknown, warn: unknown = vi.fn()) =>
    hook?.({ value, req: { payload: { logger: { warn } } } } as unknown as Parameters<FieldHook>[0])
  return {
    encrypt: (value: unknown) => call(field.hooks?.beforeChange?.[0], value),
    decrypt: (value: unknown, warn?: unknown) => call(field.hooks?.afterRead?.[0], value, warn),
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

  it('fails closed on a secret it cannot read, and says so in the log without details', () => {
    const { decrypt } = hooks()
    const warn = vi.fn()
    const unreadable = encryptTotpSecret(SECRET, `${KEY}-old`)
    const result = decrypt(unreadable, warn)
    expect(result).toMatch(/^[A-Z2-7]{32}$/)
    expect(result).not.toBe(SECRET)
    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0]?.[0])).not.toContain(SECRET)
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
