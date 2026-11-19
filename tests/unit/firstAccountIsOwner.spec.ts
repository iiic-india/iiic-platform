// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'

import { OWNER_SETUP_COOKIE } from '@/lib/ownerSetup'

// Obviously fake test values, set before the hook reads its environment.
const TOKEN = 'test-only-owner-setup-token-0000000000'
type Hook = typeof import('@/collections/Users').firstAccountIsOwner
let hook: Hook

beforeAll(async () => {
  process.env.PAYLOAD_SECRET = 'test-only-payload-secret-00000000000000'
  process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/iiic_test'
  process.env.VERCEL_ENV = 'production'
  process.env.OWNER_SETUP_TOKEN = TOKEN
  ;({ firstAccountIsOwner: hook } = await import('@/collections/Users'))
})

/** A request shaped like Payload's: where it came from, its cookies, the users count. */
function run({
  api = 'REST',
  cookie,
  users = 0,
  operation = 'create',
}: { api?: string; cookie?: string; users?: number; operation?: 'create' | 'update' } = {}) {
  const req = {
    payloadAPI: api,
    headers: new Headers(cookie ? { cookie } : {}),
    payload: { count: async () => ({ totalDocs: users }) },
  }
  const data = { name: 'Fake Person', email: 'first.test@example.invalid', roles: ['editor'] }
  return hook({ req, operation, data } as unknown as Parameters<Hook>[0])
}

describe('firstAccountIsOwner on production', () => {
  it('refuses the first account without the setup cookie', async () => {
    await expect(run()).rejects.toMatchObject({ status: 403 })
    await expect(run({ cookie: `${OWNER_SETUP_COOKIE}=guess` })).rejects.toMatchObject({
      status: 403,
    })
  })

  it('refuses it even when the request is marked as server code', async () => {
    await expect(run({ api: 'local' })).rejects.toMatchObject({ status: 403 })
  })

  it('makes the first account the owner with the setup cookie', async () => {
    const result = await run({ cookie: `${OWNER_SETUP_COOKIE}=${TOKEN}` })
    expect(result).toMatchObject({ roles: ['owner'] })
  })

  it('leaves later accounts and updates alone', async () => {
    await expect(run({ users: 1 })).resolves.toMatchObject({ roles: ['editor'] })
    await expect(run({ operation: 'update' })).resolves.toMatchObject({ roles: ['editor'] })
  })
})
