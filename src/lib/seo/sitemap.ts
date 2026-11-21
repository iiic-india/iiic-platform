import type { MetadataRoute } from 'next'

import { pagePath } from '@/lib/content/slug'

import { APP_PAGES } from './appPages'
import { isNoindexPath } from './paths'
import { canonicalPath, canonicalUrl, siteOrigin } from './site'

export type SitemapSource = {
  /** Every starter page's slug (src/content/starter). */
  starterSlugs: readonly string[]
  /** The pages published in the CMS now, with when each last changed. */
  published: readonly { slug: string; updatedAt?: string | null }[]
  /** Every slug that has been published at some time, whether or not it is now (D-57). */
  everPublished: readonly string[]
  /** Every address a redirect leads from, which no starter page is shown at (D-57). */
  redirected?: readonly string[]
}

/** Where the share images are served: the route there takes every address below it. */
const SHARE_IMAGES = '/og/'

/** A page the site serves: its path, its slug unless the app draws it, and its date if known. */
export type ServedPage = { path: string; slug?: string; updatedAt?: string | null }

/**
 * Every page the site serves today that a search engine may list, once each: the sitemap and
 * llms.txt both name exactly these. In order: the starter pages' addresses, each with the
 * page published there (and the date it last changed) or its starter page while no page there
 * has ever been published and no redirect leads from there (D-51, D-57, with no date, since
 * none is known); then the pages published at any other address; then the pages the app draws
 * itself. A page that was published and is not now is a 404, so it is left out (D-57), and so
 * is every route that is never indexed (D-67). An address the app draws itself is the app's: a
 * page published there is never shown. Nor is a page published under /og/, where the share
 * images' route answers (src/app/og/[...slug]/route.tsx), so it is left out too.
 */
export function servedPages({
  starterSlugs,
  published,
  everPublished,
  redirected = [],
}: SitemapSource): ServedPage[] {
  const changed = new Map(published.map(({ slug, updatedAt }) => [slug, updatedAt ?? null]))
  const seen = new Set(everPublished)
  const moved = new Set(redirected)
  const starters = new Set(starterSlugs)
  const fromCms = [
    ...starterSlugs.filter(
      (slug) => changed.has(slug) || (!seen.has(slug) && !moved.has(pagePath(slug))),
    ),
    ...published.map(({ slug }) => slug).filter((slug) => !starters.has(slug)),
  ].map((slug) => ({ path: canonicalPath(pagePath(slug)), slug, updatedAt: changed.get(slug) }))
  const fromApp: ServedPage[] = APP_PAGES.map(({ path }) => ({ path }))
  const appPaths = new Set(fromApp.map(({ path }) => path))
  const pages = new Map<string, ServedPage>()
  for (const page of [...fromCms.filter(({ path }) => !appPaths.has(path)), ...fromApp]) {
    if (isNoindexPath(page.path) || page.path.startsWith(SHARE_IMAGES)) continue
    if (!pages.has(page.path)) pages.set(page.path, page)
  }
  return [...pages.values()]
}

/**
 * The sitemap (plan A4): every page the site serves today (servedPages), on the platform
 * domain, with the date a published page last changed. A starter page and a page the app draws
 * have no date rather than an invented one. No priority or change frequency: search engines
 * ignore both.
 */
export function sitemapEntries(
  source: SitemapSource,
  origin: string = siteOrigin(),
): MetadataRoute.Sitemap {
  return servedPages(source).map(({ path, updatedAt }) => {
    const url = canonicalUrl(path, origin)
    return updatedAt ? { url, lastModified: updatedAt } : { url }
  })
}
