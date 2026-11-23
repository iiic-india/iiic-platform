import type { PayloadHandler, PayloadRequest } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { makeMoveHandler } from '@/components/admin/pipeline/moveEndpoint'
import type { MoveLead } from '@/lib/pipeline/leads'
import { err, ok } from '@/lib/result'
import type { Lead } from '@/payload-types'

// The board's routes check the user, the role and the two-factor code before anything else
// (CLAUDE.md #6; docs/17 §11): anonymous, code-less and wrong-role requests are refused, and the
// proposal endpoints say no the same way before any action runs. Users here are obviously fake.

const actions = vi.hoisted(() => ({
  createVersion: vi.fn(),
  preview: vi.fn(),
  print: vi.fn(),
  send: vi.fn(),
  answer: vi.fn(),
  withdraw: vi.fn(),
}))
vi.mock('@/lib/pipeline/proposal/wiring', () => ({ proposals: () => actions }))

const { proposalEndpoints, proposalVersionEndpoints } = await import(
  '@/lib/pipeline/proposal/endpoints'
)

type FakeUser = { id: number; roles: string[]; _strategy?: string; active?: boolean }

const staff = (roles: string[], extra: Partial<FakeUser> = {}): FakeUser => ({
  id: 7,
  roles,
  _strategy: 'totp',
  ...extra,
})

/** A request as Payload hands an endpoint one: the user, the route's id, a JSON body. */
function request(user: FakeUser | null, body: unknown = {}, id = '12'): PayloadRequest {
  return {
    user: user ? { ...user, collection: 'users' } : null,
    routeParams: { id },
    json: async () => body,
    payload: { db: {} },
  } as unknown as PayloadRequest
}

const call = async (handler: PayloadHandler, req: PayloadRequest) => {
  const response = await handler(req)
  return { status: response.status, body: (await response.json().catch(() => null)) as never }
}

const handlerOf = (list: typeof proposalEndpoints, path: string, method: string) => {
  const found = list.find((endpoint) => endpoint.path === path && endpoint.method === method)
  if (!found) throw new Error(`no endpoint ${method} ${path}`)
  return found.handler
}

const fakeLead = { id: 3, stage: 'contacted' } as Lead

describe('"Move to stage"', () => {
  const moveLead = vi.fn<MoveLead>()
  const handler = makeMoveHandler(moveLead)

  beforeEach(() => {
    moveLead.mockReset()
    moveLead.mockResolvedValue(ok(fakeLead))
  })

  it('refuses anyone without a staff session and its code', async () => {
    expect((await call(handler, request(null))).status).toBe(401)
    expect((await call(handler, request(staff(['owner'], { _strategy: 'local-jwt' })))).status).toBe(
      401,
    )
    expect((await call(handler, request(staff(['owner'], { active: false })))).status).toBe(401)
    expect(moveLead).not.toHaveBeenCalled()
  })

  it('refuses the roles that do not work the pipeline', async () => {
    for (const role of ['editor', 'practitioner', 'finance']) {
      const answer = await call(handler, request(staff([role]), { leadId: 3, to: 'contacted' }))
      expect(answer.status, role).toBe(403)
    }
    expect(moveLead).not.toHaveBeenCalled()
  })

  it('takes only a lead and a known stage', async () => {
    for (const body of [{}, { leadId: 3 }, { leadId: 'x', to: 'won' }, { leadId: 3, to: 'paid' }]) {
      expect((await call(handler, request(staff(['operator']), body))).status).toBe(400)
    }
    expect(moveLead).not.toHaveBeenCalled()
  })

  it('moves the lead as the user who asked, with the reason trimmed', async () => {
    const answer = await call(
      handler,
      request(staff(['operator']), { leadId: 3, to: 'lost', reason: '  Chose another firm  ' }),
    )
    expect(answer.status).toBe(200)
    expect(moveLead).toHaveBeenCalledWith(expect.anything(), {
      leadId: 3,
      to: 'lost',
      reason: 'Chose another firm',
      by: 7,
    })
  })

  it('says why a move was refused', async () => {
    moveLead.mockResolvedValueOnce(err({ code: 'reason-required' }))
    const reason = await call(handler, request(staff(['owner']), { leadId: 3, to: 'lost' }))
    expect(reason.status).toBe(422)
    moveLead.mockResolvedValueOnce(err({ code: 'bad-move', from: 'won', to: 'new' }))
    const bad = await call(handler, request(staff(['owner']), { leadId: 3, to: 'new' }))
    expect(bad.status).toBe(409)
  })
})

describe('the proposal endpoints', () => {
  beforeEach(() => {
    for (const action of Object.values(actions)) action.mockReset()
  })

  const office = [
    handlerOf(proposalEndpoints, '/:id/versions', 'post'),
    handlerOf(proposalEndpoints, '/:id/answer', 'post'),
    handlerOf(proposalVersionEndpoints, '/:id/send', 'post'),
    handlerOf(proposalVersionEndpoints, '/:id/withdraw', 'post'),
  ]
  const readers = [
    handlerOf(proposalEndpoints, '/:id/preview', 'get'),
    handlerOf(proposalVersionEndpoints, '/:id/preview', 'get'),
    handlerOf(proposalVersionEndpoints, '/:id/pdf', 'get'),
  ]

  it('refuse anonymous and code-less requests before any action runs', async () => {
    for (const handler of [...office, ...readers]) {
      expect((await call(handler, request(null))).status).toBe(401)
      expect((await call(handler, request(staff(['owner'], { _strategy: 'api-key' })))).status).toBe(
        401,
      )
    }
    for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled()
  })

  it('let only the office act, and the office and finance read', async () => {
    for (const handler of office) {
      for (const role of ['finance', 'editor', 'practitioner']) {
        expect((await call(handler, request(staff([role])))).status, role).toBe(403)
      }
    }
    for (const handler of readers) {
      for (const role of ['editor', 'practitioner']) {
        expect((await call(handler, request(staff([role])))).status, role).toBe(403)
      }
    }
    for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled()
  })

  it('name the empty parts when a version is refused as incomplete', async () => {
    actions.createVersion.mockResolvedValueOnce(err({ code: 'incomplete', missing: ['situation'] }))
    const answer = await call(office[0] as PayloadHandler, request(staff(['operator'])))
    expect(answer.status).toBe(422)
    expect(answer.body).toMatchObject({ code: 'incomplete', details: ['the situation'] })
  })

  it('answer fees-hidden for a preview while prices are hidden', async () => {
    actions.preview.mockResolvedValueOnce(err({ code: 'fees-hidden' }))
    const answer = await call(readers[0] as PayloadHandler, request(staff(['finance'])))
    expect(answer.status).toBe(409)
    expect(answer.body).toMatchObject({ code: 'fees-hidden' })
  })

  it('return the link once after a send, and nothing about the client', async () => {
    actions.send.mockResolvedValueOnce(ok({ linkUrl: 'http://localhost:3000/p/abc', mailed: false }))
    const answer = await call(office[2] as PayloadHandler, request(staff(['owner'])))
    expect(answer.status).toBe(200)
    expect(answer.body).toEqual({ linkUrl: 'http://localhost:3000/p/abc', mailed: false })
    expect(actions.send).toHaveBeenCalledWith(expect.anything(), { versionId: 12, by: 7 })
  })

  it('take an answer only as accepted or declined', async () => {
    const answerHandler = office[1] as PayloadHandler
    expect((await call(answerHandler, request(staff(['owner']), { answer: 'maybe' }))).status).toBe(
      400,
    )
    actions.answer.mockResolvedValueOnce(ok({ proposalId: 12 }))
    const answer = await call(
      answerHandler,
      request(staff(['owner']), { answer: 'declined', note: 'Budget moved to next year.' }),
    )
    expect(answer.status).toBe(200)
    expect(actions.answer).toHaveBeenCalledWith(expect.anything(), {
      proposalId: 12,
      answer: 'declined',
      note: 'Budget moved to next year.',
      by: 7,
    })
  })

  it('refuse an id that is not a whole number', async () => {
    expect((await call(readers[2] as PayloadHandler, request(staff(['owner']), {}, 'x'))).status).toBe(
      400,
    )
  })
})
