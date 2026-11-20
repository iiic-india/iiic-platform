import { sql } from '@payloadcms/db-postgres'
import {
  createLocalReq,
  getPayload,
  logoutOperation,
  refreshOperation,
  type Payload,
} from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { rekeyTotpSecrets } from '@/lib/security/rekeyTotpSecrets'
import { decryptTotpSecret, encryptTotpSecret } from '@/lib/security/totpSecret'
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
  // Read the account again, as a request does: `hasTotp` is worked out when it is read, so the
  // object returned before the secret was set still says it has none.
  enrolled = await payload.findByID({ collection: 'users', id: enrolled.id, overrideAccess: true })
  expect((enrolled as { hasTotp?: boolean }).hasTotp).toBe(true)
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

  it('stays encrypted through sign-in, refresh and sign-out, which write the raw row back', async () => {
    const { token } = await payload.login({
      collection: 'users',
      data: { email: email('enrolled'), password: PASSWORD },
    })
    const { user } = await payload.auth({ headers: new Headers({ Authorization: `JWT ${token}` }) })
    expect(user?.id).toBe(enrolled.id)
    // The signed-in user carries no secret: the field is hidden from ordinary reads.
    expect((user as { totpSecret?: string } | null)?.totpSecret).toBeUndefined()
    // Payload's own writes are under test; payload-totp's cookie hooks need a Next.js request.
    const users = payload.collections.users
    const collection = {
      ...users,
      config: {
        ...users.config,
        hooks: { ...users.config.hooks, afterRefresh: [], afterLogout: [] },
      },
    }
    const req = await createLocalReq({ user: user as User }, payload)
    await refreshOperation({ collection, req })
    await logoutOperation({ collection, req })
    const row = (await payload.db.findOne({
      collection: 'users',
      where: { id: { equals: enrolled.id } },
    })) as { totpSecret?: string } | null
    expect(row?.totpSecret?.startsWith('v1:')).toBe(true)
    expect(row?.totpSecret).not.toContain(SECRET)
  })

  it('moves a secret under the previous key with pnpm totp:rekey, and sign-in never waits on it', async () => {
    const OLD = 'test-only-previous-payload-secret-0000000'
    const current = process.env.PAYLOAD_SECRET ?? ''
    await payload.db.drizzle.execute(
      sql`UPDATE "users" SET "totp_secret" = ${encryptTotpSecret(SECRET, OLD)} WHERE "id" = ${enrolled.id}`,
    )
    // Reads never write, so a sign-in finishes even while the secret is under the old key.
    await payload.login({
      collection: 'users',
      data: { email: email('enrolled'), password: PASSWORD },
    })
    const { moved } = await rekeyTotpSecrets(payload, { current, previous: OLD })
    expect(moved).toBeGreaterThanOrEqual(1)
    const row = (await payload.db.findOne({
      collection: 'users',
      where: { id: { equals: enrolled.id } },
    })) as { totpSecret?: string } | null
    expect(decryptTotpSecret(row?.totpSecret ?? '', current)).toBe(SECRET)
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
