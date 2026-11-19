// @vitest-environment node
import type { PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { resetTwoFactor } from '@/lib/auth/resetTwoFactor'

const owner = { id: 1, collection: 'users', roles: ['owner'], active: true }

function call(user: Record<string, unknown> | null, id: unknown = 2, update = vi.fn()) {
  const remove = vi.fn(async () => ({}))
  // No transactions in this stub database: the handler then runs each write on its own.
  const req = {
    user,
    routeParams: { id },
    payload: { update, delete: remove, db: {} },
  } as unknown as PayloadRequest
  return { response: resetTwoFactor(req), update, remove }
}

describe('resetTwoFactor', () => {
  it('lets an owner who entered their code reset someone else, ending their sessions and codes', async () => {
    const { response, update, remove } = call({ ...owner, _strategy: 'totp' })
    expect((await response).status).toBe(200)
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'users',
        id: 2,
        data: { totpSecret: null, sessions: [] },
        overrideAccess: true,
      }),
    )
    expect(remove).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'staff-recovery-codes',
        where: { user: { equals: 2 } },
        overrideAccess: true,
      }),
    )
  })

  it('refuses anyone who has not entered a code in this session', async () => {
    for (const user of [null, { ...owner, _strategy: 'local-jwt' }]) {
      const { response, update } = call(user)
      expect((await response).status).toBe(401)
      expect(update).not.toHaveBeenCalled()
    }
  })

  it('refuses staff who are not owners, and deactivated owners', async () => {
    for (const user of [
      { ...owner, roles: ['operator'], _strategy: 'totp' },
      { ...owner, active: false, _strategy: 'totp' },
    ]) {
      expect((await call(user).response).status).toBe(403)
    }
  })

  it('does not let an owner reset their own two-factor here', async () => {
    const { response, update } = call({ ...owner, _strategy: 'totp' }, 1)
    expect((await response).status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })

  it('answers 404 for an account that does not exist', async () => {
    const missing = vi.fn(async () => {
      throw new Error('Not Found')
    })
    expect((await call({ ...owner, _strategy: 'totp' }, 99, missing).response).status).toBe(404)
  })
})
