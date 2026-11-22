import 'server-only'

import { after } from 'next/server'
import { getPayload } from 'payload'

import { STARTER_PAGES } from '@/content/starter'
import { recordEventQuietly } from '@/lib/analytics/record'
import { env } from '@/lib/env'
import { reportError } from '@/lib/monitoring/sentry'
import { isPrefetch, WriteBudget } from '@/lib/redirects/missingPages'
import { servedPages } from '@/lib/seo/sitemap'
import { sitemapSource } from '@/lib/seo/sitemapSource'
import config from '@payload-config'

import { isSearchablePath, pageEntry } from './entries'
import { isSearchKind, SEARCH_INDEX, SEARCH_KINDS } from './kinds'
import { groupResults, resultCount, type SearchEntry, type SearchGroup } from './results'
import { matchesAll, normaliseQuery, queryWords } from './text'

/**
 * Site search (docs/02 `/search`; docs/11 §5.3; docs/12 §1, §7, §10). A query is matched
 * against the search index (src/plugins/searchIndex.ts) by Payload's `like`, and against the
 * starter pages the site still shows (D-51, D-57), which the index cannot hold because they are
 * not in the database, by the same rule (src/lib/search/text.ts, matchesAll). Nothing about a
 * query is kept: it is not logged, stored, cached or sent anywhere, and the only thing counted is
 * that a search found nothing, without its words (`search_no_results`).
 */

/** The most entries one search reads from the index. */
export const MAX_RESULTS = 40

/** The most searches one server answers in a minute; past that, the page asks for a minute's patience. */
export const SEARCHES_PER_MINUTE = 600

/** The most searches with no results one server counts in a minute; past that, they are not counted. */
export const NO_RESULT_COUNTS_PER_MINUTE = 60

const searches = new WriteBudget(SEARCHES_PER_MINUTE)
const noResultCounts = new WriteBudget(NO_RESULT_COUNTS_PER_MINUTE)

export type SearchOutcome =
  /** No query: the page shows the field. */
  | { state: 'empty' }
  /** This server has answered its share of searches this minute. */
  | { state: 'busy'; query: string }
  | {
      state: 'done'
      query: string
      groups: SearchGroup[]
      total: number
      /** Part of the site could not be searched just now (the error is reported). */
      partial: boolean
    }

/** Each starter page's entry, by slug: they change only with a deployment. */
let starters: Map<string, SearchEntry> | undefined

function starterEntries(): Map<string, SearchEntry> {
  starters ??= new Map(
    Object.entries(STARTER_PAGES).flatMap(([slug, page]) => {
      const fields = pageEntry(page)
      return fields
        ? [[slug, { ...fields, kind: 'pages' as const, priority: SEARCH_KINDS.pages.priority }]]
        : []
    }),
  )
  return starters
}

/**
 * The starter pages the site shows now, as the sitemap lists them (src/lib/seo/sitemap.ts):
 * those whose address has never had a published page and no redirect leads from.
 */
async function servedStarters(): Promise<SearchEntry[]> {
  const source = await sitemapSource()
  const published = new Set(source.published.map(({ slug }) => slug))
  const served = new Set(
    servedPages(source).flatMap(({ slug }) => (slug && !published.has(slug) ? [slug] : [])),
  )
  return [...starterEntries()].flatMap(([slug, entry]) => (served.has(slug) ? [entry] : []))
}

/** The entries of the index whose text holds every word, as a visitor may read them. */
async function indexed(words: readonly string[]): Promise<SearchEntry[]> {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: SEARCH_INDEX,
    // Payload's like: every word, anywhere in the text, whatever its case.
    where: { content: { like: words.join(' ') } },
    sort: '-priority',
    limit: MAX_RESULTS,
    pagination: false,
    depth: 0,
    overrideAccess: false,
    select: { title: true, url: true, excerpt: true, content: true, priority: true, doc: true },
  })
  return docs.flatMap((doc) => {
    const kind = doc.doc?.relationTo
    if (!isSearchKind(kind) || !doc.title || !doc.url || !isSearchablePath(doc.url)) return []
    return [
      {
        kind,
        title: doc.title,
        url: doc.url,
        excerpt: doc.excerpt ?? null,
        content: doc.content ?? '',
        priority: doc.priority ?? SEARCH_KINDS[kind].priority,
      },
    ]
  })
}

/** A part of the search that failed: reported by the error's kind only, and searched without. */
async function orNothing(
  part: Promise<SearchEntry[]>,
): Promise<{ entries: SearchEntry[]; failed: boolean }> {
  try {
    return { entries: await part, failed: false }
  } catch (error) {
    await reportError(error, { area: 'search' })
    return { entries: [], failed: true }
  }
}

/** Searches the site for a query as a visitor sent it (`q`), within this server's share. */
export async function searchSite(raw: unknown): Promise<SearchOutcome> {
  const query = normaliseQuery(raw)
  const words = queryWords(query)
  if (words.length === 0) return { state: 'empty' }
  if (!searches.take()) return { state: 'busy', query }
  const [fromIndex, fromStarters] = await Promise.all([
    orNothing(indexed(words)),
    orNothing(servedStarters()),
  ])
  const matched = [
    ...fromIndex.entries,
    ...fromStarters.entries.filter((entry) => matchesAll(entry.content, words)),
  ]
  const groups = groupResults(matched, words)
  return {
    state: 'done',
    query,
    groups,
    total: resultCount(groups),
    partial: fromIndex.failed || fromStarters.failed,
  }
}

/**
 * Counts a search that found nothing (docs/11 §5.3; docs/12 §7): the event `search_no_results`
 * on /search, with the day's pseudonymous session code and the time, never the query's words.
 * Written after the response has gone; never for a prefetch, never on a preview deployment, which
 * shares the production database and whose visitors are the team, and at most
 * NO_RESULT_COUNTS_PER_MINUTE times a minute on one server, so nobody can fill the table.
 */
export function countNoResults(headers: Headers): void {
  if (env().VERCEL_ENV === 'preview' || isPrefetch(headers) || !noResultCounts.take()) return
  after(() =>
    recordEventQuietly(
      { name: 'search_no_results', route: '/search', register: 'default' },
      headers,
    ),
  )
}
