// @vitest-environment node
import type { PayloadRequest } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

// A run of the job queue that ends cleanly even when the function holding it does not (docs/19
// §2): the jobs a stopped run left `processing` are released for a retry, then stopped with an
// error once their tries are spent; the dispatcher stops taking messages once its time is spent;
// and an issue's "Sent to" is read from the messages log. Payload, the store and the sender are
// faked; ids and slugs are fake.

const store = vi.hoisted(() => ({ due: [] as number[] }))
const sender = vi.hoisted(() => ({ clock: 0, tried: [] as number[] }))

vi.mock('@/lib/messaging/store', () => ({
  staleSending: vi.fn(async () => []),
  dueMessages: vi.fn(async () => store.due),
  move: vi.fn(async () => true),
}))
vi.mock('@/lib/messaging/try', () => ({
  // Each message takes ten seconds of the fake clock.
  tryMessage: vi.fn(async (_req: unknown, _deps: unknown, id: number) => {
    sender.tried.push(id)
    sender.clock += 10_000
    return 'sent'
  }),
}))

const { releaseStaleJobs, STALE_JOB_AFTER_MS } = await import('@/lib/automations/staleJobs')
const { TASK_RETRIES } = await import('@/lib/automations/failures')
const { dispatchWith } = await import('@/lib/messaging/dispatch')
const { countIssueSends } = await import('@/lib/newsletter/hooks')

type Job = { id: number; taskSlug: string; totalTried?: number }

function fakeReq(jobs: Job[]) {
  const updates: { id: number; data: Record<string, unknown> }[] = []
  const find = vi.fn(async () => ({ docs: jobs }))
  const req = {
    payload: {
      find,
      db: {
        updateOne: vi.fn(async (args: { id: number; data: Record<string, unknown> }) => {
          updates.push({ id: args.id, data: args.data })
          return {}
        }),
      },
    },
  } as unknown as PayloadRequest
  return { req, updates, find }
}

const NOW = new Date('2030-01-04T09:30:00.000Z')

describe('the jobs a stopped run left processing', () => {
  it('asks only for jobs processing, unfinished and untouched past any run’s length', async () => {
    const { req, find } = fakeReq([])
    expect(await releaseStaleJobs(req, NOW)).toEqual({ released: 0, stopped: 0 })
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'payload-jobs',
        where: {
          and: [
            { processing: { equals: true } },
            { completedAt: { exists: false } },
            {
              updatedAt: { less_than: new Date(NOW.getTime() - STALE_JOB_AFTER_MS).toISOString() },
            },
          ],
        },
      }),
    )
    // Longer than the cron function's 60 seconds, so no live run is ever released.
    expect(STALE_JOB_AFTER_MS).toBeGreaterThan(60_000)
  })

  it('releases a stuck job for a retry, counted as its automation’s failure', async () => {
    const { req, updates } = fakeReq([{ id: 7, taskSlug: 'messages-dispatch', totalTried: 0 }])
    const deps = { countFailure: vi.fn(async () => {}), raiseFailed: vi.fn(async () => {}) }
    expect(await releaseStaleJobs(req, NOW, deps)).toEqual({ released: 1, stopped: 0 })
    expect(updates).toEqual([{ id: 7, data: { processing: false, totalTried: 1 } }])
    expect(deps.countFailure).toHaveBeenCalledWith(req, 'messages-dispatch', NOW)
    expect(deps.raiseFailed).not.toHaveBeenCalled()
  })

  it('stops a job whose tries are spent, with an error O3 counts, and tells O3', async () => {
    const { req, updates } = fakeReq([
      { id: 8, taskSlug: 'messages-dispatch', totalTried: TASK_RETRIES.attempts },
      { id: 9, taskSlug: 'O3-failure-alert', totalTried: TASK_RETRIES.attempts },
    ])
    const deps = { countFailure: vi.fn(async () => {}), raiseFailed: vi.fn(async () => {}) }
    expect(await releaseStaleJobs(req, NOW, deps)).toEqual({ released: 0, stopped: 2 })
    expect(updates[0]).toEqual({
      id: 8,
      data: {
        processing: false,
        totalTried: TASK_RETRIES.attempts + 1,
        hasError: true,
        error: { message: 'stopped-unfinished' },
      },
    })
    // O3's own job raises nothing, so a failing alert never queues another.
    expect(deps.raiseFailed).toHaveBeenCalledTimes(1)
    expect(deps.raiseFailed).toHaveBeenCalledWith(req, 8)
  })
})

describe('the dispatcher’s time', () => {
  beforeEach(() => {
    sender.clock = 0
    sender.tried = []
    store.due = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  })

  const deps = { now: () => NOW, emit: async () => {} } as never

  it('takes no new message once its budget is spent; the next minute takes the rest', async () => {
    const summary = await dispatchWith(deps)({} as PayloadRequest, NOW, 50, {
      ms: 30_000,
      clock: () => sender.clock,
    })
    expect(sender.tried).toEqual([1, 2, 3])
    expect(summary.sent).toBe(3)
  })

  it('tries every due message when it has no budget', async () => {
    await dispatchWith(deps)({} as PayloadRequest, NOW, 50)
    expect(sender.tried).toHaveLength(10)
  })
})

describe('an issue’s “Sent to”', () => {
  const read = (doc: Record<string, unknown>, totalDocs = 4) => {
    const count = vi.fn(async () => ({ totalDocs }))
    const req = { payload: { count } } as unknown as PayloadRequest
    return {
      count,
      value: countIssueSends({ data: doc, req, value: 99 } as unknown as Parameters<
        typeof countIssueSends
      >[0]),
    }
  }

  it('counts the messages about the issue that left, not the subscribers planned', async () => {
    const { count, value } = read({ id: 12, status: 'sent' })
    expect(await value).toBe(4)
    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'messages',
        where: {
          and: [
            { subjectCollection: { equals: 'newsletter-issues' } },
            { subjectId: { equals: 12 } },
            { status: { in: ['sent', 'delivered', 'read'] } },
          ],
        },
      }),
    )
  })

  it('counts nothing for an issue not yet sending', async () => {
    const { count, value } = read({ id: 12, status: 'scheduled' })
    expect(await value).toBe(99)
    expect(count).not.toHaveBeenCalled()
  })
})
