// @vitest-environment node
import { buildEditorState } from '@payloadcms/richtext-lexical'
import { describe, expect, it } from 'vitest'

import {
  bodyText,
  readingMinutes,
  readingTimeLabel,
  WORDS_PER_MINUTE,
  wordCount,
} from '@/lib/journal/readingTime'

// An article's reading time, counted from its body (src/lib/journal/readingTime.ts;
// docs/content/copy-architecture.md §4.8). Bodies are built with Payload's own helper, as the
// editor stores them. Every text is obviously fake.

/** A body of one paragraph of fake words. */
const paragraph = (words: number) =>
  buildEditorState({ text: Array.from({ length: words }, () => 'fake').join(' ') })

/** A text node, as the editor writes one. */
const text = (value: string) => ({
  type: 'text' as const,
  detail: 0,
  format: 0,
  mode: 'normal' as const,
  style: '',
  text: value,
  version: 1,
})

describe('the words in a text', () => {
  it('are counted by Unicode’s word rules: punctuation and spaces are not words', () => {
    expect(wordCount('')).toBe(0)
    expect(wordCount('   ')).toBe(0)
    expect(wordCount('Fake, fake — fake!')).toBe(3)
    expect(wordCount('A fake word’s apostrophe stays inside it.')).toBe(7)
    expect(wordCount('25 fake years')).toBe(3)
  })

  it('are counted in Gujarati and Hindi as in English', () => {
    expect(wordCount('આત્માને ઓળખો')).toBe(2)
    expect(wordCount('आत्मानं विद्धि')).toBe(2)
  })
})

describe('the minutes an article takes to read', () => {
  it('are the words of its body at 200 a minute, rounded up', () => {
    expect(WORDS_PER_MINUTE).toBe(200)
    expect(readingMinutes(paragraph(1))).toBe(1)
    expect(readingMinutes(paragraph(200))).toBe(1)
    expect(readingMinutes(paragraph(201))).toBe(2)
    expect(readingMinutes(paragraph(1000))).toBe(5)
  })

  it('count every part of the body: headings, lists and quotes too', () => {
    // Nodes as the editor stores them; the helper's own types allow fewer shapes than it takes.
    const nodes = [
      {
        type: 'heading',
        tag: 'h2',
        children: [text('Fake heading')],
        direction: null,
        format: '',
        indent: 0,
        version: 1,
      },
      {
        type: 'list',
        listType: 'bullet',
        tag: 'ul',
        start: 1,
        children: [
          {
            type: 'listitem',
            value: 1,
            children: [text('fake item')],
            direction: null,
            format: '',
            indent: 0,
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        version: 1,
      },
      {
        type: 'quote',
        children: [text('fake quoted words')],
        direction: null,
        format: '',
        indent: 0,
        version: 1,
      },
    ]
    const body = buildEditorState({ text: 'Fake opening words.', nodes: nodes as never })
    expect(wordCount(bodyText(body))).toBe(3 + 2 + 2 + 3)
    expect(readingMinutes(body)).toBe(1)
  })

  it('are none for an empty body, or for anything that is not one', () => {
    expect(readingMinutes(buildEditorState({}))).toBe(0)
    for (const value of [undefined, null, '', 'fake text', {}, { root: {} }, { root: null }]) {
      expect(readingMinutes(value), JSON.stringify(value)).toBe(0)
      expect(bodyText(value), JSON.stringify(value)).toBe('')
    }
  })
})

describe('the reading time as a page shows it', () => {
  it('says the minutes in figures, in words VOICE.md uses, and nothing when there is none', () => {
    expect(readingTimeLabel(1)).toBe('1 minute to read')
    expect(readingTimeLabel(4)).toBe('4 minutes to read')
    expect(readingTimeLabel(12)).toBe('12 minutes to read')
    for (const none of [0, -1, null, undefined]) expect(readingTimeLabel(none)).toBeNull()
  })
})
