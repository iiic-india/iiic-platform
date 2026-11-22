import { connection } from 'next/server'

import { getPage } from '@/lib/content/pages'
import { APP_PAGES } from '@/lib/seo/appPages'
import { buildLlmsTxt, type LlmsPage } from '@/lib/seo/llms'
import { HOME_TITLE } from '@/lib/seo/site'
import { servedPages } from '@/lib/seo/sitemap'
import { sitemapSource } from '@/lib/seo/sitemapSource'

// docs/12 §6: every route handler declares its runtime and its time limit.
export const runtime = 'nodejs'
export const maxDuration = 10

/**
 * /llms.txt (D-66): the pages the sitemap lists, no more and no fewer (servedPages): each
 * page published in the CMS, whether or not it has a starter file, each starter page still
 * served (D-51, D-57), the pages the app draws itself, and the Journal's topics and published
 * articles, with the title and description their metadata carries and each article's date. A
 * page that is a 404 at present is left out, and so is every route that is never indexed
 * (D-67). The file itself is sent with noindex, which keeps it out of search results without
 * stopping AI tools from reading it; before launch next.config.ts sends the same header on every
 * route (D-50).
 */
export async function GET(): Promise<Response> {
  await connection()
  const served = servedPages(await sitemapSource())
  const pages = await Promise.all(
    served.map(async ({ path, slug, journal }): Promise<LlmsPage | null> => {
      if (journal) return { path, ...journal }
      if (slug === undefined) return APP_PAGES.find((page) => page.path === path) ?? null
      const page = await getPage(slug)
      if (!page) return null
      return {
        path,
        title: slug === 'home' ? HOME_TITLE : page.title,
        description: page.description,
      }
    }),
  )
  const body = buildLlmsTxt(pages.filter((page) => page !== null))
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400',
      'X-Robots-Tag': 'noindex',
    },
  })
}
