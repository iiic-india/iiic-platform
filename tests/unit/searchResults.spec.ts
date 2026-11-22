import { describe, expect, it } from 'vitest'

import { groupResults, resultCount, type SearchEntry } from '@/lib/search/results'

// The results page's grouping (docs/11 §5.3): by kind, with the sentence that matched.
const entry = (overrides: Partial<SearchEntry>): SearchEntry => ({
  kind: 'pages',
  title: 'Fake title',
  url: '/fake',
  excerpt: null,
  content: 'Fake title\nA fake sentence.',
  priority: 40,
  ...overrides,
})

const text = (parts: { text: string }[]) => parts.map((part) => part.text).join('')

describe('the results, grouped', () => {
  it('come in the order pages, services, Journal, questions, with no empty group', () => {
    const groups = groupResults(
      [
        entry({ kind: 'faqs', title: 'Fake question about the self?', url: '/a', priority: 10 }),
        entry({ kind: 'pages', title: 'Fake page on the self', url: '/b' }),
        entry({ kind: 'posts', title: 'Fake article on the self', url: '/journal/c' }),
      ],
      ['self'],
    )
    expect(groups.map((group) => [group.kind, group.heading])).toEqual([
      ['pages', 'Pages'],
      ['posts', 'From the Journal'],
      ['faqs', 'Questions and answers'],
    ])
    expect(resultCount(groups)).toBe(3)
  })

  it('put a title that holds every word first, then the higher priority, then by title', () => {
    const [pages] = groupResults(
      [
        entry({ title: 'Zeta', url: '/z', content: 'Zeta\nThe self and the team.' }),
        entry({ title: 'Alpha', url: '/a', content: 'Alpha\nThe self and the team.' }),
        entry({ title: 'Raised', url: '/r', priority: 90, content: 'Raised\nThe self, the team.' }),
        entry({ title: 'The self', url: '/s', priority: 1, content: 'The self\nA team.' }),
      ],
      ['self'],
    )
    expect(pages!.results.map((result) => result.url)).toEqual(['/s', '/r', '/a', '/z'])
  })

  it('show one result per address and title in a kind', () => {
    const groups = groupResults(
      [
        entry({ url: '/same', title: 'Same' }),
        entry({ url: '/same', title: 'Same' }),
        entry({ url: '/same', title: 'Other question', kind: 'faqs' }),
        entry({ url: '/same', title: 'Another question', kind: 'faqs' }),
      ],
      ['same'],
    )
    expect(groups.map((group) => group.results.length)).toEqual([1, 2])
  })

  it('show the sentence that matched with the words marked, else the excerpt', () => {
    const [pages] = groupResults(
      [
        entry({
          title: 'Fake title',
          excerpt: 'A fake excerpt.',
          content: 'Fake title\nNothing here. The team chooses.',
        }),
        entry({ title: 'Team page', url: '/team', excerpt: 'Fake excerpt.', content: 'Team page' }),
      ],
      ['team'],
    )
    const [first, second] = pages!.results
    expect(text(first!.title)).toBe('Team page')
    expect(first!.title.some((part) => part.match)).toBe(true)
    expect(text(first!.snippet)).toBe('Fake excerpt.')
    expect(text(second!.snippet)).toBe('The team chooses.')
    expect(second!.snippet.filter((part) => part.match).map((part) => part.text)).toEqual(['team'])
  })

  it('are none for no entries', () => {
    expect(groupResults([], ['self'])).toEqual([])
    expect(resultCount([])).toBe(0)
  })
})
