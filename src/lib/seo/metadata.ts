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

/** What a Journal article adds to its metadata (docs/12 §3: og:type article). */
export type ArticleMetadata = {
  /** The article's own title, which its share image draws; the search title may be shorter. */
  headline: string
  /** The author's name, which the share image draws under the title. */
  author?: string | null
  /** When it was published and last changed, as ISO dates. */
  publishedTime?: string | null
  modifiedTime?: string | null
  /** Its first topic's name. */
  section?: string | null
}

export type PageMetadataInput = {
  /** The page's path on the platform: "/", "/about", "/organisations/team-map". */
  path: string
  /** The page's search title (the layout adds " · IIIC"), or the home page's fixed title. */
  title: string
  /** The page's own description, if it has one; the site's sentence stands in otherwise. */
  description?: string | null
  /** "article" for a Journal article; every other page is a website page. */
  type?: 'website' | 'article'
  /** A Journal article's headline, author, dates and section, with type "article". */
  article?: ArticleMetadata
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
 * address, so every page's but the home page's carries a version of what the image draws: the
 * first 8 hex digits of the SHA-256 of its title, and of an article's author's name after it.
 * A new title or author is a new address, fetched afresh; the route ignores the query. The home
 * page's image, which the platform layout also gives every page without one, draws the
 * institute's name, so its address never changes.
 */
export function shareImageUrl(path: string, title: string, byline?: string | null): string {
  const address = shareImagePath(path)
  if (canonicalPath(path) === '/') return address
  const drawn = byline ? `${title}\n${byline}` : title
  return `${address}?v=${createHash('sha256').update(drawn).digest('hex').slice(0, 8)}`
}

/**
 * What an article's share image draws, and its address: the article's own title, else its
 * search title, else the institute's name; and its author's name where it has one.
 */
export function articleImage(
  path: string,
  title: string,
  article: Pick<ArticleMetadata, 'headline' | 'author'> | undefined,
): { title: string; byline?: string; url: string } {
  const drawn = fact(article?.headline) ?? fact(title) ?? SITE_NAME
  const byline = fact(article?.author)
  return { title: drawn, byline, url: shareImageUrl(path, drawn, byline) }
}

/** The Open Graph article fields Next.js writes as article:published_time and the rest. */
function articleTags(article: ArticleMetadata | undefined) {
  const author = fact(article?.author)
  const section = fact(article?.section)
  return {
    ...(article?.publishedTime ? { publishedTime: article.publishedTime } : {}),
    ...(article?.modifiedTime ? { modifiedTime: article.modifiedTime } : {}),
    ...(author ? { authors: [author] } : {}),
    ...(section ? { section } : {}),
  }
}

/**
 * A page's metadata (plan A1; D-65, D-68): its title and description as the page holds them,
 * a canonical URL on the platform domain whatever host answered, and the Open Graph and card
 * tags with the page's generated image. A title or description that is empty or still holds a
 * placeholder never reaches a search result: the title falls back to the site's name and the
 * description to the site's sentence. No keywords tag (plan F). A page that may be indexed
 * allows large image previews, without which Google Discover shows only small ones; a noindex
 * page says noindex instead. A Journal article is og:type "article", with the dates it was
 * published and changed, its author and its topic, and an image of its own title and author
 * (docs/12 §3).
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
  article,
  noindex = false,
}: PageMetadataInput): Metadata {
  const url = canonicalUrl(path)
  const home = canonicalPath(path) === '/'
  const pageTitle = fact(title) ?? SITE_NAME
  const fullTitle = home ? HOME_TITLE : `${pageTitle}${TITLE_SUFFIX}`
  const text = fact(description) ?? SITE_DESCRIPTION
  // The image shows the page's title (an article's own title, with its author's name) and
  // IIIC's mark. A title that already names IIIC in full (the About page's, or the fallback) is
  // not followed by the name again.
  const drawn =
    type === 'article'
      ? articleImage(path, pageTitle, article)
      : { title: pageTitle, url: shareImageUrl(path, pageTitle) }
  const alt = drawn.title.includes(SITE_NAME) ? drawn.title : `${drawn.title}, ${SITE_NAME}`
  const image = { url: drawn.url, ...SHARE_IMAGE_SIZE, alt: home ? SITE_NAME : alt }
  const shared = {
    url,
    siteName: SITE_NAME,
    locale: SITE_LANGUAGE.replace('-', '_'),
    title: fullTitle,
    description: text,
    images: [image],
  }
  return {
    title: home ? { absolute: HOME_TITLE } : pageTitle,
    description: text,
    alternates: { canonical: url },
    openGraph:
      type === 'article'
        ? { type: 'article', ...shared, ...articleTags(article) }
        : { type: 'website', ...shared },
    // No site handle: IIIC uses no X account (D-33).
    twitter: { card: 'summary_large_image', title: fullTitle, description: text, images: [image] },
    robots: noindex ? { index: false, follow: true } : { 'max-image-preview': 'large' },
  }
}
