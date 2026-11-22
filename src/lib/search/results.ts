import type { IndexedFields } from './entries'
import { SEARCH_KINDS, SEARCHED_COLLECTIONS, type SearchKind } from './kinds'
import { highlightParts, matchesAll, matchingSentence, type TextPart } from './text'

/**
 * How /search shows what matched (docs/11 §5.3): results grouped by kind, in the order of
 * SEARCHED_COLLECTIONS, each with its title and the sentence of its text that matched, the
 * query's words marked in both. Pure, so the page and the tests read the same grouping.
 */

/** An entry as the results are built from it: from the index, or a starter page's. */
export type SearchEntry = IndexedFields & { kind: SearchKind; priority: number }

export type SearchResult = {
  kind: SearchKind
  url: string
  /** The title in parts, the query's words marked. */
  title: TextPart[]
  /** The sentence that matched, or the entry's excerpt when none did, the words marked. */
  snippet: TextPart[]
}

export type SearchGroup = { kind: SearchKind; heading: string; results: SearchResult[] }

const byTitle = new Intl.Collator('en-IN', { sensitivity: 'base' })

/**
 * Within a kind: an entry whose title holds every word first, then the higher priority, then by
 * title. One result per address and title in a kind, the first in that order.
 */
function ranked(entries: readonly SearchEntry[], words: readonly string[]): SearchEntry[] {
  const titled = new Map(entries.map((entry) => [entry, matchesAll(entry.title, words)]))
  const sorted = [...entries].sort(
    (a, b) =>
      Number(titled.get(b)) - Number(titled.get(a)) ||
      b.priority - a.priority ||
      byTitle.compare(a.title, b.title),
  )
  const seen = new Set<string>()
  return sorted.filter((entry) => {
    const key = `${entry.url}\n${entry.title}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** The results, grouped by kind in their order, with no empty group. */
export function groupResults(
  entries: readonly SearchEntry[],
  words: readonly string[],
): SearchGroup[] {
  return SEARCHED_COLLECTIONS.flatMap((kind) => {
    const results = ranked(
      entries.filter((entry) => entry.kind === kind),
      words,
    ).map((entry) => ({
      kind,
      url: entry.url,
      title: highlightParts(entry.title, words),
      snippet: highlightParts(
        matchingSentence(entry.content, words, entry.title) ?? entry.excerpt ?? '',
        words,
      ),
    }))
    return results.length > 0 ? [{ kind, heading: SEARCH_KINDS[kind].heading, results }] : []
  })
}

/** How many results the groups hold. */
export function resultCount(groups: readonly SearchGroup[]): number {
  return groups.reduce((sum, group) => sum + group.results.length, 0)
}
