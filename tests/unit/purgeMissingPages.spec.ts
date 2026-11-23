// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ownerWithCode } from '@/access/policy'
import { MissingPages } from '@/collections/MissingPages'
import { jobs } from '@/jobs'
import { purgeMissingPagesTask } from '@/jobs/purgeMissingPages'
import { recordAudit } from '@/lib/audit/record'
import { KEPT_FOR_DAYS } from '@/lib/redirects/missingPages'
import { purgeCutoff, purgeMissingPages } from '@/lib/redirects/store'

vi.mock('@/lib/audit/record', () => ({ recordAudit: vi.fn(async () => undefined) }))
vi.mock('@/lib/redirects/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/redirects/store')>()),
  purgeMissingPages: vi.fn(),
}))

// The 404 log's retention (docs/04: purged after 180 days; docs/06 O5), and the collection the
// admin shows it in (docs/05, Content → Broken links).

const DAY = 24 * 60 * 60 * 1000

describe('the retention job for the 404 log', () => {
  const req = { payload: { fake: 'payload' } }
  const handler = purgeMissingPagesTask.handler as (args: never) => Promise<{
    output: { removed: number }
  }>
  const run = () => handler({ req, input: {} } as never)

  beforeEach(() => {
    vi.mocked(purgeMissingPages).mockReset()
    vi.mocked(recordAudit).mockClear()
  })

  it('is a task named by its automation, O5, and retried as docs/06 says', () => {
    expect(purgeMissingPagesTask.slug).toBe('O5-purge-missing-pages')
    expect(purgeMissingPagesTask.retries).toBe(3)
    // Nothing runs it on its own: no schedule here, and Payload's autoRun is never used.
    expect(purgeMissingPagesTask).not.toHaveProperty('schedule')
  })

  it('removes the entries nobody has asked for in 180 days, and says how many', async () => {
    vi.mocked(purgeMissingPages).mockResolvedValueOnce(4)
    const before = Date.now()
    expect(await run()).toEqual({ output: { removed: 4 } })
    const [payload, cutoff] = vi.mocked(purgeMissingPages).mock.calls[0] ?? []
    expect(payload).toBe(req.payload)
    const age = before - (cutoff as Date).getTime()
    expect(age).toBeGreaterThanOrEqual(KEPT_FOR_DAYS * DAY - 1000)
    expect(age).toBeLessThanOrEqual(KEPT_FOR_DAYS * DAY + 1000)
  })

  it('records one audit entry for a run that removed something, none for a run that did not', async () => {
    vi.mocked(purgeMissingPages).mockResolvedValueOnce(2)
    await run()
    expect(recordAudit).toHaveBeenCalledWith(
      req,
      { action: 'purge-expired', entity: 'missing-pages' },
      null,
    )
    vi.mocked(recordAudit).mockClear()
    vi.mocked(purgeMissingPages).mockResolvedValueOnce(0)
    // Run twice, the second run finds nothing to remove.
    expect(await run()).toEqual({ output: { removed: 0 } })
    expect(recordAudit).not.toHaveBeenCalled()
  })

  it('cuts off at 180 days before now', () => {
    const now = new Date('2026-11-22T00:00:00.000Z')
    expect(purgeCutoff(now).toISOString()).toBe('2026-05-26T00:00:00.000Z')
  })

  it('is registered with Payload, nightly through the cron route, never autoRun, for owners alone', () => {
    // M6 gives it its schedule in the jobs config (docs/19 §2): 02:00 IST is 20:30 UTC.
    expect(jobs.tasks?.find((task) => task.slug === purgeMissingPagesTask.slug)).toEqual({
      ...purgeMissingPagesTask,
      schedule: [{ cron: '0 30 20 * * *', queue: 'default' }],
    })
    expect(jobs).not.toHaveProperty('autoRun')
    expect(jobs.access).toEqual({ run: ownerWithCode, queue: ownerWithCode, cancel: ownerWithCode })
  })
})

describe('the 404 log in the admin', () => {
  const field = (name: string) =>
    MissingPages.fields.find((candidate) => 'name' in candidate && candidate.name === name) as {
      access?: { update?: () => boolean }
      admin?: { readOnly?: boolean }
    }

  it('is Content → Broken links, most visited first', () => {
    expect(MissingPages.slug).toBe('missing-pages')
    expect(MissingPages.labels).toEqual({ singular: 'Broken link', plural: 'Broken links' })
    expect(MissingPages.admin?.group).toBe('Content')
    expect(MissingPages.defaultSort).toBe('-hits')
  })

  it('keeps what the 404 page wrote out of anyone’s hands: only the redirect is set by staff', () => {
    for (const name of ['path', 'hits', 'firstSeen', 'lastSeen', 'referrerHost']) {
      expect(field(name).access?.update?.(), name).toBe(false)
      expect(field(name).admin?.readOnly, name).toBe(true)
    }
    expect(field('resolved').access).toBeUndefined()
  })
})
