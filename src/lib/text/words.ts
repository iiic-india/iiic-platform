/**
 * The words in a text, as the platform's word segmentation finds them (Intl.Segmenter, Unicode's
 * word rules), so Gujarati and Hindi count by their words as English does. No dependency of its
 * own, so the browser can use it too: the 404's line counts its words with it (docs/11 §5.1).
 */
export function wordCount(text: string): number {
  let words = 0
  for (const segment of new Intl.Segmenter('en-IN', { granularity: 'word' }).segment(text)) {
    if (segment.isWordLike) words += 1
  }
  return words
}
