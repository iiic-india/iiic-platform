import { describe, expect, it } from 'vitest'

import {
  contentOf,
  highlightParts,
  matchesAll,
  matchingSentence,
  MAX_CONTENT_LENGTH,
  MAX_QUERY_LENGTH,
  MAX_QUERY_WORDS,
  MAX_SENTENCE_LENGTH,
  normaliseQuery,
  queryWords,
  visibleText,
} from '@/lib/search/text'

describe('a query as the site searches it', () => {
  it('takes the first value of q, as text, with single spaces', () => {
    expect(normaliseQuery('  Subjective   Self ')).toBe('Subjective Self')
    expect(normaliseQuery(['first query', 'second'])).toBe('first query')
    for (const nothing of [undefined, null, 42, {}, [], '   ']) {
      expect(normaliseQuery(nothing), String(nothing)).toBe('')
    }
  })

  it('never passes LIKE’s wildcards or control characters to the database', () => {
    expect(normaliseQuery('100% self_x \\ y')).toBe('100 self x y')
    expect(normaliseQuery('a\u0000b\nc\td')).toBe('a b c d')
  })

  it('reads full-width letters as letters, and is cut to its length limit by characters', () => {
    expect(normaliseQuery('ｓｅｌｆ')).toBe('self')
    const long = 'स्व'.repeat(80)
    const cut = normaliseQuery(long)
    expect([...cut].length).toBeLessThanOrEqual(MAX_QUERY_LENGTH)
    expect(long.startsWith(cut)).toBe(true)
    expect(normaliseQuery('😀'.repeat(150))).toBe('😀'.repeat(MAX_QUERY_LENGTH))
  })

  it('is matched by its words: punctuation falls away, each word once, at most eight', () => {
    expect(queryWords('What is Subjective Self?')).toEqual(['What', 'is', 'Subjective', 'Self'])
    expect(queryWords('self SELF Self')).toEqual(['self'])
    expect(queryWords('“self” — (team)')).toEqual(['self', 'team'])
    expect(queryWords('one two three four five six seven eight nine ten')).toHaveLength(
      MAX_QUERY_WORDS,
    )
    expect(queryWords('')).toEqual([])
    expect(queryWords('?! …')).toEqual([])
  })

  it('keeps the parts of a word with an apostrophe that are two letters or more', () => {
    expect(queryWords("IIIC's founder")).toEqual(['IIIC', 'founder'])
    expect(queryWords('don’t')).toEqual(['don'])
  })

  it('finds Gujarati and Hindi words by their own word rules', () => {
    expect(queryWords('आत्मानं विद्धि')).toEqual(['आत्मानं', 'विद्धि'])
  })
})

describe('an entry’s text', () => {
  it('holds what a visitor reads, never ids, kinds, links or marks', () => {
    const sections = [
      {
        id: 'fake-id',
        blockType: 'hero',
        blockName: 'Fake name',
        copyStatus: 'candidate',
        anchor: 'fake-anchor',
        heading: 'Fake heading',
        action: { label: 'Fake action', href: '/fake' },
        doors: [{ glyph: 'F', title: 'Fake door', audience: 'Fake audience' }],
      },
    ]
    expect(visibleText(sections)).toEqual([
      'Fake heading',
      'Fake action',
      'Fake door',
      'Fake audience',
    ])
  })

  it('is one line per part, without placeholders, empty lines or extra spaces', () => {
    expect(
      contentOf([
        'Fake title',
        null,
        '  Fake   line one.\n\nFake line two [[TODO: a fact, I-99]].  ',
        '[[TODO: only a placeholder, I-98]]',
        undefined,
      ]),
    ).toBe('Fake title\nFake line one.\nFake line two .')
  })

  it('is kept to its limit', () => {
    expect(contentOf(['x'.repeat(MAX_CONTENT_LENGTH + 10)])).toHaveLength(MAX_CONTENT_LENGTH)
  })
})

describe('matching, as Payload’s like matches', () => {
  it('needs every word somewhere in the text, whatever its case', () => {
    expect(matchesAll('Subjective Self is a framework', ['self', 'FRAMEWORK'])).toBe(true)
    expect(matchesAll('Subjective Self is a framework', ['self', 'family'])).toBe(false)
    expect(matchesAll('selfhood', ['self'])).toBe(true)
    expect(matchesAll('anything', [])).toBe(false)
  })

  it('reads a word as text, never as a pattern', () => {
    expect(matchesAll('3.5 hours', ['3.5'])).toBe(true)
    expect(matchesAll('305 hours', ['3.5'])).toBe(false)
    expect(matchesAll('a (b) c', ['(b)'])).toBe(true)
  })
})

describe('the sentence a result shows', () => {
  const content = [
    'Fake title about the self',
    'The first sentence says nothing. The team decides together.',
    'A family and a team both meet the self here.',
  ].join('\n')

  it('is the one holding the most words, never the title', () => {
    expect(matchingSentence(content, ['team', 'self'])).toBe(
      'A family and a team both meet the self here.',
    )
    expect(matchingSentence(content, ['self'], 'Fake title about the self')).toBe(
      'A family and a team both meet the self here.',
    )
    expect(matchingSentence(content, ['decides'])).toBe('The team decides together.')
    expect(matchingSentence(content, ['nowhere'])).toBeNull()
  })

  it('is cut around the match when long, at spaces, with an ellipsis', () => {
    const long = `${'Before the word. '.repeat(3).replace(/\. /g, ' ')}${'filler words '.repeat(20)}the self appears here ${'and more words after it '.repeat(10)}`
    const shown = matchingSentence(long, ['appears'])
    expect(shown).not.toBeNull()
    expect(shown!.length).toBeLessThanOrEqual(MAX_SENTENCE_LENGTH + 2)
    expect(shown).toContain('appears')
    expect(shown!.startsWith('…')).toBe(true)
    expect(shown!.endsWith('…')).toBe(true)
  })
})

describe('the marked words', () => {
  it('splits a text into the words found and the rest, in order', () => {
    expect(highlightParts('Self and the SELF', ['self'])).toEqual([
      { text: 'Self', match: true },
      { text: ' and the ', match: false },
      { text: 'SELF', match: true },
    ])
    expect(highlightParts('Selfhood', ['self', 'selfhood'])).toEqual([
      { text: 'Selfhood', match: true },
    ])
    expect(highlightParts('nothing here', [])).toEqual([{ text: 'nothing here', match: false }])
    expect(highlightParts('', ['self'])).toEqual([])
  })
})
