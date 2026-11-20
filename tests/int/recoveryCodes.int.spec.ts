import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { ROLES } from '@/access/roles'
import { matchesRecoveryCode } from '@/lib/auth/recoveryCodes'
import { createRecoveryCodes, recoverTwoFactor } from '@/lib/auth/recoveryEndpoints'
import { resetTwoFactor } from '@/lib/auth/resetTwoFactor'
import type { User } from '@/payload-types'
import config from '@/payload.config'

// Recovery codes against the real database. Obviously fake accounts and secret.
let payload: Payload
const email = (label: string) => `int.recovery.${label}@example.invalid`
const PASSWORD = 'test-only-password-recovery'
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
const WRONG_CODE = 'AAAA-AAAA-AAAA-AAAA'
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

const recover = async (code: string, as: User = person) =>
  recoverTwoFactor(await request(as, 'local-jwt', { code }))

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

async function rowOf(id: number | string) {
  return (await payload.db.findOne({ collection: 'users', where: { id: { equals: id } } })) as {
    loginAttempts?: number | null
    lockUntil?: string | null
    sessions?: { id: string }[] | null
  }
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
})

// Every test starts enrolled, unlocked and without a count of wrong attempts.
beforeEach(async () => {
  for (const user of [owner, person]) {
    await payload.update({ collection: 'users', id: user.id, data: { totpSecret: SECRET } })
    await payload.db.updateOne({
      collection: 'users',
      id: user.id,
      data: { loginAttempts: 0, lockUntil: null },
      returning: false,
    })
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

  it('gives ten codes once, stores only salted hashes, and cancels the previous set', async () => {
    const first = await newCodes(person)
    expect(first).toHaveLength(10)
    const second = await newCodes(person)
    const stored = await payload.find({
      collection: 'staff-recovery-codes',
      where: { user: { equals: person.id } },
      overrideAccess: true,
      pagination: false,
    })
    expect(stored.totalDocs).toBe(10)
    const hashes = stored.docs.map((doc) => doc.codeHash)
    for (const hash of hashes) expect(hash.startsWith('pbkdf2-sha256$')).toBe(true)
    for (const code of second) {
      expect(hashes, code).not.toContain(code)
      const matches = await Promise.all(hashes.map((hash) => matchesRecoveryCode(code, hash)))
      expect(matches.filter(Boolean), code).toHaveLength(1)
    }
    for (const code of first) {
      const matches = await Promise.all(hashes.map((hash) => matchesRecoveryCode(code, hash)))
      expect(matches.some(Boolean), code).toBe(false)
    }
    // Two hundred deliberately slow hash checks.
  }, 60_000)

  it('is closed to every role through the API, owners included', async () => {
    for (const role of ROLES) {
      await expect(
        payload.find({
          collection: 'staff-recovery-codes',
          user: { ...owner, roles: [role], _strategy: 'totp' } as User,
          overrideAccess: false,
        }),
        role,
      ).rejects.toThrow()
    }
  })
})

describe('using a recovery code', () => {
  it('removes the authenticator once, so the person sets up a new one', async () => {
    const [code = ''] = await newCodes(person)
    expect((await recover(code)).status).toBe(200)
    expect(await secretOf(person.id)).toBeFalsy()

    await payload.update({ collection: 'users', id: person.id, data: { totpSecret: SECRET } })
    expect((await recover(code)).status).toBe(400)
    expect(await secretOf(person.id)).toBe(SECRET)
  })

  it('lets only one of two requests with the same code through', async () => {
    const [code = ''] = await newCodes(person)
    const statuses = (await Promise.all([recover(code), recover(code)])).map(
      (response) => response.status,
    )
    expect(statuses.sort()).toEqual([200, 400])
  })

  it('ends every other session of the person, keeping the one that used the code', async () => {
    const signIn = async () => {
      const { token } = await payload.login({
        collection: 'users',
        data: { email: email('person'), password: PASSWORD },
      })
      const { user } = await payload.auth({
        headers: new Headers({ Authorization: `JWT ${token}` }),
      })
      return user as User & { _sid?: string }
    }
    const here = await signIn()
    await signIn()
    expect((await rowOf(person.id)).sessions?.length).toBeGreaterThanOrEqual(2)

    const [code = ''] = await newCodes(person)
    expect((await recover(code, here)).status).toBe(200)
    expect((await rowOf(person.id)).sessions?.map((session) => session.id)).toEqual([here._sid])
  })

  it("does not take someone else's code", async () => {
    const [ownersCode = ''] = await newCodes(owner)
    expect((await recover(ownersCode)).status).toBe(400)
    expect(await secretOf(person.id)).toBe(SECRET)
  })

  it('counts wrong codes towards the account lockout', async () => {
    for (let i = 0; i < 5; i++) await recover(WRONG_CODE)
    expect((await recover(WRONG_CODE)).status).toBe(423)
  })

  it('clears the count of wrong attempts once a code works', async () => {
    for (let i = 0; i < 3; i++) await recover(WRONG_CODE)
    expect((await rowOf(person.id)).loginAttempts).toBe(3)
    const [code = ''] = await newCodes(person)
    expect((await recover(code)).status).toBe(200)
    expect((await rowOf(person.id)).loginAttempts).toBe(0)
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
