import { getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { User } from '@/payload-types'
import config from '@/payload.config'

// Staff two-factor against the real database (docs/08 §9). Obviously fake accounts and secret.
let payload: Payload
const email = (label: string) => `int.totp.${label}@example.invalid`
const PASSWORD = 'test-only-password-totp'
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
let enrolled: User
let notEnrolled: User

async function removeTestAccounts() {
  await payload.delete({ collection: 'users', where: { email: { like: 'int.totp.' } } })
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await removeTestAccounts()
  enrolled = await payload.create({
    collection: 'users',
    data: { name: 'Fake Enrolled', email: email('enrolled'), password: PASSWORD, roles: ['owner'] },
  })
  await payload.update({
    collection: 'users',
    id: enrolled.id,
    data: { totpSecret: SECRET },
    overrideAccess: true,
  })
  notEnrolled = await payload.create({
    collection: 'users',
    data: { name: 'Fake New', email: email('new'), password: PASSWORD, roles: ['owner'] },
  })
})

afterAll(async () => {
  await removeTestAccounts()
})

describe('the TOTP secret at rest', () => {
  it('is stored encrypted, never as the secret itself', async () => {
    const row = (await payload.db.findOne({
      collection: 'users',
      where: { id: { equals: enrolled.id } },
    })) as { totpSecret?: string } | null
    expect(row?.totpSecret?.startsWith('v1:')).toBe(true)
    expect(row?.totpSecret).not.toContain(SECRET)
  })

  it('reads back as the secret for the plugin, which reads it with access overridden', async () => {
    const doc = (await payload.findByID({
      collection: 'users',
      id: enrolled.id,
      overrideAccess: true,
      showHiddenFields: true,
      select: { totpSecret: true },
    })) as { totpSecret?: string }
    expect(doc.totpSecret).toBe(SECRET)
  })

  it('is never readable through the API, even by its owner', async () => {
    const doc = (await payload.findByID({
      collection: 'users',
      id: enrolled.id,
      user: { ...enrolled, _strategy: 'totp' } as User,
      overrideAccess: false,
    })) as { totpSecret?: string }
    expect(doc.totpSecret).toBeUndefined()
  })
})

describe('access before the code', () => {
  it('gives an account that has not entered its code nothing at all', async () => {
    await expect(
      payload.find({ collection: 'users', user: enrolled, overrideAccess: false }),
    ).rejects.toThrow()
  })

  it('gives an account without an authenticator only its own record, to set one up', async () => {
    const visible = await payload.find({
      collection: 'users',
      user: notEnrolled,
      overrideAccess: false,
    })
    expect(visible.docs.map((doc) => doc.id)).toEqual([notEnrolled.id])
    await expect(
      payload.create({
        collection: 'media',
        data: { alt: 'int.totp.media' },
        filePath: 'src/brand/logo/png/favicon-32.png',
        user: notEnrolled,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('still lets visitors read published media without signing in', async () => {
    await expect(payload.find({ collection: 'media', overrideAccess: false })).resolves.toBeTruthy()
  })
})
