// @vitest-environment node
import { commitTransaction, killTransaction, ValidationError } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MissingPages } from '@/collections/MissingPages'
import {
  CREATE_REDIRECT_MESSAGES,
  createRedirectFromMissingPage,
} from '@/lib/redirects/createFromMissing'

vi.mock('payload', async (importOriginal) => ({
  ...(await importOriginal<typeof import('payload')>()),
  initTransaction: vi.fn(async () => true),
  commitTransaction: vi.fn(async () => undefined),
  killTransaction: vi.fn(async () => undefined),
}))

// "Create redirect" in the 404 log (src/lib/redirects/createFromMissing.ts; docs/05, Content →
// Broken links): who may, what it writes, and that a refusal leaves the entry as it was.

const editor = { id: 3, collection: 'users', roles: ['editor'], active: true, _strategy: 'totp' }
const ENTRY = { id: 11, path: '/about-us', resolved: null }

const findByID = vi.fn()
const create = vi.fn()
const update = vi.fn()

function call(user: object | null, body: unknown = { to: '/about' }, id: unknown = '11') {
  return createRedirectFromMissingPage({
    user,
    routeParams: { id },
    json: async () => body,
    payload: { findByID, create, update },
  } as never)
}

beforeEach(() => {
  for (const fake of [findByID, create, update]) fake.mockReset()
  vi.mocked(commitTransaction).mockClear()
  vi.mocked(killTransaction).mockClear()
  findByID.mockResolvedValue(ENTRY)
  create.mockImplementation(async ({ data }: { data: object }) => ({ id: 21, ...data }))
  update.mockResolvedValue({})
})

describe('Create redirect', () => {
  it('is the 404 log’s own endpoint', () => {
    expect(MissingPages.endpoints).toContainEqual({
      path: '/:id/redirect',
      method: 'post',
      handler: createRedirectFromMissingPage,
    })
  })

  it('asks for a sign-in with the two-factor code, on an active staff account', async () => {
    for (const user of [
      null,
      { ...editor, _strategy: 'local-jwt' },
      { ...editor, active: false },
      { ...editor, collection: 'staff-recovery-codes' },
    ]) {
      const response = await call(user)
      expect(response.status, JSON.stringify(user)).toBe(401)
      expect(await response.json()).toEqual({ message: CREATE_REDIRECT_MESSAGES.signIn })
    }
    expect(create).not.toHaveBeenCalled()
  })

  it('is for the staff who may make redirects', async () => {
    for (const role of ['practitioner', 'finance']) {
      const response = await call({ ...editor, roles: [role] })
      expect(response.status, role).toBe(403)
    }
    expect(create).not.toHaveBeenCalled()
  })

  it('refuses a body that names no address, or an unknown kind', async () => {
    for (const body of [null, {}, { to: '' }, { to: '/about', statusCode: '301' }, 'about']) {
      const response = await call(editor, body)
      expect(response.status, JSON.stringify(body)).toBe(400)
      expect(await response.json()).toEqual({ message: CREATE_REDIRECT_MESSAGES.invalid })
    }
  })

  it('makes the redirect from the entry’s address and marks the entry resolved, together', async () => {
    const response = await call(editor, { to: ' /about#team ' })
    expect(response.status).toBe(201)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual({ id: 21, from: '/about-us', to: '/about#team' })
    expect(findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'missing-pages', id: '11', overrideAccess: false }),
    )
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'redirects',
        data: { from: '/about-us', to: { type: 'custom', url: '/about#team' }, type: '308' },
        // Under the collections' own access rules and checks.
        overrideAccess: false,
      }),
    )
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'missing-pages',
        id: 11,
        data: { resolved: 21 },
        overrideAccess: false,
      }),
    )
    expect(commitTransaction).toHaveBeenCalledTimes(1)
  })

  it('makes a temporary one when asked', async () => {
    await call(editor, { to: '/about', statusCode: '307' })
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: '307' }) }),
    )
  })

  it('answers for an entry that is gone, or already has its redirect, and writes nothing', async () => {
    findByID.mockResolvedValueOnce(null)
    expect((await call(editor)).status).toBe(404)
    findByID.mockResolvedValueOnce({ ...ENTRY, resolved: 5 })
    const resolved = await call(editor)
    expect(resolved.status).toBe(409)
    expect(await resolved.json()).toEqual({ message: CREATE_REDIRECT_MESSAGES.resolved })
    expect(create).not.toHaveBeenCalled()
    expect(killTransaction).toHaveBeenCalledTimes(2)
  })

  it('passes on the redirects’ own refusal, and leaves the entry as it was', async () => {
    create.mockRejectedValueOnce(
      new ValidationError({
        collection: 'redirects',
        errors: [{ path: 'to.url', message: 'Fake refusal.' }],
      }),
    )
    const response = await call(editor, { to: '/about-us' })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ message: 'Fake refusal.' })
    expect(update).not.toHaveBeenCalled()
    expect(killTransaction).toHaveBeenCalledTimes(1)
    expect(commitTransaction).not.toHaveBeenCalled()
  })
})
