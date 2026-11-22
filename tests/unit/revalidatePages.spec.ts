// @vitest-environment node
import { revalidateTag } from 'next/cache'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  PAGES_TAG,
  pageTag,
  POSTS_TAG,
  postTag,
  revalidatePages,
  revalidatePosts,
  revalidateTopics,
  TOPICS_TAG,
} from '@/lib/content/revalidate'

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

describe('revalidatePosts and revalidateTopics', () => {
  it('mark the Journal’s lists and each named article stale, at its new and old address', () => {
    revalidatePosts('fake-new', 'fake-old', null, undefined)
    expect(revalidate.mock.calls).toEqual([
      [POSTS_TAG, { expire: 0 }],
      [postTag('fake-new'), { expire: 0 }],
      [postTag('fake-old'), { expire: 0 }],
    ])
    expect(postTag('fake-new')).toBe('post:fake-new')
  })

  it('mark the topics stale, and the articles and lists that show them', () => {
    revalidateTopics()
    expect(revalidate.mock.calls).toEqual([
      [TOPICS_TAG, { expire: 0 }],
      [POSTS_TAG, { expire: 0 }],
    ])
  })

  it('do nothing outside a request', () => {
    revalidate.mockImplementation(() => {
      throw new Error('Invariant: static generation store missing in revalidateTag posts')
    })
    expect(() => revalidatePosts('fake-article')).not.toThrow()
    expect(() => revalidateTopics()).not.toThrow()
  })
})
