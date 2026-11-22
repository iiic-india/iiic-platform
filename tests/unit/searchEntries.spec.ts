import { describe, expect, it } from 'vitest'

import { STARTER_PAGES } from '@/content/starter'
import {
  faqEntry,
  indexedFields,
  isSearchablePath,
  pageEntry,
  postEntry,
  serviceEntry,
  staysOutOfIndex,
} from '@/lib/search/entries'
import { SEARCH_KINDS, SEARCHED_COLLECTIONS } from '@/lib/search/kinds'

// The index's rules (docs/04 `search_index`; docs/11 §5.3): what an entry holds, and which
// documents have none. Obviously fake documents.

const fakePage = {
  title: 'Fake page title',
  slug: 'fake-page',
  description: 'A fake description of the fake page.',
  layout: [
    {
      id: 'x1',
      blockType: 'statement',
      heading: 'Fake heading',
      paragraphs: [{ id: 'x2', text: 'A fake paragraph about the self. [[TODO: a fact, I-99]]' }],
      href: '/fake-link',
    },
  ],
}

const lexical = (text: string) => ({
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    direction: 'ltr',
    children: [
      {
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        direction: 'ltr',
        children: [
          { type: 'text', text, format: 0, style: '', mode: 'normal', detail: 0, version: 1 },
        ],
      },
    ],
  },
})

describe('the kinds of result', () => {
  it('are pages, services, articles and questions, in that order and priority', () => {
    expect(SEARCHED_COLLECTIONS).toEqual(['pages', 'services', 'posts', 'faqs'])
    const priorities = SEARCHED_COLLECTIONS.map((kind) => SEARCH_KINDS[kind].priority)
    expect(priorities).toEqual([...priorities].sort((a, b) => b - a))
  })
})

describe('which addresses a result may lead to', () => {
  it('leaves out never-indexed routes, the share images, the Journal’s and the app’s own', () => {
    for (const path of ['/about', '/', '/organisations/team-map', '/counselling', '/legal']) {
      expect(isSearchablePath(path), path).toBe(true)
    }
    for (const path of [
      '/search',
      '/book/session',
      '/account/x',
      '/institute/verify/x',
      '/og/home',
      '/journal',
      '/journal/x',
      '/map',
      '/admin',
    ]) {
      expect(isSearchablePath(path), path).toBe(false)
    }
  })
})

describe('a page’s entry', () => {
  it('holds its title, address, description and the words of its sections', () => {
    const entry = pageEntry(fakePage)
    expect(entry).toEqual({
      title: 'Fake page title',
      url: '/fake-page',
      excerpt: 'A fake description of the fake page.',
      content: [
        'Fake page title',
        'A fake description of the fake page.',
        'Fake heading',
        'A fake paragraph about the self.',
      ].join('\n'),
    })
    // No placeholder, id, kind or link address is something to be found by.
    expect(entry?.content).not.toMatch(/TODO|I-99|x1|statement|fake-link/)
  })

  it('leads the home page to /', () => {
    expect(pageEntry({ ...fakePage, slug: 'home' })?.url).toBe('/')
  })

  it('is none for a page on a never-indexed route, a bad address or a title with a placeholder', () => {
    expect(pageEntry({ ...fakePage, slug: 'book/session' })).toBeNull()
    expect(pageEntry({ ...fakePage, slug: 'search' })).toBeNull()
    expect(pageEntry({ ...fakePage, slug: 'Not A Slug' })).toBeNull()
    expect(pageEntry({ ...fakePage, title: '[[TODO: a title, I-99]]' })).toBeNull()
    expect(pageEntry({ ...fakePage, description: '[[TODO: a line, I-99]]' })?.excerpt).toBeNull()
  })

  it('exists for every starter page the site may show, with words to find it by', () => {
    for (const [slug, page] of Object.entries(STARTER_PAGES)) {
      const entry = pageEntry(page)
      expect(entry, slug).not.toBeNull()
      expect(entry!.content.split('\n').length, slug).toBeGreaterThan(2)
      expect(entry!.content, slug).not.toMatch(/\[\[|\]\]/)
    }
  })
})

describe('an article’s entry', () => {
  const post = {
    title: 'Fake question an article answers?',
    slug: 'fake-article',
    excerpt: 'A fake excerpt.',
    description: 'A fake search description.',
    body: lexical('A fake body sentence about decisions.'),
    question: 'A fake question to sit with?',
    author: 'founder',
  }

  it('holds its title, its excerpt, its body and its question, and leads to /journal/', () => {
    expect(postEntry(post)).toEqual({
      title: 'Fake question an article answers?',
      url: '/journal/fake-article',
      excerpt: 'A fake search description.',
      content: [
        'Fake question an article answers?',
        'A fake excerpt.',
        'A fake body sentence about decisions.',
        'A fake question to sit with?',
      ].join('\n'),
    })
    expect(postEntry({ ...post, description: null })?.excerpt).toBe('A fake excerpt.')
  })

  it('is none for a reserved or malformed address', () => {
    expect(postEntry({ ...post, slug: 'page' })).toBeNull()
    expect(postEntry({ ...post, slug: 'Bad Slug' })).toBeNull()
  })
})

describe('a question’s entry', () => {
  it('holds the question and its answer, and leads to its page', () => {
    expect(
      faqEntry({ question: 'A fake question?', answer: 'A fake answer.', page: 'counselling' }),
    ).toEqual({
      title: 'A fake question?',
      url: '/counselling',
      excerpt: null,
      content: 'A fake question?\nA fake answer.',
    })
    expect(faqEntry({ question: 'A fake question?', answer: 'x', page: 'book/session' })).toBeNull()
  })
})

describe('a service’s entry', () => {
  const service = {
    name: 'Fake service',
    slug: 'fake-service',
    type: 'session',
    register: 'counselling',
    format: 'both',
    active: true,
    options: [{ label: 'Fake option', duration: 30, price: 150000 }],
    sacCode: '999999',
    bookingRules: { noticeHours: 12 },
  }

  it('holds its name, door and format, and never a price, a SAC code or a rule (D-21)', () => {
    const entry = serviceEntry(service)
    expect(entry).toEqual({
      title: 'Fake service',
      url: '/counselling',
      excerpt: 'Counselling · Online or at the office',
      content: 'Fake service\nCounselling · Online or at the office',
    })
    expect(JSON.stringify(entry)).not.toMatch(/150000|1,500|999999|₹|12/)
  })

  it('leads a consultancy service to its own page when the site has one, else to the door', () => {
    expect(
      serviceEntry({ ...service, register: 'consultancy', slug: 'brand-positioning' })?.url,
    ).toBe('/organisations/brand-positioning')
    expect(serviceEntry({ ...service, register: 'consultancy' })?.url).toBe('/organisations')
    expect(serviceEntry({ ...service, register: 'education' })?.url).toBe('/learn')
  })

  it('is none for a service not offered now, or with no door', () => {
    expect(serviceEntry({ ...service, active: false })).toBeNull()
    expect(serviceEntry({ ...service, register: 'nowhere' })).toBeNull()
  })
})

describe('what stays out of the index', () => {
  it('is a published or draftless document the index holds nothing for; drafts are the plugin’s', () => {
    expect(staysOutOfIndex('pages', { ...fakePage, _status: 'published' })).toBe(false)
    expect(staysOutOfIndex('pages', { ...fakePage, slug: 'book/x', _status: 'published' })).toBe(
      true,
    )
    // A draft is left to the plugin, which keeps a published document's entry meanwhile.
    expect(staysOutOfIndex('pages', { ...fakePage, slug: 'book/x', _status: 'draft' })).toBe(false)
    expect(staysOutOfIndex('services', { name: 'Fake', slug: 'x', register: 'education' })).toBe(
      true,
    )
    expect(
      staysOutOfIndex('services', {
        name: 'Fake',
        slug: 'x',
        register: 'education',
        active: true,
      }),
    ).toBe(false)
  })

  it('reads each kind by its own rule', () => {
    expect(indexedFields('pages', fakePage)?.url).toBe('/fake-page')
    expect(indexedFields('faqs', { question: 'Q?', answer: 'A.', page: 'about' })?.url).toBe(
      '/about',
    )
  })
})
