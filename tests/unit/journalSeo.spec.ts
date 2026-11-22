// @vitest-environment node
import { buildEditorState } from '@payloadcms/richtext-lexical'
import type { Metadata } from 'next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PostDetail, TopicSummary } from '@/lib/journal/posts'
import {
  articleDescription,
  articleGraphOf,
  articleMetadata,
  authorOf,
  listGraph,
  listMetadata,
} from '@/lib/journal/seo'
import { JOURNAL_PAGE } from '@/lib/seo/appPages'
import { shareImageUrl } from '@/lib/seo/metadata'
import { founderNode, type JsonLdGraph, serializeJsonLd } from '@/lib/seo/schema'
import { FOUNDER, SITE_NAME } from '@/lib/seo/site'

// What search engines, link previews and answer engines read from the Journal (docs/12 §3;
// D-62, D-64, D-65): an article's metadata and structured data, and a list's. Every article,
// topic and name here is obviously fake; the founder is the one recorded fact (D-64).

const ORIGIN = 'https://fake.example'

const TOPIC: TopicSummary = {
  id: 7,
  name: 'Fake topic',
  slug: 'fake-topic',
  door: 'framework',
  description: null,
}

/** A published article by the founder. */
const POST: PostDetail = {
  id: 1,
  title: 'A fake question that is far too long to fit inside a browser tab as it is?',
  slug: 'fake-article',
  excerpt: 'A fake excerpt that answers the fake question.',
  publishedAt: '2026-11-21T08:30:00.000Z',
  updatedAt: '2026-11-22T09:00:00.000Z',
  readingTime: 4,
  topics: [TOPIC],
  body: buildEditorState({ text: 'Fake body text.' }) as PostDetail['body'],
  question: 'What would a fake reader ask themselves?',
  author: 'founder',
  authorName: null,
  searchTitle: 'A fake search title',
  description: null,
}

/** The same article by someone else. */
const BY_SOMEONE_ELSE: PostDetail = { ...POST, author: 'other', authorName: 'Fake Author' }

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }
type Node = { [key: string]: Json }

/** A graph as a crawler reads it: serialised for the script element, then parsed. */
const read = (graph: JsonLdGraph) =>
  (JSON.parse(serializeJsonLd(graph)) as { '@graph': Node[] })['@graph']

const isNode = (value: Json | undefined): value is Node =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Every object in a value, the nested ones included. */
const objects = (value: Json): Node[] =>
  Array.isArray(value)
    ? value.flatMap(objects)
    : isNode(value)
      ? [value, ...Object.values(value).flatMap(objects)]
      : []

/** Every string a value holds. */
const strings = (value: Json): string[] =>
  typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value.flatMap(strings)
      : isNode(value)
        ? Object.values(value).flatMap(strings)
        : []

const ofType = (graph: Node[], type: string) => graph.filter((node) => node['@type'] === type)

/** The words no value may hold (tests/unit/seoSchema.spec.ts). */
const BANNED_WORDS =
  /\b(?:therap(?:y|ies|ist|ists|eutic)|psychologists?|clinical|diagnos[ei]s|diagnostic|treatments?|degrees?|diplomas?|accredit(?:ed|ation)|recogni[sz]ed|affiliat(?:ed|ion)|guarantee[ds]?|best|leading|top-rated|no\.\s?1|first ever|ankvishwa)\b/i

/** The types an article's or a list's graph may use: the pages' and the Article (D-62). */
const KNOWN_TYPES = ['Article', 'BreadcrumbList', 'ListItem', 'Person', 'WebPage']

const og = (metadata: Metadata) => metadata.openGraph as Record<string, unknown>

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', ORIGIN)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('an article’s author', () => {
  it('is the founder as VOICE.md names him, or the name the article gives', () => {
    expect(authorOf(POST)).toEqual({
      founder: true,
      name: FOUNDER.name,
      line: `${FOUNDER.name}, founder`,
    })
    expect(authorOf(BY_SOMEONE_ELSE)).toEqual({
      founder: false,
      name: 'Fake Author',
      line: 'Fake Author',
    })
    // A name that holds a placeholder is no name at all.
    expect(authorOf({ author: 'other', authorName: '[[TODO: fake, I-19]]' }).name).toBeNull()
  })
})

describe('an article’s metadata (docs/12 §3)', () => {
  // Built in each test, once the fake origin is in place.
  let metadata: Metadata
  beforeEach(() => {
    metadata = articleMetadata(POST)
  })

  it('is its search title, its description and its canonical address', () => {
    expect(metadata.title).toBe('A fake search title')
    // No description of its own: the excerpt.
    expect(metadata.description).toBe(POST.excerpt)
    expect(articleDescription({ ...POST, description: 'A fake description.' })).toBe(
      'A fake description.',
    )
    expect(metadata.alternates?.canonical).toBe(`${ORIGIN}/journal/fake-article`)
    expect(metadata.robots).toEqual({ 'max-image-preview': 'large' })
  })

  it('is an article to Open Graph, with its dates, its author and its topic', () => {
    expect(og(metadata)).toMatchObject({
      type: 'article',
      url: `${ORIGIN}/journal/fake-article`,
      siteName: SITE_NAME,
      locale: 'en_IN',
      title: 'A fake search title · IIIC',
      description: POST.excerpt,
      publishedTime: '2026-11-21T08:30:00.000Z',
      modifiedTime: '2026-11-22T09:00:00.000Z',
      authors: [FOUNDER.name],
      section: 'Fake topic',
    })
  })

  it('shares an image of its own title and author, versioned by both', () => {
    const image = shareImageUrl('/journal/fake-article', POST.title, FOUNDER.name)
    expect(image).toMatch(/^\/og\/journal\/fake-article\?v=[0-9a-f]{8}$/)
    expect(og(metadata).images).toEqual([
      { url: image, width: 1200, height: 630, alt: `${POST.title}, ${SITE_NAME}` },
    ])
    expect((metadata.twitter as { images?: unknown }).images).toEqual(og(metadata).images)
    // Another author is another picture, at another address.
    const other = og(articleMetadata(BY_SOMEONE_ELSE)).images as { url: string }[]
    expect(other[0]?.url).not.toBe(image)
    expect(other[0]?.url).toBe(shareImageUrl('/journal/fake-article', POST.title, 'Fake Author'))
  })

  it('falls back to the article’s own title while it fits the tab, and leaves out what is not known', () => {
    const short = articleMetadata({
      ...POST,
      title: 'A fake short question?',
      searchTitle: null,
      author: 'other',
      authorName: null,
      topics: [],
    })
    expect(short.title).toBe('A fake short question?')
    expect(og(short)).not.toHaveProperty('authors')
    expect(og(short)).not.toHaveProperty('section')
  })
})

describe('a list’s metadata', () => {
  it('is the Journal’s own on its first page', () => {
    const metadata = listMetadata(null, 1)
    expect(metadata.title).toBe(JOURNAL_PAGE.title)
    expect(metadata.description).toBe(JOURNAL_PAGE.description)
    expect(metadata.alternates?.canonical).toBe(`${ORIGIN}/journal`)
    expect(og(metadata).type).toBe('website')
  })

  it('names the page and the topic after the first, each at its own address', () => {
    expect(listMetadata(null, 2)).toMatchObject({
      title: 'The Journal, page 2',
      alternates: { canonical: `${ORIGIN}/journal/page/2` },
    })
    const topic = listMetadata({ ...TOPIC, description: 'A fake topic description.' }, 3)
    expect(topic).toMatchObject({
      title: 'The Journal: Fake topic, page 3',
      description: 'A fake topic description.',
      alternates: { canonical: `${ORIGIN}/journal/topic/fake-topic/page/3` },
    })
    // A topic without a description of its own takes the Journal's.
    expect(listMetadata(TOPIC, 1).description).toBe(JOURNAL_PAGE.description)
  })
})

describe('an article’s structured data (D-62)', () => {
  const graph = read(articleGraphOf(POST, ORIGIN))
  const url = `${ORIGIN}/journal/fake-article`

  it('is the page, the way down to it and the Article, with only known types', () => {
    expect(graph.map((node) => node['@type'])).toEqual([
      'WebPage',
      'BreadcrumbList',
      'Article',
      'Person',
    ])
    for (const node of objects(graph)) {
      if ('@type' in node) expect(KNOWN_TYPES, String(node['@type'])).toContain(node['@type'])
    }
  })

  it('gives the Article its headline, its dates, its author and its publisher', () => {
    const [article] = ofType(graph, 'Article')
    expect(article).toEqual({
      '@type': 'Article',
      '@id': `${url}#article`,
      headline: POST.title,
      description: POST.excerpt,
      url,
      mainEntityOfPage: { '@id': `${url}#webpage` },
      inLanguage: 'en-IN',
      datePublished: '2026-11-21T08:30:00.000Z',
      dateModified: '2026-11-22T09:00:00.000Z',
      author: { '@id': `${ORIGIN}/about#gaurang-mistry` },
      publisher: { '@id': `${ORIGIN}/#organization` },
      articleSection: 'Fake topic',
      image: `${ORIGIN}${shareImageUrl('/journal/fake-article', POST.title, FOUNDER.name)}`,
    })
  })

  it('describes the founder it points at, as the home and About pages do (D-64)', () => {
    const [person] = ofType(graph, 'Person')
    expect(person).toEqual(JSON.parse(JSON.stringify(founderNode(ORIGIN))))
  })

  it('names another author as a Person with the name the article shows, and nothing more', () => {
    const other = read(articleGraphOf(BY_SOMEONE_ELSE, ORIGIN))
    expect(ofType(other, 'Article')[0]?.author).toEqual({ '@type': 'Person', name: 'Fake Author' })
    // The founder is not described on a page he did not write.
    expect(other.filter((node) => node['@type'] === 'Person')).toHaveLength(0)
    const nameless = read(articleGraphOf({ ...BY_SOMEONE_ELSE, authorName: null }, ORIGIN))
    expect(ofType(nameless, 'Article')[0]).not.toHaveProperty('author')
  })

  it('leads down from the home page through the Journal and the article’s topic', () => {
    const [breadcrumb] = ofType(graph, 'BreadcrumbList')
    const steps = (breadcrumb?.itemListElement as Node[]).map(({ name, item }) => [name, item])
    expect(steps).toEqual([
      ['Home', `${ORIGIN}/`],
      ['Journal', `${ORIGIN}/journal`],
      ['Fake topic', `${ORIGIN}/journal/topic/fake-topic`],
      ['A fake search title', url],
    ])
  })

  it('holds no placeholder, no empty value, no banned word and no price', () => {
    for (const text of strings(graph)) {
      expect(text, text).not.toMatch(/\[\[|\]\]|TODO/)
      expect(text.trim(), 'an empty string').not.toBe('')
      expect(text, text).not.toMatch(BANNED_WORDS)
      expect(text, text).not.toMatch(/₹|\bRs\b|\bINR\b/)
    }
  })

  it('points only at nodes it defines, or that the home and About pages define', () => {
    const defined = new Set(
      objects(graph)
        .filter((node) => '@id' in node && Object.keys(node).length > 1)
        .map((node) => String(node['@id'])),
    )
    const elsewhere = new Set([`${ORIGIN}/#organization`, `${ORIGIN}/#website`])
    for (const reference of objects(graph).filter(
      (node) => Object.keys(node).length === 1 && '@id' in node,
    )) {
      const id = String(reference['@id'])
      expect(defined.has(id) || elsewhere.has(id), id).toBe(true)
    }
  })
})

describe('a list’s structured data', () => {
  it('is a page and the way down to it, through the Journal and its topic', () => {
    const first = read(listGraph(null, 1))
    expect(first.map((node) => node['@type'])).toEqual(['WebPage', 'BreadcrumbList'])
    const topicPage = read(listGraph(TOPIC, 2))
    const [breadcrumb] = ofType(topicPage, 'BreadcrumbList')
    expect((breadcrumb?.itemListElement as Node[]).map(({ name }) => name)).toEqual([
      'Home',
      'Journal',
      'Fake topic',
      'The Journal: Fake topic, page 2',
    ])
  })
})
