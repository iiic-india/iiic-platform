import type { Metadata } from 'next'
import { headers } from 'next/headers'

import { SearchForm } from '@/components/search/SearchForm'
import { SearchResults } from '@/components/search/SearchResults'
import styles from '@/components/search/search.module.css'
import { MainLinks } from '@/components/site/MainLinks'
import { SEARCH_COPY } from '@/lib/search/copy'
import { countNoResults, searchSite } from '@/lib/search/query'

/**
 * Never indexed (D-67): src/lib/security/headers.ts sends X-Robots-Tag on /search, and the tag
 * says the same. No canonical address and no share image of its own: a results page is not a
 * page to list or share.
 */
export const metadata: Metadata = {
  title: SEARCH_COPY.title,
  robots: { index: false, follow: true },
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/**
 * Site search (docs/02 `/search`; docs/11 §5.3): a plain GET form with one labelled field, and
 * the results grouped by kind with the sentence that matched. It works without JavaScript and
 * sends no script of its own. The query is searched and shown back, and nothing else: it is
 * never logged, stored or cached (src/lib/search/query.ts). A search that finds nothing is
 * counted, without its words, and the page says so plainly and offers the main pages.
 */
export default async function SearchPage({ searchParams }: Props) {
  const outcome = await searchSite((await searchParams).q)
  const query = outcome.state === 'empty' ? undefined : outcome.query
  if (outcome.state === 'done' && outcome.total === 0 && !outcome.partial) {
    countNoResults(await headers())
  }
  return (
    <section className={`iiic-page-narrow ${styles.page}`}>
      <h1>{SEARCH_COPY.heading}</h1>
      <SearchForm
        id="search-query"
        label={SEARCH_COPY.label}
        defaultValue={query}
        help={SEARCH_COPY.help}
      />
      {outcome.state === 'empty' ? <p>{SEARCH_COPY.covers}</p> : null}
      {outcome.state === 'busy' ? (
        <>
          <p className={styles.note}>{SEARCH_COPY.busy}</p>
          <MainLinks label={SEARCH_COPY.doors} />
        </>
      ) : null}
      {outcome.state === 'done' ? (
        <>
          {outcome.partial ? (
            <p className={`iiic-alert iiic-alert-yellow ${styles.note}`}>{SEARCH_COPY.partial}</p>
          ) : null}
          {outcome.total > 0 ? (
            <>
              <p className={styles.summary}>
                {SEARCH_COPY.found(outcome.total)} “{outcome.query}”
              </p>
              <SearchResults groups={outcome.groups} />
            </>
          ) : (
            <>
              <h2 className={styles.nothing}>
                {SEARCH_COPY.nothing} “{outcome.query}”
              </h2>
              <p className={styles.note}>{SEARCH_COPY.nothingHelp}</p>
              <MainLinks label={SEARCH_COPY.doors} />
            </>
          )}
        </>
      ) : null}
    </section>
  )
}
