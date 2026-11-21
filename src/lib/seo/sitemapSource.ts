import 'server-only'

import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import { STARTER_PAGES } from '@/content/starter'
import { PAGES_TAG } from '@/lib/content/revalidate'
import { redirectTable } from '@/lib/redirects/lookup'
import config from '@payload-config'

import type { SitemapSource } from './sitemap'

/**
 * What the CMS holds: the pages a visitor can read now (drafts are not returned), and every
 * address that has had a published page (D-57). Cached with the pages' tag, so publishing,
 * unpublishing, moving or deleting a page refreshes it (docs/12 §1, §4). Past 1,000 pages the
 * sitemap is split (docs/12 §13); the site is far from that.
 */
const cmsPages = unstable_cache(
  async (): Promise<Pick<SitemapSource, 'published' | 'everPublished'>> => {
    const payload = await getPayload({ config })
    const [published, everPublished] = await Promise.all([
      payload.find({
        collection: 'pages',
        where: { _status: { equals: 'published' } },
        limit: 1000,
        pagination: false,
        depth: 0,
        overrideAccess: false,
        select: { slug: true, updatedAt: true },
      }),
      // Only the addresses, never the pages, so this reads past the access rules (as
      // src/lib/content/pages.ts does for the same question).
      payload.find({
        collection: 'pages',
        where: { firstPublishedAt: { exists: true } },
        limit: 1000,
        pagination: false,
        depth: 0,
        overrideAccess: true,
        select: { slug: true },
      }),
    ])
    return {
      published: published.docs.map(({ slug, updatedAt }) => ({ slug, updatedAt })),
      everPublished: everPublished.docs.map(({ slug }) => slug),
    }
  },
  ['sitemap-cms-pages'],
  { tags: [PAGES_TAG] },
)

/**
 * What the sitemap and llms.txt list: the starter pages this deployment ships, what the CMS
 * holds, and the addresses redirects lead from (src/lib/redirects/lookup.ts, cached by its own
 * tags). Only the CMS parts are cached. The cache entry outlives a deployment and its key does
 * not change when a starter page is added or removed, so the starter pages are read here, from
 * the deployment's own files, as getPage does (src/lib/content/pages.ts).
 */
export async function sitemapSource(): Promise<SitemapSource> {
  const [{ published, everPublished }, redirects] = await Promise.all([cmsPages(), redirectTable()])
  return {
    starterSlugs: Object.keys(STARTER_PAGES),
    published,
    everPublished,
    redirected: redirects.map(({ from }) => from),
  }
}
