import { Feed } from 'feed'

import { JOURNAL_PAGE } from '@/lib/seo/appPages'
import { canonicalUrl, SITE_LANGUAGE, siteOrigin } from '@/lib/seo/site'

import { articlePath, FEED_PATH, JOURNAL_PATH } from './addresses'
import type { IndexEntry } from './posts'
import { articleDescription, FEED_TITLE } from './seo'

/**
 * The Journal's RSS feed (docs/02; docs/12 §3), written by the `feed` library: the newest
 * published articles, each with its title, its description (its own, else its excerpt, as search
 * results show it), the date it was published and its absolute address on the production origin,
 * as every canonical URL is (src/lib/seo/site.ts). Nothing else: no author email, no copyright
 * line, no content IIIC has not published. Pure, so the route and the tests write the same feed.
 */

/** How many of the newest articles the feed carries. */
export const FEED_SIZE = 20

/** When an article was published, else when it last changed. */
function dateOf(post: Pick<IndexEntry, 'publishedAt' | 'updatedAt'>): Date {
  return new Date(post.publishedAt ?? post.updatedAt)
}

/** The feed of the newest published articles, newest first, as RSS 2.0. */
export function journalFeed(posts: readonly IndexEntry[], origin: string = siteOrigin()): string {
  const journal = canonicalUrl(JOURNAL_PATH, origin)
  const items = [...posts].sort((a, b) => dateOf(b).getTime() - dateOf(a).getTime())
  const changed = items
    .map((post) => new Date(post.updatedAt).getTime())
    .filter((time) => !Number.isNaN(time))
  const feed = new Feed({
    id: journal,
    link: journal,
    title: FEED_TITLE,
    description: JOURNAL_PAGE.description,
    language: SITE_LANGUAGE,
    feedLinks: { rss: canonicalUrl(FEED_PATH, origin) },
    generator: false,
    // The newest change to an article; with none, the library gives the time it was written.
    ...(changed.length > 0 ? { updated: new Date(Math.max(...changed)) } : {}),
  })
  for (const post of items.slice(0, FEED_SIZE)) {
    const link = canonicalUrl(articlePath(post.slug), origin)
    feed.addItem({
      title: post.title,
      id: link,
      link,
      date: dateOf(post),
      description: articleDescription(post),
    })
  }
  return feed.rss2()
}
