// @vitest-environment node
import { buildEditorState } from '@payloadcms/richtext-lexical'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import {
  JOURNAL_TEASER_HEADING,
  JOURNAL_TEASER_LINK,
  RenderBlocks,
} from '@/components/blocks/PageBlocks'
import { Article } from '@/components/journal/Article'
import { HOME } from '@/content/starter/home'
import { READING_BAR_ATTRIBUTE } from '@/lib/experience/narrative'
import type { PostDetail, PostSummary } from '@/lib/journal/posts'

// The Journal on the home page (docs/11 §4, row 8; docs/content/copy-architecture.md §4.1) and
// the article's request for the header's bar (docs/11 §3.1). Every article is obviously fake.
vi.mock('@/components/seo/JsonLd', () => ({ JsonLd: () => null }))

const TOPIC = { id: 7, name: 'Fake topic', slug: 'fake-topic', door: 'framework' as const }
const COUNSELLING = {
  id: 8,
  name: 'Fake counselling topic',
  slug: 'fake-counselling',
  door: 'counselling' as const,
}

const summary = (n: number, topics: PostSummary['topics'] = [TOPIC]): PostSummary => ({
  id: n,
  title: `A fake question ${n}?`,
  slug: `fake-article-${n}`,
  excerpt: `A fake excerpt ${n}.`,
  publishedAt: '2026-11-21T08:30:00.000Z',
  readingTime: 3,
  topics,
})

const draw = (journal: PostSummary[]) =>
  renderToStaticMarkup(<RenderBlocks layout={HOME.layout} slug="home" journal={journal} />)

describe('the Journal on the home page', () => {
  it('is not there while no article is published', () => {
    const html = draw([])
    expect(html).not.toContain(JOURNAL_TEASER_HEADING)
    expect(html).not.toContain('href="/journal')
  })

  it('shows the newest articles before the closing band, each a link to its article', () => {
    const html = draw([summary(1), summary(2), summary(3, [COUNSELLING])])
    const teaser = html.indexOf(JOURNAL_TEASER_HEADING)
    expect(teaser).toBeGreaterThan(-1)
    expect(teaser).toBeLessThan(html.indexOf('iiic-band'))
    for (const n of [1, 2, 3]) {
      expect(html).toContain(`<a href="/journal/fake-article-${n}">A fake question ${n}?</a>`)
      expect(html).toContain(`A fake excerpt ${n}.`)
    }
    expect(html).toContain('Fake counselling topic')
    expect(html).toContain(`href="/journal">${JOURNAL_TEASER_LINK}</a>`)
    // Its heading is a candidate line until IIIC approves it (I-41).
    const section = html.slice(html.lastIndexOf('<section', teaser), teaser)
    expect(section).toContain('data-candidate="I-41"')
    // Nothing in it moves (docs/11 §4, row 8).
    const end = html.indexOf('</section>', teaser)
    expect(html.slice(teaser, end)).not.toContain('data-reveal')
  })

  it('sizes its cards to how many there are', () => {
    expect(draw([summary(1)])).toContain('iiic-card iiic-span-12')
    expect(draw([summary(1), summary(2)])).toContain('iiic-card iiic-span-6')
  })
})

describe('an article’s request for the bar (docs/11 §3.1)', () => {
  const post = (topics: PostDetail['topics']): PostDetail => ({
    ...summary(1, topics),
    body: buildEditorState({ text: 'Fake body words.' }) as PostDetail['body'],
    question: 'What would a fake reader carry home?',
    author: 'founder',
    authorName: null,
    searchTitle: null,
    description: null,
    updatedAt: '2026-11-22T09:00:00.000Z',
  })

  it('is made by an article that leads elsewhere', () => {
    expect(renderToStaticMarkup(<Article post={post([TOPIC])} />)).toContain(
      `${READING_BAR_ATTRIBUTE}=""`,
    )
  })

  it('is never made by one that leads to counselling, whichever of its topics does', () => {
    for (const topics of [[COUNSELLING], [TOPIC, COUNSELLING]]) {
      expect(renderToStaticMarkup(<Article post={post(topics)} />)).not.toContain(
        READING_BAR_ATTRIBUTE,
      )
    }
  })
})
