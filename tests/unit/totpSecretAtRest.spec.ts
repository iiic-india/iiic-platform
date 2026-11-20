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
  const updateOne = vi.fn(async () => null)
  const args = (value: unknown) =>
    ({
      value,
      data: { id: 7 },
      req: { payload: { logger: { warn }, db: { updateOne } } },
    }) as unknown as Parameters<FieldHook>[0]
  return {
    field,
    warn,
    updateOne,
    encrypt: (value: unknown) => field.hooks?.beforeChange?.[0]?.(args(value)),
    decrypt: async (value: unknown) => field.hooks?.afterRead?.[0]?.(args(value)),
    untouched: config.collections?.[0]?.fields[0],
  }
}

describe('totpSecretAtRest', () => {
  it('encrypts what is written and decrypts what is read', async () => {
    const { encrypt, decrypt } = hooks()
    const stored = encrypt(SECRET) as string
    expect(decryptTotpSecret(stored, KEY)).toBe(SECRET)
    expect(await decrypt(stored)).toBe(SECRET)
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

  it('fails closed on a secret no key opens, and says so in the log without details', async () => {
    const { decrypt, warn, updateOne } = hooks()
    const unreadable = encryptTotpSecret(SECRET, `${KEY}-unknown`)
    const result = await decrypt(unreadable)
    expect(result).toMatch(/^[A-Z2-7]{32}$/)
    expect(result).not.toBe(SECRET)
    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0]?.[0])).not.toContain(SECRET)
    expect(updateOne).not.toHaveBeenCalled()
  })

  it('passes an already opened secret through on a second read, without a warning', async () => {
    const { decrypt, warn } = hooks()
    const first = await decrypt(encryptTotpSecret(SECRET, KEY))
    expect(await decrypt(first)).toBe(SECRET)
    expect(warn).not.toHaveBeenCalled()
  })

  it('opens a secret under the previous key and stores it again under the current one', async () => {
    const { decrypt, encrypt, updateOne } = hooks(OLD_KEY)
    const underOldKey = encryptTotpSecret(SECRET, OLD_KEY)
    expect(await decrypt(underOldKey)).toBe(SECRET)
    expect(updateOne).toHaveBeenCalledOnce()
    const write = (updateOne.mock.calls[0] as unknown[] | undefined)?.[0] as {
      id: number
      data: { totpSecret: string }
    }
    expect(write.id).toBe(7)
    expect(decryptTotpSecret(write.data.totpSecret, KEY)).toBe(SECRET)

    // A stored value passed back in on a write is moved to the current key the same way.
    expect(decryptTotpSecret(encrypt(underOldKey) as string, KEY)).toBe(SECRET)
  })

  it('does not rewrite a secret already under the current key', async () => {
    const { decrypt, updateOne } = hooks(OLD_KEY)
    await decrypt(encryptTotpSecret(SECRET, KEY))
    expect(updateOne).not.toHaveBeenCalled()
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
