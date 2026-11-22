import type { ReactNode } from 'react'

import { formatDate } from '@/lib/journal/dates'
import { readingTimeLabel } from '@/lib/journal/readingTime'

import styles from './journal.module.css'

/**
 * The line under an article's title: who wrote it (on the article itself), the date it was
 * published, in India's calendar, and its reading time (docs/content/copy-architecture.md
 * §4.8), each where it is known, with a middle dot between them.
 */
export function ArticleMeta({
  byline,
  publishedAt,
  readingTime,
}: {
  byline?: string | null
  publishedAt?: string | null
  readingTime?: number | null
}) {
  const parts: { key: string; node: ReactNode }[] = []
  if (byline) parts.push({ key: 'byline', node: byline })
  const date = formatDate(publishedAt)
  if (date && publishedAt) {
    parts.push({ key: 'date', node: <time dateTime={publishedAt}>{date}</time> })
  }
  const reading = readingTimeLabel(readingTime)
  if (reading) parts.push({ key: 'reading', node: reading })
  if (parts.length === 0) return null
  return (
    <p className={styles.meta}>
      {parts.map(({ key, node }, index) => (
        <span key={key}>
          {index > 0 ? ' · ' : null}
          {node}
        </span>
      ))}
    </p>
  )
}
