// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import { refuseCron, runRounds } from '@/lib/automations/runner'

vi.mock('server-only', () => ({}))

// The cron route's gate and its rounds (docs/19 §2). Fake secrets only.

const SECRET = 'fake-cron-secret-for-tests-only-0123456789abcdef'

describe('refuseCron', () => {
  it('answers 503 while no secret is set', () => {
    expect(refuseCron({ secret: undefined, authorization: null, vercelEnv: undefined })).toEqual({
      status: 503,
      code: 'not-configured',
    })
  })

  it('refuses a preview with 404 even with the right secret', () => {
    expect(
      refuseCron({ secret: SECRET, authorization: `Bearer ${SECRET}`, vercelEnv: 'preview' }),
    ).toEqual({ status: 404, code: 'not-production' })
    expect(
      refuseCron({ secret: SECRET, authorization: `Bearer ${SECRET}`, vercelEnv: 'development' }),
    ).toEqual({ status: 404, code: 'not-production' })
  })

  it('refuses no secret, a wrong secret and a near miss', () => {
    for (const authorization of [
      null,
      '',
      SECRET,
      `Bearer`,
      `Bearer `,
      `Bearer ${SECRET}x`,
      `Bearer ${SECRET.slice(0, -1)}`,
      `bearer ${SECRET}`,
      `Basic ${SECRET}`,
    ]) {
      expect(refuseCron({ secret: SECRET, authorization, vercelEnv: 'production' })).toEqual({
        status: 401,
        code: 'unauthorised',
      })
    }
  })

  it('lets the right secret through on production and locally', () => {
    expect(
      refuseCron({ secret: SECRET, authorization: `Bearer ${SECRET}`, vercelEnv: 'production' }),
    ).toBeNull()
    expect(
      refuseCron({ secret: SECRET, authorization: `Bearer ${SECRET}`, vercelEnv: undefined }),
    ).toBeNull()
  })
})

describe('runRounds', () => {
  it('stops when a round runs nothing', async () => {
    const rounds = [
      { ran: 25, remaining: true },
      { ran: 3, remaining: true },
      { ran: 0, remaining: false },
    ]
    const round = vi.fn(async () => rounds.shift() as { ran: number; remaining: boolean })
    const summary = await runRounds(round, { budgetMs: 45_000, now: () => 0 })
    expect(summary).toEqual({ rounds: 3, ran: 28, stoppedBy: 'empty' })
  })

  it('stops when the queue says nothing remains', async () => {
    const round = vi.fn(async () => ({ ran: 4, remaining: false }))
    expect(await runRounds(round, { budgetMs: 45_000, now: () => 0 })).toEqual({
      rounds: 1,
      ran: 4,
      stoppedBy: 'empty',
    })
  })

  it('starts no round once the budget is spent', async () => {
    let clock = 0
    const round = vi.fn(async () => {
      clock += 20_000
      return { ran: 25, remaining: true }
    })
    const summary = await runRounds(round, { budgetMs: 45_000, now: () => clock })
    // Rounds start at 0, 20 s and 40 s; the fourth would start at 60 s.
    expect(summary).toEqual({ rounds: 3, ran: 75, stoppedBy: 'budget' })
  })
})
