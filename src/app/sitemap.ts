import type { MetadataRoute } from 'next'
import { connection } from 'next/server'

import { sitemapEntries } from '@/lib/seo/sitemap'
import { sitemapSource } from '@/lib/seo/sitemapSource'

// docs/12 §6: every route handler declares its runtime and its time limit. Next.js serves this
// file through a route handler of its own, which takes these settings.
export const runtime = 'nodejs'
export const maxDuration = 10

/**
 * /sitemap.xml (plan A4): the pages the site serves today, on the platform domain. Read per
 * request from cached CMS data, so a page published in the admin is listed at once. It is
 * served before launch too; the noindex header still governs (D-50).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection()
  return sitemapEntries(await sitemapSource())
}
