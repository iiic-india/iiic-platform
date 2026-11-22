import 'server-only'

import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'
import { cache } from 'react'

import { starterAt } from '@/content/starter'
import { previewer } from '@/lib/preview/session'
import { redirectFor } from '@/lib/redirects/lookup'
import type { User } from '@/payload-types'
import config from '@payload-config'

import { PAGES_TAG, pageTag } from './revalidate'
import { pagePath } from './slug'
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
 * that address has ever been published (D-51) and no redirect leads from it (D-57); else null,
 * which the route answers with the redirect from the address if there is one, and the site's
 * 404 otherwise (src/lib/redirects/lookup.ts). While a page that was published is unpublished,
 * its address shows the 404, not the starter page; deleting the page brings the starter page
 * back (D-57). The CMS data is cached and marked stale when an editor publishes, unpublishes,
 * moves or deletes a page (docs/12 §1, §4), and one request reads it once however many
 * components ask.
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
  if (state.page) return state.page
  const starter = state.publishedBefore ? undefined : starterAt(slug)
  if (!starter || (await redirectFor(pagePath(slug)))) return null
  return starter
})

/**
 * The newest version of the page at a slug, draft or published, as the staff member previewing
 * may read it (the read rule asks for their role and their two-factor code). Never cached: a
 * draft is read for that request alone.
 */
async function findLatestPage(slug: string, user: unknown): Promise<PageContent | null> {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'pages',
    where: { slug: { equals: slug } },
    draft: true,
    limit: 1,
    pagination: false,
    depth: 0,
    overrideAccess: false,
    user: user as User,
    select: { title: true, slug: true, description: true, layout: true, legalReview: true },
  })
  return docs[0] ?? null
}

/**
 * The page a route draws at a slug: in a preview, the newest version of the page there, draft
 * or published (docs/15 §5.3, OS-4); for everyone else, and in a preview of an address with no
 * page in the CMS, what getPage finds. Only the routes that draw a page ask this; the share
 * images, llms.txt and the sitemap read getPage, so no draft reaches anything cached.
 */
export const getPageToShow = cache(async (slug: string): Promise<PageContent | null> => {
  const user = await previewer('pages')
  const draft = user ? await findLatestPage(slug, user) : null
  return draft ?? getPage(slug)
})
