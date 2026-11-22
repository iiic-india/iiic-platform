import Link from 'next/link'

import { Scope } from '@/components/blocks/PageBlocks'
import { TakeItWithYou } from '@/components/experience/TakeItWithYou'
import { JsonLd } from '@/components/seo/JsonLd'
import { READING_BAR_ATTRIBUTE } from '@/lib/experience/narrative'
import { JOURNAL_CRUMB, JOURNAL_PATH, listPath } from '@/lib/journal/addresses'
import { doorOf, leadsToCounselling } from '@/lib/journal/doors'
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
 * can copy, then a link to its first topic's door. An article any of whose topics leads to
 * counselling is a counselling surface (leadsToCounselling): it carries the scope statement and
 * the crisis numbers (CLAUDE.md #9) and no experience device, so its question has no copy
 * button and stays on the page to read, and the header draws no bar (docs/11 §2 item 6, §3.1,
 * §6). Every other article asks the header for the bar.
 */
export function Article({ post }: { post: PostDetail }) {
  const topic = post.topics[0]
  const door = doorOf(topic?.door)
  const counselling = leadsToCounselling(post.topics)
  return (
    <>
      <JsonLd graph={articleGraphOf(post)} />
      <article
        className={`iiic-page-narrow ${styles.article}`}
        // The header's bar tracks the reader here, unless the article leads to counselling
        // (src/lib/experience/narrative.ts, READING_BAR_ATTRIBUTE).
        {...(counselling ? {} : { [READING_BAR_ATTRIBUTE]: '' })}
      >
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
          {counselling ? null : <TakeItWithYou question={post.question} className={styles.take} />}
        </section>
        {door ? (
          <p className={styles.door}>
            <Link className="iiic-btn iiic-btn-secondary" href={door.path}>
              {door.link}
            </Link>
          </p>
        ) : null}
        {counselling ? <Scope /> : null}
      </article>
    </>
  )
}
