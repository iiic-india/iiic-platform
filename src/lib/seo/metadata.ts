import { createHash } from 'node:crypto'

import type { Metadata } from 'next'

import { pageSlugOf } from './paths'
import {
  canonicalPath,
  canonicalUrl,
  fact,
  HOME_TITLE,
  SITE_DESCRIPTION,
  SITE_LANGUAGE,
  SITE_NAME,
  TITLE_SUFFIX,
} from './site'

export type PageMetadataInput = {
  /** The page's path on the platform: "/", "/about", "/organisations/team-map". */
  path: string
  /** The page's search title (the layout adds " · IIIC"), or the home page's fixed title. */
  title: string
  /** The page's own description, if it has one; the site's sentence stands in otherwise. */
  description?: string | null
  /** "article" for the Journal (R2); every other page is a website page. */
  type?: 'website' | 'article'
  /** Writes a robots noindex tag as well. The X-Robots-Tag header remains the real control. */
  noindex?: boolean
}

/** Where a page's generated share image is served (src/app/og/[...slug]/route.tsx). */
export function shareImagePath(path: string): string {
  return `/og/${pageSlugOf(path)}`
}

export const SHARE_IMAGE_SIZE = { width: 1200, height: 630 } as const

/**
 * The address a page's metadata gives its share image. Facebook and others keep an image by its
 * address, so every page's but the home page's carries a version of the title the image draws:
 * the first 8 hex digits of its SHA-256. A new title is a new address, fetched afresh; the route
 * ignores the query. The home page's image, which the platform layout also gives every page
 * without one, draws the institute's name, so its address never changes.
 */
export function shareImageUrl(path: string, title: string): string {
  const address = shareImagePath(path)
  if (canonicalPath(path) === '/') return address
  return `${address}?v=${createHash('sha256').update(title).digest('hex').slice(0, 8)}`
}

/**
 * A page's metadata (plan A1; D-65, D-68): its title and description as the page holds them,
 * a canonical URL on the platform domain whatever host answered, and the Open Graph and card
 * tags with the page's generated image. A title or description that is empty or still holds a
 * placeholder never reaches a search result: the title falls back to the site's name and the
 * description to the site's sentence. No keywords tag (plan F). A page that may be indexed
 * allows large image previews, without which Google Discover shows only small ones; a noindex
 * page says noindex instead.
 *
 * Next.js writes the home page's canonical URL and og:url as the bare origin, without the
 * slash this returns: with a metadataBase set it drops the path of a URL that is only "/". Both
 * forms are one URL.
 */
export function buildMetadata({
  path,
  title,
  description,
  type = 'website',
  noindex = false,
}: PageMetadataInput): Metadata {
  const url = canonicalUrl(path)
  const home = canonicalPath(path) === '/'
  const pageTitle = fact(title) ?? SITE_NAME
  const fullTitle = home ? HOME_TITLE : `${pageTitle}${TITLE_SUFFIX}`
  const text = fact(description) ?? SITE_DESCRIPTION
  // The image shows the page's title and IIIC's mark. A title that already names IIIC in full
  // (the About page's, or the fallback) is not followed by the name again.
  const alt = pageTitle.includes(SITE_NAME) ? pageTitle : `${pageTitle}, ${SITE_NAME}`
  const image = {
    url: shareImageUrl(path, pageTitle),
    ...SHARE_IMAGE_SIZE,
    alt: home ? SITE_NAME : alt,
  }
  return {
    title: home ? { absolute: HOME_TITLE } : pageTitle,
    description: text,
    alternates: { canonical: url },
    openGraph: {
      type,
      url,
      siteName: SITE_NAME,
      locale: SITE_LANGUAGE.replace('-', '_'),
      title: fullTitle,
      description: text,
      images: [image],
    },
    // No site handle: IIIC uses no X account (D-33).
    twitter: { card: 'summary_large_image', title: fullTitle, description: text, images: [image] },
    robots: noindex ? { index: false, follow: true } : { 'max-image-preview': 'large' },
  }
}
