// @vitest-environment node
import { connection } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GET, maxDuration, runtime } from '@/app/llms.txt/route'
import { STARTER_PAGES, starterAt } from '@/content/starter'
import { ACCESSIBILITY, LEGAL_PAGES } from '@/content/starter/legal'
import { getPage } from '@/lib/content/pages'
import { pagePath } from '@/lib/content/slug'
import type { PageContent } from '@/lib/content/types'
import { APP_PAGES, JOURNAL_PAGE, MAP_PAGE } from '@/lib/seo/appPages'
import { buildLlmsTxt, type LlmsPage } from '@/lib/seo/llms'
import { FOUNDER, HOME_TITLE, SITE_DESCRIPTION, SITE_NAME } from '@/lib/seo/site'
import { sitemapEntries, type SitemapSource } from '@/lib/seo/sitemap'
import { sitemapSource } from '@/lib/seo/sitemapSource'
import { CONTACT } from '@/lib/site/contact'

// /llms.txt (src/lib/seo/llms.ts, src/app/llms.txt/route.ts; D-66): the site's facts and its
// pages in the llmstxt.org format. The CMS is faked: the route reads it through sitemapSource
// and getPage.
vi.mock('next/server', () => ({ connection: vi.fn(async () => undefined) }))
vi.mock('@/lib/seo/sitemapSource', () => ({ sitemapSource: vi.fn() }))
vi.mock('@/lib/content/pages', () => ({ getPage: vi.fn() }))

const ORIGIN = 'https://fake.example'
const STARTERS = Object.keys(STARTER_PAGES)

/**
 * The starter pages, Find your path and the Journal, as the route lists them while the CMS
 * holds nothing.
 */
const SITE_PAGES: LlmsPage[] = [
  ...Object.entries(STARTER_PAGES).map(([slug, page]) => ({
    path: pagePath(slug),
    title: slug === 'home' ? HOME_TITLE : page.title,
    description: page.description,
  })),
  ...APP_PAGES,
]

/** A topic and two articles of the Journal, as the route lists them. Obviously fake. */
const JOURNAL_PAGES: LlmsPage[] = [
  {
    path: '/journal/topic/fake-topic',
    title: 'The Journal: Fake topic',
    description: JOURNAL_PAGE.description,
  },
  {
    path: '/journal/fake-newer-article',
    title: 'A fake newer article?',
    description: 'A fake excerpt.',
    publishedAt: '2026-11-21T20:00:00.000Z',
  },
  {
    path: '/journal/fake-older-article',
    title: 'A fake older article?',
    publishedAt: '2026-10-30T08:30:00.000Z',
  },
]

/** The file's parts: what comes before the first section, then each section by its heading. */
function parts(text: string) {
  const [intro = '', ...sections] = text.split(/^## /m)
  return {
    intro: intro.split('\n'),
    sections: Object.fromEntries(
      sections.map((section) => {
        const [heading = '', ...lines] = section.split('\n')
        return [heading, lines.filter((line) => line !== '')]
      }),
    ),
  }
}

/** What the fake CMS holds: nothing, unless a test says otherwise. */
const source = (held: Partial<SitemapSource> = {}): SitemapSource => ({
  starterSlugs: STARTERS,
  published: [],
  everPublished: [],
  posts: [],
  topics: [],
  ...held,
})

/** The fake CMS: the pages published in it by slug, over the starter pages (D-51, D-57). */
function cmsHolds(held: Partial<SitemapSource> = {}, published: Record<string, PageContent> = {}) {
  const state = source(held)
  vi.mocked(sitemapSource).mockResolvedValue(state)
  vi.mocked(getPage).mockImplementation(async (slug: string) => {
    if (Object.hasOwn(published, slug)) return published[slug] ?? null
    return state.everPublished.includes(slug) ? null : (starterAt(slug) ?? null)
  })
  return state
}

/** A page published in the admin. Obviously fake. */
const fakePage = (slug: string, title: string, description?: string): PageContent => ({
  title,
  slug,
  description,
  layout: [{ blockType: 'hero', heading: 'Fake heading', copyStatus: 'approved' }],
})

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', ORIGIN)
  vi.mocked(sitemapSource).mockReset()
  vi.mocked(getPage).mockReset()
  vi.mocked(connection).mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('llms.txt', () => {
  it('has the llmstxt.org shape: one H1, a quoted summary, then lists under H2 headings', () => {
    const text = buildLlmsTxt(SITE_PAGES, ORIGIN)
    const lines = text.split('\n')
    expect(lines[0]).toBe(`# ${SITE_NAME}`)
    expect(lines[1]).toBe('')
    expect(lines[2]).toBe(`> ${SITE_DESCRIPTION}`)
    expect(lines.filter((line) => /^# /.test(line))).toHaveLength(1)
    expect(lines.filter((line) => /^>/.test(line))).toHaveLength(1)
    // No heading before the lists but the H1, none deeper than H2, and a final line end.
    const { intro, sections } = parts(text)
    expect(intro.filter((line) => /^#/.test(line))).toEqual([`# ${SITE_NAME}`])
    expect(text).not.toMatch(/^###/m)
    expect(text.endsWith('\n')).toBe(true)
    expect(Object.keys(sections)).toEqual(['Pages', 'Legal'])
    // Every line of a list is a link, alone or followed by ": " and its notes.
    for (const line of Object.values(sections).flat()) {
      expect(line, line).toMatch(/^- \[[^\]]+\]\(https:\/\/fake\.example\/[^)\s]*\)(?:: \S.*)?$/)
    }
  })

  it('gives the contact details the site shows, and names the founder by his title', () => {
    const { intro } = parts(buildLlmsTxt(SITE_PAGES, ORIGIN))
    expect(intro.filter((line) => line.startsWith('- '))).toEqual([
      `- Office: ${CONTACT.address}`,
      `- Phone: ${CONTACT.phone}`,
      `- Email: ${CONTACT.email}`,
      `- Hours: ${CONTACT.hours}`,
      `- Website: ${ORIGIN}/`,
    ])
    expect(intro).toContain(
      `IIIC is the short name of the ${SITE_NAME}, Ahmedabad, India. Its founder is ${FOUNDER.name}, ${FOUNDER.jobTitle}.`,
    )
    // No PIN until IIIC confirms one (I-33).
    expect(intro.join('\n')).not.toMatch(/\b\d{6}\b/)
  })

  it('lists each page once, by its title, address and description', () => {
    const { sections } = parts(buildLlmsTxt(SITE_PAGES, ORIGIN))
    const listed = Object.values(sections).flat()
    expect(listed).toHaveLength(SITE_PAGES.length)
    expect(listed).toContain(
      `- [${HOME_TITLE}](${ORIGIN}/): ${String(STARTER_PAGES.home?.description)}`,
    )
    expect(listed).toContain(
      `- [${String(STARTER_PAGES.framework?.title)}](${ORIGIN}/framework): ${String(STARTER_PAGES.framework?.description)}`,
    )
    expect(listed).toContain(`- [Find your path](${ORIGIN}/map): ${MAP_PAGE.description}`)
    expect(listed).toContain(
      `- [${JOURNAL_PAGE.title}](${ORIGIN}/journal): ${JOURNAL_PAGE.description}`,
    )
  })

  it('puts the Journal’s topics and articles under their own heading, each article with its date in India', () => {
    const { sections } = parts(buildLlmsTxt([...SITE_PAGES, ...JOURNAL_PAGES], ORIGIN))
    expect(Object.keys(sections)).toEqual(['Pages', 'Journal', 'Legal'])
    expect(sections.Journal).toEqual([
      `- [The Journal: Fake topic](${ORIGIN}/journal/topic/fake-topic): ${JOURNAL_PAGE.description}`,
      // 20:00 UTC on 21 November is the 22nd in Asia/Kolkata (CLAUDE.md #8).
      `- [A fake newer article?](${ORIGIN}/journal/fake-newer-article): A fake excerpt. Published 22 November 2026.`,
      `- [A fake older article?](${ORIGIN}/journal/fake-older-article): Published 30 October 2026.`,
    ])
    // The Journal itself stays among the pages.
    expect(sections.Pages).toContain(
      `- [${JOURNAL_PAGE.title}](${ORIGIN}/journal): ${JOURNAL_PAGE.description}`,
    )
  })

  it('has no Journal heading while no article is published', () => {
    expect(Object.keys(parts(buildLlmsTxt(SITE_PAGES, ORIGIN)).sections)).not.toContain('Journal')
  })

  it('puts the legal pages under their own heading, and every other page under Pages', () => {
    const { sections } = parts(buildLlmsTxt(SITE_PAGES, ORIGIN))
    const legal = [...LEGAL_PAGES, ACCESSIBILITY]
    expect(sections.Legal).toHaveLength(legal.length)
    for (const page of legal) {
      expect(sections.Legal?.join('\n'), page.slug).toContain(`](${ORIGIN}/${page.slug})`)
      expect(sections.Pages?.join('\n'), page.slug).not.toContain(`](${ORIGIN}/${page.slug})`)
    }
    expect(sections.Pages).toHaveLength(SITE_PAGES.length - legal.length)
  })

  it('has no Legal heading when there is no legal page to list', () => {
    const text = buildLlmsTxt([{ path: '/fake', title: 'Fake title' }], ORIGIN)
    expect(Object.keys(parts(text).sections)).toEqual(['Pages'])
    expect(text.endsWith(`- [Fake title](${ORIGIN}/fake)\n`)).toBe(true)
  })

  it('drops a description that is empty or holds a placeholder, and keeps the link', () => {
    for (const description of ['[[TODO: the description, I-41]]', 'Fake ]]', '', '  ', null]) {
      const text = buildLlmsTxt([{ path: '/fake', title: 'Fake title', description }], ORIGIN)
      expect(parts(text).sections.Pages, String(description)).toEqual([
        `- [Fake title](${ORIGIN}/fake)`,
      ])
    }
  })

  it('drops a title that is empty or holds a placeholder, and names the page by its address', () => {
    for (const title of ['[[TODO: the title, I-41]]', 'Fake [[TODO', '']) {
      const text = buildLlmsTxt(
        [{ path: '/Fake-Parent/Fake/', title, description: 'Fake text.' }],
        ORIGIN,
      )
      expect(parts(text).sections.Pages, title).toEqual([
        `- [/fake-parent/fake](${ORIGIN}/fake-parent/fake): Fake text.`,
      ])
      expect(text).not.toMatch(/\[\[|\]\]|TODO/)
    }
  })

  it('keeps each page on one line and each link whole, whatever an editor typed', () => {
    const text = buildLlmsTxt(
      [
        {
          path: '/fake',
          title: 'Fake [draft] title',
          description: 'Fake first line.\n\nFake second line.',
        },
      ],
      ORIGIN,
    )
    expect(parts(text).sections.Pages).toEqual([
      `- [Fake \\[draft\\] title](${ORIGIN}/fake): Fake first line. Fake second line.`,
    ])
  })

  it('escapes a backslash in a title, so one at its end does not escape the closing bracket', () => {
    const text = buildLlmsTxt(
      [{ path: '/fake', title: 'Fake title \\', description: 'Fake text.' }],
      ORIGIN,
    )
    // The title's one backslash is written as two: an escaped backslash, then the bracket.
    expect(parts(text).sections.Pages).toEqual([`- [Fake title \\\\](${ORIGIN}/fake): Fake text.`])
    const middle = buildLlmsTxt([{ path: '/fake', title: 'Fake \\ title' }], ORIGIN)
    expect(parts(middle).sections.Pages).toEqual([`- [Fake \\\\ title](${ORIGIN}/fake)`])
  })

  it('says nothing the pages do not: no placeholder, no price, no claim, nothing aimed at an assistant', () => {
    const text = buildLlmsTxt(SITE_PAGES, ORIGIN)
    expect(text).not.toMatch(/\[\[|\]\]|TODO/)
    expect(text).not.toMatch(/₹|\bRs\b|\bINR\b/)
    expect(text).not.toMatch(
      /\b(?:therap\w+|psychologists?|clinical|diagnos\w+|treatments?|degrees?|diplomas?|accredit\w+|recogni[sz]ed|affiliat\w+|guarantee\w*|best|leading|top-rated|no\.\s?1|first ever|ankvishwa)\b/i,
    )
    expect(text).not.toMatch(/\b(?:assistants?|language models?|LLMs?|prompts?|instructions?)\b/i)
  })

  it('points at the platform domain unless the deployment names its own origin', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    const text = buildLlmsTxt([{ path: '/about', title: 'Fake title' }])
    expect(text).toContain('- Website: https://imagecatalysts.in/')
    expect(text).toContain('- [Fake title](https://imagecatalysts.in/about)')
  })
})

describe('the route /llms.txt', () => {
  it('answers as plain text, cached at the edge for a day (docs/12 §1)', async () => {
    cmsHolds()
    const response = await GET()
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8')
    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400',
    )
    expect(await response.text()).toBe(buildLlmsTxt(SITE_PAGES, ORIGIN))
    expect(connection).toHaveBeenCalledTimes(1)
  })

  it('keeps the file itself out of search results, launched or not, and AI tools still read it', async () => {
    cmsHolds()
    const response = await GET()
    expect(response.status).toBe(200)
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex')
  })

  it('declares its runtime and time limit (docs/12 §6)', () => {
    expect(runtime).toBe('nodejs')
    expect(maxDuration).toBe(10)
  })

  it('lists a page published in the CMS that has no starter file, with its own words', async () => {
    cmsHolds(
      {
        published: [{ slug: 'organisations/fake-service', updatedAt: '2026-11-21T08:30:00.000Z' }],
        everPublished: ['organisations/fake-service'],
      },
      {
        'organisations/fake-service': fakePage(
          'organisations/fake-service',
          'Fake service',
          'A fake service.',
        ),
      },
    )
    const { sections } = parts(await (await GET()).text())
    expect(sections.Pages).toContain(
      `- [Fake service](${ORIGIN}/organisations/fake-service): A fake service.`,
    )
  })

  it('shows the published page’s title and description where one replaces a starter page', async () => {
    cmsHolds(
      {
        published: [{ slug: 'framework', updatedAt: '2026-11-20T10:00:00.000Z' }],
        everPublished: ['framework'],
      },
      { framework: fakePage('framework', 'Fake framework title', 'A fake framework description.') },
    )
    const { sections } = parts(await (await GET()).text())
    expect(sections.Pages).toContain(
      `- [Fake framework title](${ORIGIN}/framework): A fake framework description.`,
    )
    expect(sections.Pages?.join('\n')).not.toContain(String(STARTER_PAGES.framework?.title))
  })

  it('keeps the home page under the site’s fixed title, whatever the page is called', async () => {
    cmsHolds(
      {
        published: [{ slug: 'home', updatedAt: '2026-11-20T10:00:00.000Z' }],
        everPublished: ['home'],
      },
      { home: fakePage('home', 'Fake home name', 'A fake home description.') },
    )
    const { sections } = parts(await (await GET()).text())
    expect(sections.Pages?.[0]).toBe(`- [${HOME_TITLE}](${ORIGIN}/): A fake home description.`)
  })

  it('leaves out a page that is a 404 now, and every route that is never indexed (D-57, D-67)', async () => {
    cmsHolds(
      {
        published: [
          { slug: 'institute/verify/fake-token', updatedAt: '2026-11-21T08:30:00.000Z' },
          { slug: 'book/session', updatedAt: '2026-11-21T08:30:00.000Z' },
        ],
        // The learn page was published once and is not now.
        everPublished: ['learn', 'institute/verify/fake-token', 'book/session'],
      },
      {
        'institute/verify/fake-token': fakePage('institute/verify/fake-token', 'Fake certificate'),
        'book/session': fakePage('book/session', 'Fake booking'),
      },
    )
    const text = await (await GET()).text()
    expect(text).not.toContain(`${ORIGIN}/learn`)
    expect(text).not.toContain('/institute/verify')
    expect(text).not.toContain('/book/')
    expect(text).toContain(`](${ORIGIN}/institute)`)
    // Nothing asked the CMS for a page that is not listed.
    const asked = vi.mocked(getPage).mock.calls.map(([slug]) => slug)
    expect(asked).not.toContain('learn')
    expect(asked).not.toContain('book/session')
  })

  it('leaves out a page the CMS no longer finds by the time it is read', async () => {
    cmsHolds({
      published: [{ slug: 'fake-gone', updatedAt: '2026-11-21T08:30:00.000Z' }],
      everPublished: ['fake-gone'],
    })
    const text = await (await GET()).text()
    expect(text).not.toContain('fake-gone')
    expect(text).toContain(`](${ORIGIN}/about)`)
  })

  it('lists the Journal’s topics and published articles in their own words, with their dates', async () => {
    const held = cmsHolds({
      posts: [
        {
          slug: 'fake-article',
          title: 'A fake article whose title is far too long for a browser tab to hold?',
          searchTitle: 'A fake search title',
          excerpt: 'A fake excerpt.',
          publishedAt: '2026-11-21T08:30:00.000Z',
          updatedAt: '2026-11-22T09:00:00.000Z',
        },
      ],
      topics: [{ slug: 'fake-topic', name: 'Fake topic', description: 'A fake topic.' }],
    })
    const text = await (await GET()).text()
    expect(parts(text).sections.Journal).toEqual([
      `- [The Journal: Fake topic](${ORIGIN}/journal/topic/fake-topic): A fake topic.`,
      `- [A fake search title](${ORIGIN}/journal/fake-article): A fake excerpt. Published 21 November 2026.`,
    ])
    // Nothing asked the CMS for a page: the Journal's entries carry their own words.
    expect(vi.mocked(getPage).mock.calls.map(([slug]) => slug)).not.toContain('journal')
    const linked = Object.values(parts(text).sections)
      .flat()
      .map((line) => line.match(/\]\(([^)]+)\)/)?.[1])
    expect([...linked].sort()).toEqual(
      sitemapEntries(held, ORIGIN)
        .map(({ url }) => url)
        .sort(),
    )
  })

  it('names the same pages as the sitemap, whatever the CMS holds', async () => {
    const held = cmsHolds(
      {
        published: [
          { slug: 'about', updatedAt: '2026-11-20T10:00:00.000Z' },
          { slug: 'fake-page', updatedAt: '2026-11-21T08:30:00.000Z' },
          { slug: 'search', updatedAt: '2026-11-21T08:30:00.000Z' },
        ],
        everPublished: ['about', 'fake-page', 'search', 'counselling', 'terms'],
      },
      {
        about: fakePage('about', 'Fake about', 'A fake description.'),
        'fake-page': fakePage('fake-page', 'Fake page'),
        search: fakePage('search', 'Fake search'),
      },
    )
    const text = await (await GET()).text()
    const linked = Object.values(parts(text).sections)
      .flat()
      .map((line) => line.match(/\]\(([^)]+)\)/)?.[1])
    expect([...linked].sort()).toEqual(
      sitemapEntries(held, ORIGIN)
        .map(({ url }) => url)
        .sort(),
    )
    expect(linked).toContain(`${ORIGIN}/fake-page`)
    expect(linked).not.toContain(`${ORIGIN}/counselling`)
    expect(linked).not.toContain(`${ORIGIN}/search`)
  })
})
