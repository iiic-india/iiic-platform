import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Scope } from '@/components/blocks/PageBlocks'
import { JsonLd } from '@/components/seo/JsonLd'
import {
  articlePath,
  JOURNAL_CRUMB,
  JOURNAL_NAME,
  JOURNAL_PATH,
  listPath,
} from '@/lib/journal/addresses'
import { leadsToCounselling } from '@/lib/journal/doors'
import {
  getTopics,
  listPosts,
  type PostList,
  type PostSummary,
  type TopicSummary,
} from '@/lib/journal/posts'
import { listGraph, listMetadata } from '@/lib/journal/seo'

import { ArticleMeta } from './ArticleMeta'
import styles from './journal.module.css'

/**
 * The Journal's list (docs/02; docs/content/copy-architecture.md §4.8), in the education
 * register its route group sets: the published articles, newest first, ten to a page, which
 * the topics filter. While no article is published it says so, honestly, and lists nothing
 * (I-19). A topic that holds no published article, and a page past the last, are the 404.
 * The list of a topic that leads to counselling is a counselling surface: it ends with the
 * scope statement and the crisis numbers (leadsToCounselling; docs/08 §7).
 */

type ListProps = { topic?: string; page?: number }

type Found = { topics: TopicSummary[]; topic: TopicSummary | null; list: PostList }

/** What a list's address shows, or null where it is a 404. */
async function find({ topic: slug, page = 1 }: ListProps): Promise<Found | null> {
  const topics = await getTopics()
  const topic = slug === undefined ? null : (topics.find((item) => item.slug === slug) ?? null)
  if (slug !== undefined && !topic) return null
  const list = await listPosts(topic?.id ?? null, page)
  if (page > 1 && page > list.totalPages) return null
  return { topics, topic, list }
}

/** A list's title, description and canonical address; none for a 404. */
export async function journalListMetadata(props: ListProps): Promise<Metadata> {
  const found = await find(props)
  return found ? listMetadata(found.topic, props.page ?? 1) : {}
}

function TopicLinks({ topics, current }: { topics: TopicSummary[]; current: TopicSummary | null }) {
  if (topics.length === 0) return null
  return (
    <nav aria-label="Topics">
      <ul className={styles.topics}>
        <li>
          <Link href={JOURNAL_PATH} aria-current={current ? undefined : 'true'}>
            All articles
          </Link>
        </li>
        {topics.map((topic) => (
          <li key={topic.id}>
            <Link
              href={listPath(topic.slug)}
              aria-current={current?.id === topic.id ? 'true' : undefined}
            >
              {topic.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function Entry({ post }: { post: PostSummary }) {
  const topic = post.topics[0]
  return (
    <article className={`iiic-card ${styles.entry}`}>
      {topic ? <div className="iiic-kicker">{topic.name}</div> : null}
      <h2 className={styles.entryTitle}>
        <Link href={articlePath(post.slug)}>{post.title}</Link>
      </h2>
      <p className={styles.excerpt}>{post.excerpt}</p>
      <ArticleMeta publishedAt={post.publishedAt} readingTime={post.readingTime} />
    </article>
  )
}

/** The kit's pagination: newer to the left, older to the right, every page by its number. */
function Pages({ topic, page, total }: { topic?: string; page: number; total: number }) {
  if (total <= 1) return null
  const numbers = Array.from({ length: total }, (_, index) => index + 1)
  return (
    <nav aria-label="Pages">
      <ul className="iiic-pagination">
        {page > 1 ? (
          <li>
            <Link href={listPath(topic, page - 1)} rel="prev">
              <span aria-hidden="true">‹ </span>Newer
            </Link>
          </li>
        ) : null}
        {numbers.map((number) => (
          <li key={number}>
            {number === page ? (
              <span aria-current="page">
                <span className="iiic-sr-only">Page </span>
                {number}
              </span>
            ) : (
              <Link href={listPath(topic, number)} aria-label={`Page ${number}`}>
                {number}
              </Link>
            )}
          </li>
        ))}
        {page < total ? (
          <li>
            <Link href={listPath(topic, page + 1)} rel="next">
              Older<span aria-hidden="true"> ›</span>
            </Link>
          </li>
        ) : null}
      </ul>
    </nav>
  )
}

/** The honest empty state (VOICE.md: what will appear, and why it is empty). */
function NothingYet() {
  return (
    <div className="iiic-empty">
      <h2>No articles yet</h2>
      <p>
        Articles that apply Subjective Self to work, family and the self will appear here once IIIC
        publishes them.
      </p>
    </div>
  )
}

export async function JournalList(props: ListProps) {
  const found = await find(props)
  if (!found) notFound()
  const { topics, topic, list } = found
  const page = props.page ?? 1
  return (
    <div className={`iiic-page-narrow ${styles.page}`}>
      <JsonLd graph={listGraph(topic, page)} />
      <header className={styles.head}>
        {topic ? (
          <nav aria-label="Breadcrumb">
            <ol className="iiic-breadcrumb">
              <li>
                <Link href={JOURNAL_PATH}>{JOURNAL_CRUMB}</Link>
              </li>
              <li aria-current="page">{topic.name}</li>
            </ol>
          </nav>
        ) : null}
        <h1>{topic ? topic.name : JOURNAL_NAME}</h1>
        {topic?.description ? <p className={styles.lede}>{topic.description}</p> : null}
      </header>
      <TopicLinks topics={topics} current={topic} />
      {list.docs.length === 0 ? (
        <NothingYet />
      ) : (
        <ol className={styles.list}>
          {list.docs.map((post) => (
            <li key={post.id}>
              <Entry post={post} />
            </li>
          ))}
        </ol>
      )}
      <Pages topic={topic?.slug} page={page} total={list.totalPages} />
      {topic && leadsToCounselling([topic]) ? <Scope /> : null}
    </div>
  )
}
