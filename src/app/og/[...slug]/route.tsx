import { getPage } from '@/lib/content/pages'
import { PAGE_SLUG, pagePath } from '@/lib/content/slug'
import { APP_PAGES } from '@/lib/seo/appPages'
import { isNoindexPath } from '@/lib/seo/paths'
import { shareImage, type ShareImageInput } from '@/lib/seo/shareImage'

// docs/12 §6: every route handler declares its runtime and its time limit.
export const runtime = 'nodejs'
export const maxDuration = 10

type Context = { params: Promise<{ slug: string[] }> }

/**
 * What the image at a slug shows, or null where there is none. "home" is the site's own image,
 * which the platform layout also gives every page without one (the 404 among them), so it does
 * not depend on the home page being published. Every other slug must be a page a visitor can
 * read now: one the app draws itself (src/lib/seo/appPages.ts), or the page getPage finds, as
 * the catch-all route does. A route that is never indexed has no image (D-67).
 */
async function imageAt(slug: string): Promise<ShareImageInput | null> {
  if (slug === 'home') return { home: true }
  if (!PAGE_SLUG.test(slug) || isNoindexPath(pagePath(slug))) return null
  const appPage = APP_PAGES.find((page) => page.path === pagePath(slug))
  if (appPage) return { title: appPage.title }
  const page = await getPage(slug)
  return page ? { title: page.title } : null
}

/**
 * /og/<slug> (plan A8; docs/12 §3): a page's share image, at the address
 * shareImagePath gives it (src/lib/seo/metadata.ts). It is drawn on the platform itself from
 * the page's title, so no bot rule on another host can hide it (D-61); a title that still holds
 * a placeholder is drawn as the institute's name (src/lib/seo/shareImage.tsx). The version of
 * the title that the metadata adds as a query (shareImageUrl) is for the places that keep an
 * image by its address: the route ignores the query and draws the title as it is now. An
 * address with no page gets a plain 404. The image is drawn in full before the answer starts,
 * so a failure is an error the server reports, never half a picture kept at the edge for a day.
 */
export async function GET(_request: Request, { params }: Context): Promise<Response> {
  const input = await imageAt((await params).slug.join('/'))
  if (!input) return new Response(null, { status: 404 })
  const image = await shareImage(input)
  return new Response(await image.arrayBuffer(), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400',
    },
  })
}
