import { PLACEHOLDER } from '@/lib/content/placeholders'

/**
 * The words of site search (docs/11 §5.3): what a visitor's query becomes before it is matched,
 * what an entry's text is, and how a result shows the sentence that matched. Pure functions, so
 * the index, the results page and the tests read the same rules.
 *
 * Matching is Payload's own: its `like` operator, which the index is queried with, takes an
 * entry when every word of the query appears somewhere in its text, whatever the case
 * (`ILIKE '%word%'` for each word on Postgres). The starter pages, which are not in the
 * database, are matched by `matchesAll`, which applies the same rule.
 */

/** The longest query searched, in characters: the field takes no more, and the server cuts. */
export const MAX_QUERY_LENGTH = 100

/** The most words of a query that are matched: more only narrows what is already narrow. */
export const MAX_QUERY_WORDS = 8

/** The most characters of an entry's text the index keeps: far more than any page holds. */
export const MAX_CONTENT_LENGTH = 50_000

/** The longest matching sentence a result shows before it is cut around the match. */
export const MAX_SENTENCE_LENGTH = 200

// A query's characters that are not text: control characters. And the three characters LIKE
// reads as instructions (`%` any text, `_` any character, `\` the escape), which a query must
// never pass to the database as such.
const NOT_QUERY_TEXT = /[\p{Cc}%_\\]/gu

/**
 * The query a visitor sent, as the site searches it: the first value of `q`, in Unicode's
 * compatibility form (so a full-width letter is the letter), without control characters or
 * LIKE's wildcards, with single spaces, and no longer than MAX_QUERY_LENGTH characters. Anything
 * that is not text is no query.
 */
export function normaliseQuery(raw: unknown): string {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string') return ''
  const cleaned = value.normalize('NFKC').replace(NOT_QUERY_TEXT, ' ').replace(/\s+/gu, ' ').trim()
  // By code points, so a character outside the basic plane is never cut in two.
  return [...cleaned].slice(0, MAX_QUERY_LENGTH).join('').trim()
}

const APOSTROPHES = /['\u2019]/u

/**
 * The words a query is matched by: the word-like parts the platform's word segmentation finds
 * (Intl.Segmenter; punctuation and spaces fall away, so "self?" is "self"), each once whatever
 * its case, at most MAX_QUERY_WORDS of them. A word with an apostrophe keeps its parts of two
 * letters or more ("IIIC's" is "IIIC"), since pages write the curly apostrophe and people type
 * the straight one.
 */
export function queryWords(query: string): string[] {
  const seen = new Set<string>()
  const words: string[] = []
  for (const { segment, isWordLike } of new Intl.Segmenter('en-IN', {
    granularity: 'word',
  }).segment(query)) {
    if (!isWordLike) continue
    for (const part of segment.split(APOSTROPHES)) {
      const key = part.toLocaleLowerCase('en-IN')
      if ([...part].length < (APOSTROPHES.test(segment) ? 2 : 1) || seen.has(key)) continue
      seen.add(key)
      words.push(part)
      if (words.length === MAX_QUERY_WORDS) return words
    }
  }
  return words
}

/** Keys of a page's sections that hold no words a visitor reads: ids, kinds, links, marks. */
const NOT_SHOWN = new Set(['id', 'blockName', 'blockType', 'copyStatus', 'href', 'anchor', 'glyph'])

/**
 * Every string a visitor reads in some sections of a page, in their order: the values of the
 * sections' text fields, without the ids, kinds, link addresses and marks the page never shows
 * as words.
 */
export function visibleText(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(visibleText)
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) =>
      NOT_SHOWN.has(key) ? [] : visibleText(inner),
    )
  }
  return []
}

/**
 * An entry's text, as the index keeps it: the parts given, one line each and in their order,
 * without placeholders (a fact nobody has supplied is not something to be found by), with single
 * spaces and no empty lines, and no longer than MAX_CONTENT_LENGTH.
 */
export function contentOf(parts: readonly (string | null | undefined)[]): string {
  return parts
    .flatMap((part) => (part ?? '').replace(PLACEHOLDER, ' ').split('\n'))
    .map((line) => line.replace(/\s+/gu, ' ').trim())
    .filter((line) => line !== '')
    .join('\n')
    .slice(0, MAX_CONTENT_LENGTH)
}

/** Characters a regular expression reads as instructions, each to be written with a backslash. */
const SYNTAX = new Set([...'\\^$.*+?()[]{}|/'])

function literal(text: string): string {
  return [...text]
    .map((character) => (SYNTAX.has(character) ? `\\${character}` : character))
    .join('')
}

/** A pattern for one word, found anywhere and in any case, as LIKE finds it. */
const wordPattern = (word: string, flags = 'iu') => new RegExp(literal(word), flags)

/** Whether every word appears somewhere in the text, whatever its case: the index's own rule. */
export function matchesAll(text: string, words: readonly string[]): boolean {
  return words.length > 0 && words.every((word) => wordPattern(word).test(text))
}

/**
 * A sentence cut to MAX_SENTENCE_LENGTH around the first word it holds, at spaces, with an
 * ellipsis where something was left out.
 */
function around(sentence: string, words: readonly string[]): string {
  if (sentence.length <= MAX_SENTENCE_LENGTH) return sentence
  const first = Math.min(
    ...words.map((word) => sentence.search(wordPattern(word))).filter((index) => index >= 0),
  )
  let start = Math.max(0, (Number.isFinite(first) ? first : 0) - 60)
  if (start > 0) start = sentence.indexOf(' ', start) + 1 || start
  let end = Math.min(sentence.length, start + MAX_SENTENCE_LENGTH)
  if (end < sentence.length) {
    const space = sentence.lastIndexOf(' ', end)
    if (space > start) end = space
  }
  return `${start > 0 ? '…' : ''}${sentence.slice(start, end).trim()}${end < sentence.length ? '…' : ''}`
}

/**
 * The sentence of an entry's text that holds the most words of the query (the first of equals),
 * cut around them when it is long; none when no sentence holds a word. Sentences are found by
 * the platform's sentence segmentation (Intl.Segmenter), and each line of the text ends one. The
 * title is passed over, since a result shows it already.
 */
export function matchingSentence(
  content: string,
  words: readonly string[],
  title?: string,
): string | null {
  const patterns = words.map((word) => wordPattern(word))
  let best: string | null = null
  let bestScore = 0
  for (const { segment } of new Intl.Segmenter('en-IN', { granularity: 'sentence' }).segment(
    content,
  )) {
    const sentence = segment.trim()
    if (sentence === '' || sentence === title?.trim()) continue
    const score = patterns.filter((pattern) => pattern.test(sentence)).length
    if (score > bestScore) {
      best = sentence
      bestScore = score
      if (score === patterns.length) break
    }
  }
  return best === null ? null : around(best, words)
}

export type TextPart = { text: string; match: boolean }

/** A text in parts, each word of the query found in it a part of its own, to be marked. */
export function highlightParts(text: string, words: readonly string[]): TextPart[] {
  if (words.length === 0 || text === '') return text === '' ? [] : [{ text, match: false }]
  const longestFirst = [...words].sort((a, b) => b.length - a.length).map(literal)
  const pattern = new RegExp(longestFirst.join('|'), 'giu')
  const parts: TextPart[] = []
  let last = 0
  for (const found of text.matchAll(pattern)) {
    const index = found.index ?? 0
    if (index > last) parts.push({ text: text.slice(last, index), match: false })
    parts.push({ text: found[0], match: true })
    last = index + found[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last), match: false })
  return parts
}
