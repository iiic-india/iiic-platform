// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  articlePath,
  isArticleSlug,
  JOURNAL_PATH,
  listPath,
  listTitle,
  pageNumber,
  parseJournalAddress,
  RESERVED_SLUGS,
  TOPIC_NAME_MAX,
} from '@/lib/journal/addresses'
import { DOOR_OPTIONS, doorOf, DOORS } from '@/lib/journal/doors'
import {
  holdsWords,
  isQuestion,
  needsSearchTitle,
  SEARCH_TITLE_MAX,
  searchTitleOf,
  withoutPlaceholder,
} from '@/lib/journal/rules'
import { JOURNAL_PAGE } from '@/lib/seo/appPages'
import { isNoindexPath } from '@/lib/seo/paths'
import { canonicalPath } from '@/lib/seo/site'

// The Journal's addresses and the rules its articles are held to (src/lib/journal/; docs/02,
// docs/12 §3). Slugs and names are obviously fake.

describe('the Journal’s addresses', () => {
  it('are clean: no query, page 1 is the list itself, every address in its canonical form', () => {
    expect(listPath()).toBe('/journal')
    expect(listPath(undefined, 1)).toBe('/journal')
    expect(listPath(undefined, 2)).toBe('/journal/page/2')
    expect(listPath('fake-topic')).toBe('/journal/topic/fake-topic')
    expect(listPath('fake-topic', 3)).toBe('/journal/topic/fake-topic/page/3')
    expect(articlePath('fake-article')).toBe('/journal/fake-article')
    for (const path of [
      listPath(),
      listPath(undefined, 2),
      listPath('fake-topic', 3),
      articlePath('fake-article'),
    ]) {
      expect(canonicalPath(path), path).toBe(path)
      expect(path).not.toMatch(/[?#]/)
      // Every one of them may be indexed (D-67).
      expect(isNoindexPath(path), path).toBe(false)
    }
    expect(JOURNAL_PAGE.path).toBe(JOURNAL_PATH)
  })

  it('read a page number only as digits from 1 to 999, with no leading zero', () => {
    expect(pageNumber('1')).toBe(1)
    expect(pageNumber('2')).toBe(2)
    expect(pageNumber('999')).toBe(999)
    for (const bad of ['0', '01', '1000', '-1', '1.5', '2e1', ' 2', 'two', '']) {
      expect(pageNumber(bad), bad).toBeNull()
    }
  })

  it('keep "page" and "topic" from articles: their addresses are the lists’', () => {
    expect([...RESERVED_SLUGS]).toEqual(['page', 'topic'])
    for (const slug of RESERVED_SLUGS) expect(isArticleSlug(slug), slug).toBe(false)
    expect(isArticleSlug('what-is-subjective-self')).toBe(true)
    expect(isArticleSlug('fake-2')).toBe(true)
    for (const bad of ['Fake', 'fake article', 'fake--article', '-fake', 'fake/article', '']) {
      expect(isArticleSlug(bad), bad).toBe(false)
    }
  })

  it('are read back from an address as the routes read them', () => {
    expect(parseJournalAddress('journal')).toEqual({ kind: 'list', page: 1 })
    expect(parseJournalAddress('journal/page/2')).toEqual({ kind: 'list', page: 2 })
    expect(parseJournalAddress('journal/topic/fake-topic')).toEqual({
      kind: 'topic',
      topic: 'fake-topic',
      page: 1,
    })
    expect(parseJournalAddress('journal/topic/fake-topic/page/4')).toEqual({
      kind: 'topic',
      topic: 'fake-topic',
      page: 4,
    })
    expect(parseJournalAddress('journal/fake-article')).toEqual({
      kind: 'article',
      slug: 'fake-article',
    })
    for (const none of [
      'about',
      'journalfake',
      'journal/page',
      'journal/page/1',
      'journal/page/0',
      'journal/page/two',
      'journal/topic',
      'journal/topic/Fake',
      'journal/topic/fake/page/1',
      'journal/topic/fake/pages/2',
      'journal/topic/fake/page/2/more',
      'journal/fake-article/more',
      'journal/Fake-Article',
    ]) {
      expect(parseJournalAddress(none), none).toBeNull()
    }
  })

  it('title each list for the tab, never past the 53 characters it holds (D-65)', () => {
    expect(listTitle(JOURNAL_PAGE.title)).toBe(JOURNAL_PAGE.title)
    expect(listTitle(JOURNAL_PAGE.title, undefined, 2)).toBe('The Journal, page 2')
    expect(listTitle(JOURNAL_PAGE.title, 'Fake topic')).toBe('The Journal: Fake topic')
    expect(listTitle(JOURNAL_PAGE.title, 'Fake topic', 3)).toBe('The Journal: Fake topic, page 3')
    const longest = listTitle(JOURNAL_PAGE.title, 'W'.repeat(TOPIC_NAME_MAX), 999)
    expect([...longest].length).toBeLessThanOrEqual(SEARCH_TITLE_MAX)
    expect([...JOURNAL_PAGE.title].length).toBeLessThanOrEqual(SEARCH_TITLE_MAX)
  })
})

describe('the doors an article leads to', () => {
  it('are the framework and the three applications, in the site’s own words', () => {
    expect(
      Object.fromEntries(Object.entries(DOORS).map(([door, { path }]) => [door, path])),
    ).toEqual({
      framework: '/framework',
      organisations: '/organisations',
      learn: '/learn',
      counselling: '/counselling',
    })
    // Each link says where it goes; none is an offer, a booking or a clinical word.
    for (const { link } of Object.values(DOORS)) {
      expect(link).toMatch(/^Read about /)
      expect(link).not.toMatch(/\b(?:book|buy|therap\w*|clinical|treatment|free)\b/i)
    }
    expect(DOOR_OPTIONS.map(({ value }) => value)).toEqual(Object.keys(DOORS))
  })

  it('are found for a value the CMS holds, and for nothing else', () => {
    expect(doorOf('counselling')).toBe(DOORS.counselling)
    for (const none of [undefined, null, '', 'constructor', 'toString', 'Counselling', 7]) {
      expect(doorOf(none), String(none)).toBeUndefined()
    }
  })
})

describe('the rules an article is held to', () => {
  it('refuse a placeholder, in brackets or as a TODO, and pass anything else', () => {
    for (const bad of ['[[TODO: fake, I-19]]', 'Fake [[ text', 'Fake ]] text', 'Fake TODO text']) {
      expect(withoutPlaceholder(bad), bad).not.toBe(true)
    }
    for (const ok of ['A fake title?', '', null, undefined, 'fake to-do']) {
      expect(withoutPlaceholder(ok), String(ok)).toBe(true)
    }
  })

  it('refuse a text of spaces where words are needed', () => {
    expect(holdsWords('Fake words', 'title')).toBe(true)
    expect(holdsWords('   ', 'title')).toBe('Write the title.')
    expect(holdsWords(undefined, 'question')).toBe('Write the question.')
  })

  it('take the question to sit with only as a question', () => {
    for (const ok of [
      'What did you decide today?',
      'Which decision was yours? ',
      '“Whose expectation are you carrying?”',
      'What would change (if anything)?)',
    ]) {
      expect(isQuestion(ok), ok).toBe(true)
    }
    for (const bad of ['Think about your day.', 'What now', 'What now?!', '', undefined]) {
      expect(isQuestion(bad), String(bad)).not.toBe(true)
    }
  })

  it('give search the article’s search title, else its own while it fits the tab', () => {
    expect(searchTitleOf({ title: 'A fake title?', searchTitle: 'Fake search title' })).toBe(
      'Fake search title',
    )
    expect(searchTitleOf({ title: 'A fake title?', searchTitle: '  ' })).toBe('A fake title?')
    expect(searchTitleOf({ title: 'A fake title?' })).toBe('A fake title?')
    expect(needsSearchTitle('x'.repeat(SEARCH_TITLE_MAX))).toBe(false)
    expect(needsSearchTitle('x'.repeat(SEARCH_TITLE_MAX + 1))).toBe(true)
    expect(needsSearchTitle(undefined)).toBe(false)
  })
})
