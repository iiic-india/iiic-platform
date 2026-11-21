import Link from 'next/link'

import { Scope } from '@/components/blocks/PageBlocks'
import { TakeItWithYou } from '@/components/experience/TakeItWithYou'
import { JsonLd } from '@/components/seo/JsonLd'
import { JOURNAL_CRUMB, JOURNAL_PATH, listPath } from '@/lib/journal/addresses'
import { doorOf } from '@/lib/journal/doors'
import type { PostDetail } from '@/lib/journal/posts'
import { articleGraphOf, authorOf } from '@/lib/journal/seo'

import { ArticleBody } from './ArticleBody'
import { ArticleMeta } from './ArticleMeta'
import styles from './journal.module.css'

/** The heading of the panel every article ends with (docs/11 §3.6). */
export const QUESTION_HEADING = 'A question to sit with'

/**
 * A Journal article (docs/02; docs/content/copy-architecture.md §4.8; docs/11 §3.6), in the
 * education register its route group sets: the way back to the Journal and its topic, the
 * title, the author, the date and the reading time, the body, and nothing inside the text but
 * the text (no bridges). It ends with its question in the kit's paper panel, which the reader
 * can copy, then a link to its first topic's door. An article that leads to counselling also
 * carries the counselling scope statement and the crisis numbers, as every counselling surface
 * does (CLAUDE.md #9).
 */
export function Article({ post }: { post: PostDetail }) {
  const topic = post.topics[0]
  const door = doorOf(topic?.door)
  return (
    <>
      <JsonLd graph={articleGraphOf(post)} />
      {/* READING BAR (docs/11 §3.1): <ReadingBar /> from src/components/experience/ReadingBar.tsx goes on this line when its branch lands, except where topic?.door === 'counselling' (no devices on counselling pages). */}
      <article className={`iiic-page-narrow ${styles.article}`}>
        <nav aria-label="Breadcrumb">
          <ol className="iiic-breadcrumb">
            <li>
              <Link href={JOURNAL_PATH}>{JOURNAL_CRUMB}</Link>
            </li>
            {topic ? (
              <li>
                <Link href={listPath(topic.slug)}>{topic.name}</Link>
              </li>
            ) : null}
            <li aria-current="page">{post.title}</li>
          </ol>
        </nav>
        <header className={styles.articleHead}>
          <h1>{post.title}</h1>
          <ArticleMeta
            byline={authorOf(post).line}
            publishedAt={post.publishedAt}
            readingTime={post.readingTime}
          />
        </header>
        <ArticleBody body={post.body} />
        <section className={`iiic-panel ${styles.question}`} aria-labelledby="question-heading">
          <h2 id="question-heading" className={`iiic-kicker ${styles.questionHeading}`}>
            {QUESTION_HEADING}
          </h2>
          <p className={styles.questionText}>{post.question}</p>
          <TakeItWithYou question={post.question} className={styles.take} />
        </section>
        {door ? (
          <p className={styles.door}>
            <Link className="iiic-btn iiic-btn-secondary" href={door.path}>
              {door.link}
            </Link>
          </p>
        ) : null}
        {topic?.door === 'counselling' ? <Scope /> : null}
      </article>
    </>
  )
}
