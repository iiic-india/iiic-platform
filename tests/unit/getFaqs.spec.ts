// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getFaqs } from '@/lib/content/faqs'
import { FAQS_TAG, faqsTag } from '@/lib/content/revalidate'

// The questions a page shows (src/lib/content/faqs.ts): read as a visitor reads them, in their
// order, and cached under the page's own tag. The CMS is faked.
const { find, cacheCalls } = vi.hoisted(() => ({
  find: vi.fn(),
  cacheCalls: [] as unknown[][],
}))

vi.mock('server-only', () => ({}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: async () => ({ find }) }))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: () => unknown, key: string[], options: unknown) => {
    cacheCalls.push([key, options])
    return fn
  },
}))

beforeEach(() => {
  find.mockReset()
  cacheCalls.length = 0
})

describe('the questions a page shows', () => {
  it('are the published ones for that page, in their order, as a visitor may read them', async () => {
    find.mockResolvedValue({
      docs: [
        { id: 3, question: 'Fake first question?', answer: 'Fake first answer.' },
        { id: 1, question: 'Fake second question?', answer: 'Fake second answer.' },
      ],
    })
    expect(await getFaqs('organisations/team-map')).toEqual([
      { id: '3', question: 'Fake first question?', answer: 'Fake first answer.' },
      { id: '1', question: 'Fake second question?', answer: 'Fake second answer.' },
    ])
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'faqs',
        where: { page: { equals: 'organisations/team-map' } },
        sort: ['order', 'createdAt'],
        overrideAccess: false,
        depth: 0,
        select: { question: true, answer: true },
      }),
    )
    // Never without a limit (docs/12 §4).
    expect(find.mock.calls[0]?.[0].limit).toBeGreaterThan(0)
  })

  it('are none where nothing is published for the page', async () => {
    find.mockResolvedValue({ docs: [] })
    expect(await getFaqs('organisations/brand-positioning')).toEqual([])
  })

  it('are cached under the page’s own tag, which a change to one of its questions marks stale', async () => {
    find.mockResolvedValue({ docs: [] })
    await getFaqs('counselling')
    expect(cacheCalls).toEqual([
      [['page-faqs', 'counselling'], { tags: [FAQS_TAG, faqsTag('counselling')] }],
    ])
  })
})
