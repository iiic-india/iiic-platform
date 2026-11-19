import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createRecoveryCodes, recoverTwoFactor } from '@/lib/auth/recoveryEndpoints'
import { resetTwoFactor } from '@/lib/auth/resetTwoFactor'
import type { User } from '@/payload-types'
import config from '@/payload.config'

// Recovery codes against the real database. Obviously fake accounts and secret.
let payload: Payload
const email = (label: string) => `int.recovery.${label}@example.invalid`
const PASSWORD = 'test-only-password-recovery'
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
let person: User
let owner: User

/** A request from `user` as Payload would build it, with a JSON body and route parameters. */
async function request(
  user: User,
  strategy: 'totp' | 'local-jwt',
  body?: Record<string, unknown>,
  routeParams?: Record<string, unknown>,
): Promise<PayloadRequest> {
  const req = await createLocalReq(
    { user: { ...user, collection: 'users', _strategy: strategy } as never },
    payload,
  )
  req.json = async () => body ?? {}
  req.routeParams = routeParams
  return req
}

async function secretOf(id: number | string): Promise<string | null | undefined> {
  const doc = (await payload.findByID({
    collection: 'users',
    id,
    overrideAccess: true,
    showHiddenFields: true,
    select: { totpSecret: true },
  })) as { totpSecret?: string | null }
  return doc.totpSecret
}

async function newCodes(user: User): Promise<string[]> {
  const response = await createRecoveryCodes(await request(user, 'totp'))
  expect(response.status).toBe(200)
  return ((await response.json()) as { codes: string[] }).codes
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await payload.delete({ collection: 'users', where: { email: { like: 'int.recovery.' } } })
  owner = await payload.create({
    collection: 'users',
    data: { name: 'Fake Owner', email: email('owner'), password: PASSWORD, roles: ['owner'] },
  })
  person = await payload.create({
    collection: 'users',
    data: { name: 'Fake Person', email: email('person'), password: PASSWORD, roles: ['editor'] },
  })
  for (const user of [owner, person]) {
    await payload.update({ collection: 'users', id: user.id, data: { totpSecret: SECRET } })
  }
})

afterAll(async () => {
  await payload.delete({ collection: 'users', where: { email: { like: 'int.recovery.' } } })
})

describe('creating recovery codes', () => {
  it('needs the two-factor code entered in this session', async () => {
    const response = await createRecoveryCodes(await request(person, 'local-jwt'))
    expect(response.status).toBe(401)
  })

  it('gives ten codes once, stores only their hashes, and cancels the previous set', async () => {
    const first = await newCodes(person)
    expect(first).toHaveLength(10)
    const second = await newCodes(person)
    const stored = await payload.find({
      collection: 'staff-recovery-codes',
      where: { user: { equals: person.id } },
      overrideAccess: true,
    })
    expect(stored.totalDocs).toBe(10)
    const hashes = stored.docs.map((doc) => doc.codeHash)
    for (const code of [...first, ...second]) expect(hashes).not.toContain(code)
  })
})

describe('using a recovery code', () => {
  it('removes the authenticator once, so the person sets up a new one', async () => {
    const [code] = await newCodes(person)
    const response = await recoverTwoFactor(await request(person, 'local-jwt', { code }))
    expect(response.status).toBe(200)
    expect(await secretOf(person.id)).toBeFalsy()

    await payload.update({ collection: 'users', id: person.id, data: { totpSecret: SECRET } })
    const again = await recoverTwoFactor(await request(person, 'local-jwt', { code }))
    expect(again.status).toBe(400)
    expect(await secretOf(person.id)).toBe(SECRET)
  })

  it("does not take someone else's code", async () => {
    const [ownersCode] = await newCodes(owner)
    const response = await recoverTwoFactor(
      await request(person, 'local-jwt', { code: ownersCode }),
    )
    expect(response.status).toBe(400)
    expect(await secretOf(person.id)).toBe(SECRET)
  })

  it('counts wrong codes towards the account lockout', async () => {
    for (let i = 0; i < 5; i++) {
      await recoverTwoFactor(await request(person, 'local-jwt', { code: 'AAAA-AAAA-AAAA' }))
    }
    const locked = await recoverTwoFactor(
      await request(person, 'local-jwt', { code: 'AAAA-AAAA-AAAA' }),
    )
    expect(locked.status).toBe(423)
    await payload.db.updateOne({
      collection: 'users',
      id: person.id,
      data: { loginAttempts: 0, lockUntil: null },
      returning: false,
    })
  })
})

describe("an owner's reset", () => {
  it("also cancels the person's recovery codes", async () => {
    await newCodes(person)
    const response = await resetTwoFactor(
      await request(owner, 'totp', undefined, { id: String(person.id) }),
    )
    expect(response.status).toBe(200)
    const left = await payload.count({
      collection: 'staff-recovery-codes',
      where: { user: { equals: person.id } },
      overrideAccess: true,
    })
    expect(left.totalDocs).toBe(0)
    expect(await secretOf(person.id)).toBeFalsy()
  })
})
