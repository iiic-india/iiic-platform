import type { Metadata } from 'next'

import { JOURNAL_PAGE } from '@/lib/seo/appPages'
import { articleImage, buildMetadata } from '@/lib/seo/metadata'
import { articleGraph, type JsonLdGraph, pageGraph, type PageGraphInput } from '@/lib/seo/schema'
import { fact, FOUNDER, siteOrigin, TITLE_SUFFIX } from '@/lib/seo/site'

import {
  articlePath,
  FEED_PATH,
  JOURNAL_CRUMB,
  JOURNAL_PATH,
  listPath,
  listTitle,
} from './addresses'
import type { PostDetail, TopicSummary } from './posts'
import { searchTitleOf } from './rules'

/**
 * What the Journal's pages tell search engines and link previews (docs/12 §3; D-62, D-65): the
 * same search system as every page (src/lib/seo), fed from the Journal's own fields. Pure, so
 * the routes, the share images and the tests read the same words.
 */

/** An article's author as the page names them: the founder (D-64), or the name it was given. */
export type ArticleAuthor = {
  founder: boolean
  /** The name alone, for the structured data and the share image. */
  name: string | null
  /** The byline: the founder as VOICE.md names him, anyone else by their name. */
  line: string | null
}

export function authorOf(post: Pick<PostDetail, 'author' | 'authorName'>): ArticleAuthor {
  if (post.author === 'founder') {
    return { founder: true, name: FOUNDER.name, line: `${FOUNDER.name}, founder` }
  }
  const name = fact(post.authorName) ?? null
  return { founder: false, name, line: name }
}

/** The search description of an article: its own, else its excerpt. */
export function articleDescription(post: Pick<PostDetail, 'description' | 'excerpt'>): string {
  return fact(post.description) ?? post.excerpt
}

/**
 * A list's page as search sees it: the Journal's, or a topic's, at a page. Below the
 * Journal's first page, the way down runs through the Journal, and through the topic's first
 * page for a topic's later ones.
 */
export function listPage(topic: TopicSummary | null, page: number): PageGraphInput {
  const path = listPath(topic?.slug, page)
  const trail = [
    ...(path === JOURNAL_PATH ? [] : [{ path: JOURNAL_PATH, title: JOURNAL_CRUMB }]),
    ...(topic && page > 1 ? [{ path: listPath(topic.slug), title: topic.name }] : []),
  ]
  return {
    path,
    title: listTitle(JOURNAL_PAGE.title, topic?.name, page),
    description: fact(topic?.description) ?? JOURNAL_PAGE.description,
    trail,
  }
}

/** The Journal's feed's title, as the Journal's browser tab gives it (src/lib/journal/feed.ts). */
export const FEED_TITLE = `${JOURNAL_PAGE.title}${TITLE_SUFFIX}`

/** The feed's link for a page's head: rel="alternate", which feed readers look for. */
export const FEED_ALTERNATE = { 'application/rss+xml': [{ url: FEED_PATH, title: FEED_TITLE }] }

/**
 * A page of the Journal's with its link to the feed (rel="alternate"), which feed readers look
 * for in the page's head (src/lib/journal/feed.ts).
 */
function withFeed(metadata: Metadata): Metadata {
  return { ...metadata, alternates: { ...metadata.alternates, types: FEED_ALTERNATE } }
}

export function listMetadata(topic: TopicSummary | null, page: number): Metadata {
  const { path, title, description } = listPage(topic, page)
  return withFeed(buildMetadata({ path, title, description }))
}

export function listGraph(topic: TopicSummary | null, page: number): JsonLdGraph {
  return pageGraph(listPage(topic, page))
}

/** An article's own page as search sees it: its search title (D-65) and its description. */
function articlePage(post: PostDetail): PageGraphInput {
  const topic = post.topics[0]
  return {
    path: articlePath(post.slug),
    title: searchTitleOf(post),
    description: articleDescription(post),
    trail: [
      { path: JOURNAL_PATH, title: JOURNAL_CRUMB },
      ...(topic ? [{ path: listPath(topic.slug), title: topic.name }] : []),
    ],
  }
}

/** An article's metadata: og:type article, its dates, author and topic, and its own image. */
export function articleMetadata(post: PostDetail): Metadata {
  const { path, title, description } = articlePage(post)
  return withFeed(
    buildMetadata({
      path,
      title,
      description,
      type: 'article',
      article: {
        headline: post.title,
        author: authorOf(post).name,
        publishedTime: post.publishedAt,
        modifiedTime: post.updatedAt,
        section: post.topics[0]?.name,
      },
    }),
  )
}

/** An article's structured data (D-62): its page, the way down to it, and the Article. */
export function articleGraphOf(post: PostDetail, origin: string = siteOrigin()): JsonLdGraph {
  const page = articlePage(post)
  const author = authorOf(post)
  const image = articleImage(page.path, page.title, { headline: post.title, author: author.name })
  return articleGraph(
    {
      ...page,
      headline: post.title,
      datePublished: post.publishedAt,
      dateModified: post.updatedAt,
      author: author.founder ? { founder: true } : { founder: false, name: author.name },
      section: post.topics[0]?.name,
      image: `${origin}${image.url}`,
    },
    origin,
  )
}
