import {
  convertLexicalToPlaintext,
  type PlaintextConverters,
} from '@payloadcms/richtext-lexical/plaintext'

/**
 * An article's reading time, from its body (docs/content/copy-architecture.md §4.8: article
 * pages carry the reading time). The body's text comes from Payload's own Lexical converter and
 * its words from the platform's word segmentation (Intl.Segmenter, Unicode's word rules), so
 * Gujarati and Hindi count by their words as English does. 200 words a minute, rounded up: a
 * careful pace for a reflective text, read by many in a second language.
 */
export const WORDS_PER_MINUTE = 200

type EditorState = Parameters<typeof convertLexicalToPlaintext>[0]['data']

/** Whether a value is a Lexical editor state: a root that holds a list of nodes. */
function isEditorState(value: unknown): value is EditorState {
  const root = (value as { root?: { children?: unknown } } | null | undefined)?.root
  return Array.isArray(root?.children)
}

/**
 * A quote and a rule stand apart from the text before them. Payload's converter starts a new
 * line only before paragraphs, headings, lists and tables, so without these the first word of a
 * quote would run into the last word above it.
 */
const BLOCKS_APART: PlaintextConverters = {
  quote: ({ node, nodesToPlaintext }) =>
    `\n\n${nodesToPlaintext({ nodes: node.children }).join('')}`,
  horizontalrule: '\n\n',
}

/** An article body's text, without its formatting: empty for anything that is not a body. */
export function bodyText(body: unknown): string {
  return isEditorState(body)
    ? convertLexicalToPlaintext({ data: body, converters: BLOCKS_APART })
    : ''
}

/** The words in a text, as the platform's word segmentation finds them. */
export function wordCount(text: string): number {
  let words = 0
  for (const segment of new Intl.Segmenter('en-IN', { granularity: 'word' }).segment(text)) {
    if (segment.isWordLike) words += 1
  }
  return words
}

/** The minutes an article's body takes to read: none for an empty body, else at least one. */
export function readingMinutes(body: unknown): number {
  const words = wordCount(bodyText(body))
  return words === 0 ? 0 : Math.ceil(words / WORDS_PER_MINUTE)
}

/** The reading time as a page shows it: "4 minutes to read" (VOICE.md: minutes, in figures). */
export function readingTimeLabel(minutes: number | null | undefined): string | null {
  if (!minutes || minutes < 1) return null
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} to read`
}
