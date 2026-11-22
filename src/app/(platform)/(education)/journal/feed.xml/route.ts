import { connection } from 'next/server'

import { FEED_SIZE, journalFeed } from '@/lib/journal/feed'
import { journalIndex } from '@/lib/journal/posts'

// docs/12 §6: every route handler declares its runtime and its time limit.
export const runtime = 'nodejs'
export const maxDuration = 10

/**
 * /journal/feed.xml: the Journal's RSS feed (src/lib/journal/feed.ts), the newest published
 * articles only, never a draft (journalIndex reads published articles as a visitor may). It is
 * cached at the edge as llms.txt is, and kept out of search results with noindex: readers
 * subscribe to it, and the articles themselves are what search shows. The Journal's pages link
 * to it with rel="alternate" (src/lib/journal/seo.ts).
 */
export async function GET(): Promise<Response> {
  await connection()
  const { posts } = await journalIndex()
  return new Response(journalFeed(posts.slice(0, FEED_SIZE)), {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400',
      'X-Robots-Tag': 'noindex',
    },
  })
}
