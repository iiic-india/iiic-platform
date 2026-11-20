// @vitest-environment node
import { revalidateTag } from 'next/cache'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PAGES_TAG, pageTag, revalidatePages } from '@/lib/content/revalidate'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
const revalidate = vi.mocked(revalidateTag)

beforeEach(() => {
  revalidate.mockReset()
})

describe('revalidatePages', () => {
  it('marks the list and each named page stale at once', () => {
    revalidatePages('framework', undefined, 'home', null)
    expect(revalidate.mock.calls).toEqual([
      [PAGES_TAG, { expire: 0 }],
      [pageTag('framework'), { expire: 0 }],
      [pageTag('home'), { expire: 0 }],
    ])
  })

  it('does nothing outside a request, where there is no cache to mark', () => {
    revalidate.mockImplementation(() => {
      throw new Error('Invariant: static generation store missing in revalidateTag pages')
    })
    expect(() => revalidatePages('home')).not.toThrow()
  })

  it('lets any other failure through', () => {
    revalidate.mockImplementation(() => {
      throw new Error('fake failure')
    })
    expect(() => revalidatePages('home')).toThrow('fake failure')
  })
})
