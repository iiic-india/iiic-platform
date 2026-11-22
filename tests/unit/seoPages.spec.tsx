// @vitest-environment node
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

import type { Metadata } from 'next'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import FoundersPage, {
  generateMetadata as foundersMetadata,
} from '@/app/(platform)/(consultancy)/founders/page'
import ConsultancyNotFound from '@/app/(platform)/(consultancy)/not-found'
import OrganisationsSubPage, {
  generateMetadata as organisationsSubMetadata,
} from '@/app/(platform)/(consultancy)/organisations/[...slug]/page'
import OrganisationsPage, {
  generateMetadata as organisationsMetadata,
} from '@/app/(platform)/(consultancy)/organisations/page'
import CounsellingSubPage, {
  generateMetadata as counsellingSubMetadata,
} from '@/app/(platform)/(counselling)/counselling/[...slug]/page'
import CounsellingPage, {
  generateMetadata as counsellingMetadata,
} from '@/app/(platform)/(counselling)/counselling/page'
import CounsellingNotFound from '@/app/(platform)/(counselling)/not-found'
import CmsPage, { generateMetadata as cmsMetadata } from '@/app/(platform)/(default)/[...slug]/page'
import FindYourPathPage, { metadata as mapMetadata } from '@/app/(platform)/(default)/map/page'
import NotFound from '@/app/(platform)/(default)/not-found'
import HomePage, { generateMetadata as homeMetadata } from '@/app/(platform)/(default)/page'
import InstituteSubPage, {
  generateMetadata as instituteSubMetadata,
} from '@/app/(platform)/(education)/institute/[...slug]/page'
import InstitutePage, {
  generateMetadata as instituteMetadata,
} from '@/app/(platform)/(education)/institute/page'
import LearnPage, {
  generateMetadata as learnMetadata,
} from '@/app/(platform)/(education)/learn/page'
import EducationNotFound from '@/app/(platform)/(education)/not-found'
import { metadata as layoutMetadata } from '@/app/(platform)/layout'
import { metadataOf, PageAt, PageJsonLd } from '@/components/blocks/PageAt'
import { RenderBlocks } from '@/components/blocks/PageBlocks'
import { JsonLd } from '@/components/seo/JsonLd'
import { STARTER_PAGES, starterAt } from '@/content/starter'
import { getPage } from '@/lib/content/pages'
import type { PageContent } from '@/lib/content/types'
import { logMissingPage } from '@/lib/redirects/log'
import { MAP_PAGE } from '@/lib/seo/appPages'
import { pageGraph } from '@/lib/seo/schema'
import { HOME_TITLE, SITE_DESCRIPTION, SITE_NAME } from '@/lib/seo/site'

// Every public page gets its canonical URL, its share tags and its structured data the same
// way (src/components/blocks/PageAt.tsx, src/lib/seo/metadata.ts), and the 404 gets none of
// them. The CMS is faked: getPage answers with the starter pages and the fake pages below.
// Find your path builds its metadata when its module loads, so the fake origin is set before
// any import runs.
const request = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://fake.example'
  return { path: '' }
})
vi.mock('@/lib/content/pages', () => ({ getPage: vi.fn() }))
// The legal information comes from the settings (tests/unit/settingsLegal.spec.tsx); the routes'
// metadata and structure do not depend on it.
vi.mock('@/lib/settings/read', () => ({ legalInformationFor: async () => undefined }))
// No question is published: the questions sections draw nothing.
vi.mock('@/lib/content/faqs', () => ({ getFaqs: vi.fn(async () => []) }))
vi.mock('@/lib/proof/read', () => ({
  getPageVoices: vi.fn(async () => ({ first: null, bySection: {} })),
}))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-pathname': request.path }),
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('fake not found')
  },
}))
// No redirect leads from any address here, and the 404 log, which the lookup writes as it
// answers with the 404, writes nothing (src/lib/redirects/lookup.ts). The home page answers
// with the 404 itself, so it calls the log itself: only whether it does is checked here.
vi.mock('@/lib/redirects/lookup', () => ({
  redirectOrNotFound: async () => {
    throw new Error('fake not found')
  },
}))
vi.mock('@/lib/redirects/log', () => ({ logMissingPage: vi.fn(async () => undefined) }))
// The layout's own needs, none of them tested here: the deployment's origin, the faces
// next/font loads at build time, and the request the layout waits for.
vi.mock('@/lib/env', () => ({ env: () => ({ siteUrl: 'https://fake.example' }) }))
vi.mock('@/app/fonts', () => ({
  fraunces: { variable: 'fake-fraunces' },
  manrope: { variable: 'fake-manrope' },
}))
vi.mock('next/server', () => ({ connection: async () => undefined }))

const ORIGIN = 'https://fake.example'
const APP = join(process.cwd(), 'src/app/(platform)')

/** A page under each section, as a service's page will be. Obviously fake. */
const fakePage = (slug: string): PageContent => ({
  title: `Fake page at ${slug}`,
  slug,
  description: 'A fake description of a fake page.',
  layout: [{ blockType: 'hero', heading: 'Fake heading', copyStatus: 'approved' }],
})
const FAKE_PAGES = new Map(
  ['organisations', 'counselling', 'institute'].map((section) => [
    `${section}/fake-page`,
    fakePage(`${section}/fake-page`),
  ]),
)

const params = (...slug: string[]) => ({ params: Promise.resolve({ slug }) })
const canonical = (metadata: Metadata) => metadata.alternates?.canonical

type Children = { children: ReactElement<Record<string, unknown>>[] }

/** A page drawn by its route itself: its structured data first, then its blocks. */
function expectDataThenBlocks(drawn: ReactElement, slug: string, page: PageContent) {
  const [data, blocks] = (drawn as ReactElement<Children>).props.children
  expect(data?.type).toBe(PageJsonLd)
  // No question is published in this file's fake CMS, so a page shows none (D-62).
  expect(data?.props).toEqual({ slug, page, faqs: [] })
  expect(blocks?.type).toBe(RenderBlocks)
  expect(blocks?.props.layout).toBe(page.layout)
  expect(blocks?.props.faqs).toEqual([])
}

/** The pages the door routes draw through PageAt, each at its own slug. */
const DOORS = [
  {
    file: '(consultancy)/organisations/page.tsx',
    slug: 'organisations',
    Page: OrganisationsPage,
    metadata: organisationsMetadata,
  },
  {
    file: '(consultancy)/founders/page.tsx',
    slug: 'founders',
    Page: FoundersPage,
    metadata: foundersMetadata,
  },
  {
    file: '(counselling)/counselling/page.tsx',
    slug: 'counselling',
    Page: CounsellingPage,
    metadata: counsellingMetadata,
  },
  { file: '(education)/learn/page.tsx', slug: 'learn', Page: LearnPage, metadata: learnMetadata },
  {
    file: '(education)/institute/page.tsx',
    slug: 'institute',
    Page: InstitutePage,
    metadata: instituteMetadata,
  },
]

/** The routes for the pages under a section. */
const SECTIONS = [
  {
    file: '(consultancy)/organisations/[...slug]/page.tsx',
    section: 'organisations',
    Page: OrganisationsSubPage,
    metadata: organisationsSubMetadata,
  },
  {
    file: '(counselling)/counselling/[...slug]/page.tsx',
    section: 'counselling',
    Page: CounsellingSubPage,
    metadata: counsellingSubMetadata,
  },
  {
    file: '(education)/institute/[...slug]/page.tsx',
    section: 'institute',
    Page: InstituteSubPage,
    metadata: instituteSubMetadata,
  },
]

/** The 404 of each register: one page, exported again from each route group. */
const NOT_FOUND = [
  { file: '(default)/not-found.tsx', Page: NotFound },
  { file: '(consultancy)/not-found.tsx', Page: ConsultancyNotFound },
  { file: '(counselling)/not-found.tsx', Page: CounsellingNotFound },
  { file: '(education)/not-found.tsx', Page: EducationNotFound },
]

/** The pages that draw themselves, tested one by one below; /search in tests/unit/searchPage.spec.tsx. */
const OWN = [
  '(default)/page.tsx',
  '(default)/[...slug]/page.tsx',
  '(default)/map/page.tsx',
  '(default)/search/page.tsx',
]

/** Proof, which draws itself too: tests/unit/proofPage.spec.tsx. */
const PROOF = ['(default)/proof/page.tsx']

/** The Journal's pages, which draw themselves too: tests/unit/journalPages.spec.tsx. */
const JOURNAL = [
  '(education)/journal/page.tsx',
  '(education)/journal/page/[number]/page.tsx',
  '(education)/journal/[slug]/page.tsx',
  '(education)/journal/topic/[topic]/page.tsx',
  '(education)/journal/topic/[topic]/page/[number]/page.tsx',
]

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', ORIGIN)
  request.path = ''
  vi.mocked(getPage).mockReset()
  vi.mocked(getPage).mockImplementation(
    async (slug: string) => FAKE_PAGES.get(slug) ?? starterAt(slug) ?? null,
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('the pages under src/app/(platform)', () => {
  it('are all tested here, so that a new page is held to the same rules', () => {
    const found = readdirSync(APP, { recursive: true, encoding: 'utf8' })
      .map((file) => file.replaceAll('\\', '/'))
      .filter((file) => /(?:^|\/)(?:page|not-found)\.tsx$/.test(file))
    expect(found.sort()).toEqual(
      [...OWN, ...PROOF, ...JOURNAL, ...DOORS, ...SECTIONS, ...NOT_FOUND]
        .map((entry) => (typeof entry === 'string' ? entry : entry.file))
        .sort(),
    )
  })
})

describe('the home page', () => {
  it('has the site’s fixed title, its own description and the origin as its canonical URL', async () => {
    const home = STARTER_PAGES.home!
    const metadata = await homeMetadata()
    expect(metadata).toEqual(metadataOf('home', home))
    expect(metadata.title).toEqual({ absolute: HOME_TITLE })
    expect(canonical(metadata)).toBe(`${ORIGIN}/`)
  })

  it('draws its structured data, then its blocks, and writes nothing to the 404 log', async () => {
    vi.mocked(logMissingPage).mockClear()
    expectDataThenBlocks(await HomePage(), 'home', STARTER_PAGES.home!)
    expect(logMissingPage).not.toHaveBeenCalled()
  })

  it('is the 404, with no canonical URL, while its published page is unpublished (D-57)', async () => {
    vi.mocked(getPage).mockResolvedValue(null)
    vi.mocked(logMissingPage).mockClear()
    expect(await homeMetadata()).toEqual({})
    await expect(HomePage()).rejects.toThrow('fake not found')
    // It answers with the 404 itself, so it writes the address to the log (docs/11 §5.1, item 9).
    expect(logMissingPage).toHaveBeenCalledTimes(1)
  })
})

describe('a page the catch-all route draws', () => {
  it('has its own canonical URL and share tags', async () => {
    const about = STARTER_PAGES.about!
    const metadata = await cmsMetadata(params('about'))
    expect(metadata).toEqual(metadataOf('about', about))
    expect(canonical(metadata)).toBe(`${ORIGIN}/about`)
    expect(metadata.openGraph).toMatchObject({ url: `${ORIGIN}/about`, siteName: SITE_NAME })
  })

  it('draws its structured data, then its blocks', async () => {
    expectDataThenBlocks(await CmsPage(params('about')), 'about', STARTER_PAGES.about!)
  })

  it('has no canonical URL where there is no page, or where "home" is asked for by name', async () => {
    for (const slug of [['no-such-page'], ['home'], ['About'], ['no', 'such', 'page']]) {
      expect(await cmsMetadata(params(...slug)), slug.join('/')).toEqual({})
      await expect(CmsPage(params(...slug)), slug.join('/')).rejects.toThrow('fake not found')
    }
  })
})

describe('Find your path', () => {
  it('has its canonical URL and share tags from the app’s own title and description', () => {
    expect(canonical(mapMetadata)).toBe(`${ORIGIN}/map`)
    expect(mapMetadata.title).toBe('Find your path')
    expect(mapMetadata.description).toBe(MAP_PAGE.description)
    expect(mapMetadata.openGraph).toMatchObject({ url: `${ORIGIN}/map`, siteName: SITE_NAME })
  })

  it('draws its structured data inside the page', () => {
    const drawn = FindYourPathPage() as ReactElement<Children>
    const data = drawn.props.children.filter((child) => child.type === JsonLd)
    expect(data).toHaveLength(1)
    expect(data[0]?.props.graph).toEqual(pageGraph(MAP_PAGE))
  })
})

describe.each(DOORS)('the door page /$slug', ({ slug, Page, metadata }) => {
  it('has its own canonical URL and share tags', async () => {
    const page = STARTER_PAGES[slug]!
    const built = await metadata()
    expect(built).toEqual(metadataOf(slug, page))
    expect(canonical(built)).toBe(`${ORIGIN}/${slug}`)
    expect(built.title).toBe(page.title)
    expect(built.openGraph).toMatchObject({ url: `${ORIGIN}/${slug}`, siteName: SITE_NAME })
  })

  it('is drawn by PageAt, which carries its structured data', async () => {
    const drawn = Page() as ReactElement
    expect(drawn.type).toBe(PageAt)
    expect(drawn.props).toEqual({ slug })
    expectDataThenBlocks(await PageAt({ slug }), slug, STARTER_PAGES[slug]!)
  })
})

describe.each(SECTIONS)('the route for pages under /$section/', ({ section, Page, metadata }) => {
  const slug = `${section}/fake-page`

  it('gives a page there its own canonical URL and share tags', async () => {
    const built = await metadata(params('fake-page'))
    expect(built).toEqual(metadataOf(slug, FAKE_PAGES.get(slug)!))
    expect(canonical(built)).toBe(`${ORIGIN}/${slug}`)
  })

  it('draws a page there with PageAt, which carries its structured data', async () => {
    const drawn = (await Page(params('fake-page'))) as ReactElement
    expect(drawn.type).toBe(PageAt)
    expect(drawn.props).toEqual({ slug })
    expectDataThenBlocks(await PageAt({ slug }), slug, FAKE_PAGES.get(slug)!)
  })

  it('gives an address with no page there no canonical URL, and the 404', async () => {
    expect(await metadata(params('no-such-page'))).toEqual({})
    const drawn = (await Page(params('no-such-page'))) as ReactElement<{ slug: string }>
    await expect(PageAt(drawn.props)).rejects.toThrow('fake not found')
  })
})

describe.each(NOT_FOUND)('the 404 at $file', ({ Page }) => {
  it('is the site’s one 404 page', () => {
    expect(Page).toBe(NotFound)
  })

  it.each(['/no-such-page', '/counselling/no-such-page', '/book/session'])(
    'carries no structured data and no canonical URL on %s',
    async (path) => {
      request.path = path
      const html = renderToStaticMarkup(await Page())
      expect(html).toContain('Page not found')
      expect(html).not.toContain('application/ld+json')
      expect(html).not.toMatch(/<script\b/)
      expect(html).not.toMatch(/rel="canonical"/)
    },
  )
})

describe('the platform layout', () => {
  it('gives a page without metadata of its own, such as the 404, the site’s name and no canonical URL', () => {
    expect(layoutMetadata.alternates).toBeUndefined()
    expect(layoutMetadata.title).toEqual({ default: HOME_TITLE, template: '%s · IIIC' })
    expect(layoutMetadata.description).toBe(SITE_DESCRIPTION)
    expect(layoutMetadata.openGraph).toEqual({
      type: 'website',
      siteName: SITE_NAME,
      locale: 'en_IN',
      images: [{ url: '/og/home', width: 1200, height: 630, alt: SITE_NAME }],
    })
    expect(layoutMetadata.twitter).toEqual({ card: 'summary_large_image' })
    // Relative addresses in the tags are read against the deployment's own origin.
    expect(String(layoutMetadata.metadataBase)).toBe('https://fake.example/')
    expect(layoutMetadata.keywords).toBeUndefined()
    expect(layoutMetadata.robots).toBeUndefined()
  })
})
