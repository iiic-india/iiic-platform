import 'server-only'

import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'
import { cache } from 'react'

import { STARTER_PAGES } from '@/content/starter'
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
    select: { title: true, slug: true, description: true, layout: true },
  })
  return docs[0] ?? null
}

/**
 * The page at a slug: the published CMS page, else the starter page (D-51), else null. The
 * CMS data is cached and marked stale when an editor publishes (docs/12 §1, §4), and one
 * request reads it once however many components ask.
 */
export const getPage = cache(async (slug: string): Promise<PageContent | null> => {
  const cached = unstable_cache(() => findPublishedPage(slug), ['page', slug], {
    tags: [PAGES_TAG, pageTag(slug)],
  })
  return (await cached()) ?? STARTER_PAGES[slug] ?? null
})
