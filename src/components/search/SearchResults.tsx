import Link from 'next/link'
import { Fragment } from 'react'

import type { SearchGroup } from '@/lib/search/results'
import type { TextPart } from '@/lib/search/text'

import styles from './search.module.css'

/** A text with the query's words marked by the kit's highlighter (yellow on paper). */
function Marked({ parts }: { parts: readonly TextPart[] }) {
  return parts.map((part, index) =>
    part.match ? (
      <mark key={index} className="iiic-hl">
        {part.text}
      </mark>
    ) : (
      <Fragment key={index}>{part.text}</Fragment>
    ),
  )
}

/**
 * The results of a search, grouped by kind (docs/11 §5.3): a heading per kind, and for each
 * result its title as the link, the sentence that matched and the address it opens. Results are
 * not prefetched: a list of forty would fetch forty pages nobody asked for.
 */
export function SearchResults({ groups }: { groups: readonly SearchGroup[] }) {
  return groups.map((group) => (
    <section key={group.kind} className={styles.group} aria-labelledby={`results-${group.kind}`}>
      <h2 id={`results-${group.kind}`} className={styles.groupHeading}>
        {group.heading}
      </h2>
      <ol className={styles.results}>
        {group.results.map((result) => (
          <li key={`${result.url} ${result.title.map((part) => part.text).join('')}`}>
            <h3 className={styles.title}>
              <Link className="iiic-link" href={result.url} prefetch={false}>
                <Marked parts={result.title} />
              </Link>
            </h3>
            {result.snippet.length > 0 ? (
              <p className={styles.snippet}>
                <Marked parts={result.snippet} />
              </p>
            ) : null}
            <p className={styles.address}>{result.url}</p>
          </li>
        ))}
      </ol>
    </section>
  ))
}
