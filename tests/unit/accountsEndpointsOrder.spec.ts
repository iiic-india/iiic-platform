// @vitest-environment node
import type { Endpoint, PayloadRequest } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const lifecycle = vi.hoisted(() => ({
  endAccountSessions: vi.fn(),
  detachRecord: vi.fn(),
}))
vi.mock('@/lib/accounts/lifecycle', () => lifecycle)

const { Accounts } = await import('@/collections/Accounts')

// The owner's two acts on a My IIIC account (docs/20 §4.7, §6; D-120, D-125; CLAUDE.md #6):
// POST /api/accounts/:id/end-sessions and POST /api/accounts/:id/detach. Each refuses a visitor,
// a session without the two-factor code and every role but the owner's before it reads the body
// or the database, and before the account functions are called. Ruling B.11 of the R2a join: no
// admin control yet, so these handlers are the only way in, and their order is held here. Every
// id is fake.

const staff = (roles: string[], extra: Record<string, unknown> = {}) => ({
  id: 7,
  collection: 'users',
  roles,
  active: true,
  _strategy: 'totp',
  ...extra,
})

const OWNER = staff(['owner'])

function handlerOf(path: string) {
  const endpoint = (Accounts.endpoints as Endpoint[]).find(
    (entry) => entry.path === path && entry.method === 'post',
  )
  if (!endpoint) throw new Error(`no POST ${path} on accounts`)
  return endpoint.handler
}

const END_SESSIONS = handlerOf('/:id/end-sessions')
const DETACH = handlerOf('/:id/detach')

/**
 * A request whose every read is watched: the body, and each of the database's calls that could
 * read or write a person or an account.
 */
function request(user: unknown, given: { id?: unknown; body?: unknown } = {}) {
  // An id or a body given as undefined stays undefined: it is one of the cases.
  const id = 'id' in given ? given.id : '41'
  const body = 'body' in given ? given.body : { personId: 42 }
  const json = vi.fn(async () => body)
  const findByID = vi.fn(async (): Promise<unknown> => null)
  const others = { find: vi.fn(), count: vi.fn(), update: vi.fn(), delete: vi.fn() }
  const req = {
    user,
    routeParams: { id },
    json,
    payload: { findByID, ...others },
  } as unknown as PayloadRequest
  const touched = () => [findByID, ...Object.values(others)].some((call) => call.mock.calls.length)
  return { req, json, findByID, touched }
}

const read = async (response: Response) => ({
  status: response.status,
  cache: response.headers.get('Cache-Control'),
  body: (await response.json()) as { code?: string; message: string },
})

beforeEach(() => {
  lifecycle.endAccountSessions.mockReset()
  lifecycle.detachRecord.mockReset()
})

describe('the owner’s acts on an account', () => {
  it('refuse a visitor, a session without the code and every other role before reading anything', async () => {
    for (const [name, handler] of [
      ['end-sessions', END_SESSIONS],
      ['detach', DETACH],
    ] as const) {
      for (const [user, status, code] of [
        [null, 401, 'sign-in'],
        [{ id: 3, collection: 'customers' }, 401, 'sign-in'],
        [staff(['owner'], { _strategy: 'local-jwt' }), 403, 'enter-code'],
        [staff(['owner'], { active: false }), 403, 'not-allowed'],
        [staff(['operator']), 403, 'not-allowed'],
        [staff(['finance']), 403, 'not-allowed'],
        [staff(['practitioner']), 403, 'not-allowed'],
      ] as const) {
        const { req, json, touched } = request(user)
        const answer = await read(await handler(req))
        const label = `${name} ${JSON.stringify(user)}`
        expect(answer.status, label).toBe(status)
        expect(answer.body.code, label).toBe(code)
        expect(answer.cache, label).toBe('no-store')
        expect(json, label).not.toHaveBeenCalled()
        expect(touched(), label).toBe(false)
      }
    }
    expect(lifecycle.endAccountSessions).not.toHaveBeenCalled()
    expect(lifecycle.detachRecord).not.toHaveBeenCalled()
  })

  it('answer not-found for an id that is not a positive whole number, before reading the body', async () => {
    for (const handler of [END_SESSIONS, DETACH]) {
      for (const id of [undefined, '', 'abc', '0', '-4', '1.5', '41; drop table accounts']) {
        const { req, json, touched } = request(OWNER, { id })
        const answer = await read(await handler(req))
        expect(answer.status, String(id)).toBe(404)
        expect(answer.body.code, String(id)).toBe('not-found')
        expect(json).not.toHaveBeenCalled()
        expect(touched(), String(id)).toBe(false)
      }
    }
    expect(lifecycle.endAccountSessions).not.toHaveBeenCalled()
    expect(lifecycle.detachRecord).not.toHaveBeenCalled()
  })
})

describe('ending an account’s sessions', () => {
  it('hands the owner’s request and the account to endAccountSessions, and says how many ended', async () => {
    lifecycle.endAccountSessions.mockResolvedValue({ ok: true, value: { ended: 2 } })
    const { req, json } = request(OWNER)
    const answer = await read(await END_SESSIONS(req))
    expect(lifecycle.endAccountSessions).toHaveBeenCalledExactlyOnceWith(req, 41)
    expect(json).not.toHaveBeenCalled()
    expect(answer).toEqual({
      status: 200,
      cache: 'no-store',
      body: { ended: 2, message: 'Sessions ended: 2.' },
    })
  })

  it('passes on the refusal endAccountSessions gives on a preview, and its not-found', async () => {
    lifecycle.endAccountSessions.mockResolvedValueOnce({ ok: false, error: { code: 'refused' } })
    const refused = await read(await END_SESSIONS(request(OWNER).req))
    expect(refused.status).toBe(403)
    expect(refused.body).toEqual({
      code: 'refused',
      message: 'Only an owner can do this, and not on a preview.',
    })
    lifecycle.endAccountSessions.mockResolvedValueOnce({ ok: false, error: { code: 'not-found' } })
    const missing = await read(await END_SESSIONS(request(OWNER).req))
    expect(missing.status).toBe(404)
    expect(missing.body.code).toBe('not-found')
  })
})

describe('detaching a record from an account', () => {
  it('answers not-found for a body without a record’s id, without reading the database', async () => {
    for (const body of [
      undefined,
      null,
      {},
      { personId: 'x' },
      { personId: 0 },
      { personId: -1 },
    ]) {
      const { req, touched } = request(OWNER, { body })
      const answer = await read(await DETACH(req))
      expect(answer.status, JSON.stringify(body)).toBe(404)
      expect(touched(), JSON.stringify(body)).toBe(false)
    }
    expect(lifecycle.detachRecord).not.toHaveBeenCalled()
  })

  it('refuses a record this account does not hold, and one no account holds', async () => {
    for (const record of [
      null,
      { id: 42, account: 99 },
      { id: 42, account: { id: 99 } },
      { id: 42, account: null },
    ]) {
      const { req, findByID } = request(OWNER)
      findByID.mockResolvedValue(record)
      const answer = await read(await DETACH(req))
      expect(answer.status, JSON.stringify(record)).toBe(404)
      expect(answer.body.code).toBe('not-found')
    }
    expect(lifecycle.detachRecord).not.toHaveBeenCalled()
  })

  it('reads only the named record’s account link, then hands it to detachRecord', async () => {
    lifecycle.detachRecord.mockResolvedValue({ ok: true, value: { closed: 0, detached: 1 } })
    for (const account of [41, { id: 41 }]) {
      const { req, findByID } = request(OWNER)
      findByID.mockResolvedValue({ id: 42, account })
      const answer = await read(await DETACH(req))
      // One read before detachRecord, which itself refuses a preview (D-122;
      // tests/unit/accountsSignInClosed.spec.ts): the record's id and its account link, no more.
      expect(findByID).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ collection: 'people', id: 42, select: { account: true }, req }),
      )
      expect(lifecycle.detachRecord).toHaveBeenLastCalledWith(req, 42)
      expect(answer).toEqual({
        status: 200,
        cache: 'no-store',
        body: { detached: true, message: 'The record is detached from the account.' },
      })
    }
  })

  it('passes on detachRecord’s refusals: a preview, and the account’s own record', async () => {
    for (const [code, status] of [
      ['refused', 403],
      ['own-record', 409],
      ['not-found', 404],
    ] as const) {
      lifecycle.detachRecord.mockResolvedValueOnce({ ok: false, error: { code } })
      const { req, findByID } = request(OWNER)
      findByID.mockResolvedValue({ id: 42, account: 41 })
      const answer = await read(await DETACH(req))
      expect(answer.status, code).toBe(status)
      expect(answer.body.code, code).toBe(code)
    }
  })
})
