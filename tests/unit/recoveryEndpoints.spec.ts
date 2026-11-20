// @vitest-environment node
import type { PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { createRecoveryCodes, recoverTwoFactor } from '@/lib/auth/recoveryEndpoints'

const person = { id: 3, collection: 'users', roles: ['editor'], active: true }

function request(user: Record<string, unknown> | null) {
  const payload = {
    find: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
    db: { findOne: vi.fn() },
    logger: { error: vi.fn() },
    collections: { users: { config: {} } },
  }
  const req = {
    user,
    payload,
    json: async () => ({ code: 'AAAA-AAAA-AAAA-AAAA' }),
  } as unknown as PayloadRequest
  return { req, payload }
}

describe('creating recovery codes', () => {
  it('refuses anyone who has not entered their two-factor code in this session', async () => {
    for (const user of [
      null,
      { ...person, _strategy: 'local-jwt' },
      { ...person, collection: 'customers', _strategy: 'totp' },
      { ...person, active: false, _strategy: 'totp' },
    ]) {
      const { req, payload } = request(user)
      expect((await createRecoveryCodes(req)).status, JSON.stringify(user)).toBe(401)
      expect(payload.delete).not.toHaveBeenCalled()
      expect(payload.create).not.toHaveBeenCalled()
    }
  })
})

describe('using a recovery code', () => {
  it('refuses a request without a password sign-in, before reading anything', async () => {
    for (const user of [
      null,
      { ...person, collection: 'customers' },
      { ...person, active: false },
    ]) {
      const { req, payload } = request(user)
      expect((await recoverTwoFactor(req)).status, JSON.stringify(user)).toBe(401)
      expect(payload.db.findOne).not.toHaveBeenCalled()
      expect(payload.find).not.toHaveBeenCalled()
    }
  })

  it('refuses a locked account without checking the code, and says how long the lock lasts', async () => {
    const { req, payload } = request(person)
    payload.db.findOne.mockResolvedValue({
      id: 3,
      lockUntil: new Date(Date.now() + 4.5 * 60_000).toISOString(),
    })
    const response = await recoverTwoFactor(req)
    expect(response.status).toBe(423)
    expect(await response.json()).toEqual({
      message:
        'This account is locked after too many wrong attempts. Try again in 5 minutes, or ask an owner to lift the lock.',
    })
    expect(payload.find).not.toHaveBeenCalled()
  })

  it('reports a failure as one, logging only the error name', async () => {
    const { req, payload } = request(person)
    payload.db.findOne.mockRejectedValue(
      new TypeError('query failed for person.fake@example.invalid'),
    )
    const response = await recoverTwoFactor(req)
    expect(response.status).toBe(500)
    expect(payload.logger.error).toHaveBeenCalledWith('Using a recovery code failed (TypeError).')
  })
})
