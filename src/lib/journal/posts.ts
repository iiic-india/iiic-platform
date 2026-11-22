import 'server-only'

import { unstable_cache } from 'next/cache'
import { getPayload, type Where } from 'payload'
import { cache } from 'react'

import { POSTS_TAG, postTag, TOPICS_TAG } from '@/lib/content/revalidate'
import { previewer } from '@/lib/preview/session'
import type { Post, Topic, User } from '@/payload-types'
import config from '@payload-config'

import { isArticleSlug, PAGE_SIZE } from './addresses'

/**
 * What the Journal's pages read from the CMS (docs/12 §1, §4): published articles only, as a
 * visitor may read them (src/access/policy.ts), each query with its depth and its fields
 * named. The data is cached and marked stale when an editor publishes, changes, unpublishes or
 * deletes an article or a topic (src/lib/content/revalidate.ts); the lists also refresh every
 * ten minutes as a safety net (docs/12 §1). One request reads each answer once, however many
 * components ask.
 */

/** A topic as the site shows it. */
export type TopicSummary = Pick<Topic, 'id' | 'name' | 'slug' | 'door' | 'description'>

/** An article as a list shows it. */
export type PostSummary = Pick<Post, 'id' | 'title' | 'slug' | 'excerpt' | 'publishedAt'> &
  Pick<Post, 'readingTime'> & { topics: TopicSummary[] }

/** An article as its own page shows it. */
export type PostDetail = PostSummary &
  Pick<
    Post,
    'body' | 'question' | 'author' | 'authorName' | 'searchTitle' | 'description' | 'updatedAt'
  >

/** One page of a list. */
export type PostList = { docs: PostSummary[]; totalDocs: number; totalPages: number; page: number }

/** The lists refresh this often even when nothing marks them stale (docs/12 §1). */
const LIST_REVALIDATE_SECONDS = 600

const PUBLISHED: Where = { _status: { equals: 'published' } }

/** The fields of a topic every query populates, and no other. */
const TOPIC_FIELDS = { name: true, slug: true, door: true, description: true } as const

const SUMMARY_FIELDS = {
  title: true,
  slug: true,
  excerpt: true,
  publishedAt: true,
  readingTime: true,
  topics: true,
} as const

const DETAIL_FIELDS = {
  ...SUMMARY_FIELDS,
  body: true,
  question: true,
  author: true,
  authorName: true,
  searchTitle: true,
  description: true,
  updatedAt: true,
} as const

/** Newest first; articles published at the same moment in the order they were made. */
const NEWEST_FIRST = ['-publishedAt', '-createdAt']

/** The topics an article carries, in its order, without any the reader cannot see. */
function topicsOf(value: unknown): TopicSummary[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (topic): topic is TopicSummary =>
      typeof topic === 'object' && topic !== null && typeof topic.slug === 'string',
  )
}

function summaryOf(post: Record<string, unknown>): PostSummary {
  return { ...(post as unknown as PostSummary), topics: topicsOf(post.topics) }
}

/**
 * The topics that hold a published article, by name: the ones the Journal lists. A topic
 * with none has no page yet (its address is a 404).
 */
export const getTopics = cache(async (): Promise<TopicSummary[]> => {
  const cached = unstable_cache(
    async () => {
      const payload = await getPayload({ config })
      const posts = await payload.find({
        collection: 'posts',
        where: PUBLISHED,
        limit: 1000,
        pagination: false,
        depth: 0,
        overrideAccess: false,
        select: { topics: true },
      })
      const ids = [...new Set(posts.docs.flatMap((post) => post.topics ?? []))].filter(
        (id): id is number => typeof id === 'number',
      )
      if (ids.length === 0) return []
      const topics = await payload.find({
        collection: 'topics',
        where: { id: { in: ids } },
        sort: 'name',
        limit: 1000,
        pagination: false,
        depth: 0,
        overrideAccess: false,
        select: TOPIC_FIELDS,
      })
      return topics.docs as TopicSummary[]
    },
    ['journal-topics'],
    { tags: [POSTS_TAG, TOPICS_TAG], revalidate: LIST_REVALIDATE_SECONDS },
  )
  return cached()
})

/** A page of published articles, newest first: every topic's, or one topic's. */
export const listPosts = cache(async (topicId: number | null, page: number): Promise<PostList> => {
  const cached = unstable_cache(
    async () => {
      const payload = await getPayload({ config })
      const where: Where =
        topicId === null ? PUBLISHED : { and: [PUBLISHED, { topics: { in: [topicId] } }] }
      const found = await payload.find({
        collection: 'posts',
        where,
        sort: NEWEST_FIRST,
        limit: PAGE_SIZE,
        page,
        depth: 1,
        overrideAccess: false,
        select: SUMMARY_FIELDS,
        populate: { topics: TOPIC_FIELDS },
      })
      return {
        docs: found.docs.map((post) => summaryOf(post as unknown as Record<string, unknown>)),
        totalDocs: found.totalDocs,
        totalPages: found.totalPages,
        page: found.page ?? page,
      }
    },
    ['journal-list', String(topicId ?? 'all'), String(page)],
    { tags: [POSTS_TAG, TOPICS_TAG], revalidate: LIST_REVALIDATE_SECONDS },
  )
  return cached()
})

/** The published article at an address, or null: a draft is never returned. */
export const getPost = cache(async (slug: string): Promise<PostDetail | null> => {
  if (!isArticleSlug(slug)) return null
  const cached = unstable_cache(
    async () => {
      const payload = await getPayload({ config })
      const { docs } = await payload.find({
        collection: 'posts',
        where: { and: [PUBLISHED, { slug: { equals: slug } }] },
        limit: 1,
        pagination: false,
        depth: 1,
        overrideAccess: false,
        select: DETAIL_FIELDS,
        populate: { topics: TOPIC_FIELDS },
      })
      const post = docs[0] as unknown as Record<string, unknown> | undefined
      return post ? ({ ...post, topics: topicsOf(post.topics) } as PostDetail) : null
    },
    ['journal-post', slug],
    { tags: [POSTS_TAG, TOPICS_TAG, postTag(slug)] },
  )
  return cached()
})

/**
 * The article a route draws at an address: in a preview, the newest version of the article
 * there, draft or published, as the staff member previewing may read it (docs/15 §5.3, OS-4);
 * for everyone else, the published article (getPost). Never cached: a draft is read for that
 * request alone. The share images, the feed and the lists read published articles only.
 */
export const getPostToShow = cache(async (slug: string): Promise<PostDetail | null> => {
  if (!isArticleSlug(slug)) return null
  const user = await previewer('posts')
  if (!user) return getPost(slug)
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'posts',
    where: { slug: { equals: slug } },
    draft: true,
    limit: 1,
    pagination: false,
    depth: 1,
    overrideAccess: false,
    user: user as User,
    select: DETAIL_FIELDS,
    populate: { topics: TOPIC_FIELDS },
  })
  const post = docs[0] as unknown as Record<string, unknown> | undefined
  return post ? ({ ...post, topics: topicsOf(post.topics) } as PostDetail) : getPost(slug)
})

/**
 * The newest published articles, for the Journal's three on the home page (docs/11 §4, row 8;
 * docs/content/copy-architecture.md §4.1): none while nothing is published, and the home page
 * then draws no Journal section.
 */
export const latestPosts = cache(async (count: number): Promise<PostSummary[]> => {
  const cached = unstable_cache(
    async () => {
      const payload = await getPayload({ config })
      const found = await payload.find({
        collection: 'posts',
        where: PUBLISHED,
        sort: NEWEST_FIRST,
        limit: count,
        pagination: false,
        depth: 1,
        overrideAccess: false,
        select: SUMMARY_FIELDS,
        populate: { topics: TOPIC_FIELDS },
      })
      return found.docs.map((post) => summaryOf(post as unknown as Record<string, unknown>))
    },
    ['journal-latest', String(count)],
    { tags: [POSTS_TAG, TOPICS_TAG], revalidate: LIST_REVALIDATE_SECONDS },
  )
  return cached()
})

/** An entry of the Journal's index: what the sitemap and llms.txt say of an article. */
export type IndexEntry = Pick<
  Post,
  'slug' | 'title' | 'excerpt' | 'searchTitle' | 'description' | 'publishedAt' | 'updatedAt'
>

/**
 * Every published article, newest first, with its dates, and the topics that hold one: what
 * the sitemap and llms.txt list (src/lib/seo/sitemapSource.ts). Past 1,000 articles the
 * sitemap is split (docs/12 §13); the Journal is far from that.
 */
export async function journalIndex(): Promise<{ posts: IndexEntry[]; topics: TopicSummary[] }> {
  const cached = unstable_cache(
    async () => {
      const payload = await getPayload({ config })
      const posts = await payload.find({
        collection: 'posts',
        where: PUBLISHED,
        sort: NEWEST_FIRST,
        limit: 1000,
        pagination: false,
        depth: 0,
        overrideAccess: false,
        select: {
          slug: true,
          title: true,
          excerpt: true,
          searchTitle: true,
          description: true,
          publishedAt: true,
          updatedAt: true,
        },
      })
      return posts.docs.map(
        ({ slug, title, excerpt, searchTitle, description, publishedAt, updatedAt }) => ({
          slug,
          title,
          excerpt,
          searchTitle,
          description,
          publishedAt,
          updatedAt,
        }),
      )
    },
    ['journal-index'],
    { tags: [POSTS_TAG] },
  )
  const [posts, topics] = await Promise.all([cached(), getTopics()])
  return { posts, topics }
}
