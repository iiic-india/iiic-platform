import 'server-only'

import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'
import { cache } from 'react'

import { starterAt } from '@/content/starter'
import config from '@payload-config'

import { PAGES_TAG, pageTag } from './revalidate'
import type { PageContent } from './types'

/** The published page at a slug, as a visitor may read it: drafts are not returned. */
async function findPublishedPage(slug: string): Promise<PageContent | null> {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'pages',
    where: { slug: { equals: slug } },
    limit: 1,
    pagination: false,
    depth: 0,
    overrideAccess: false,
    select: { title: true, slug: true, description: true, layout: true, legalReview: true },
  })
  return docs[0] ?? null
}

/**
 * Whether the page at a slug has been published at some time, whether or not it is published
 * now (D-57). It reads past the access rules because it asks only that, never for the page.
 */
async function publishedBefore(slug: string): Promise<boolean> {
  const payload = await getPayload({ config })
  const { totalDocs } = await payload.count({
    collection: 'pages',
    where: { and: [{ slug: { equals: slug } }, { firstPublishedAt: { exists: true } }] },
    overrideAccess: true,
  })
  return totalDocs > 0
}

/**
 * The page at a slug: the published CMS page; else its starter page, as long as no page at
 * that address has ever been published (D-51); else null, the site's 404. While a page that
 * was published is unpublished, its address shows the 404, not the starter page; deleting the
 * page brings the starter page back (D-57). The CMS data is cached and marked stale when an
 * editor publishes, unpublishes, moves or deletes a page (docs/12 §1, §4), and one request
 * reads it once however many components ask.
 */
export const getPage = cache(async (slug: string): Promise<PageContent | null> => {
  const cached = unstable_cache(
    async () => {
      const page = await findPublishedPage(slug)
      return { page, publishedBefore: page !== null || (await publishedBefore(slug)) }
    },
    ['page-state', slug],
    { tags: [PAGES_TAG, pageTag(slug)] },
  )
  const state = await cached()
  return state.page ?? (state.publishedBefore ? null : (starterAt(slug) ?? null))
})
