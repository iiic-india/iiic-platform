// @vitest-environment node
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { metadataAt, metadataOf, PageAt, PageJsonLd } from '@/components/blocks/PageAt'
import { RenderBlocks } from '@/components/blocks/PageBlocks'
import { JsonLd } from '@/components/seo/JsonLd'
import { STARTER_PAGES, starterAt } from '@/content/starter'
import { getPage } from '@/lib/content/pages'
import type { PageContent } from '@/lib/content/types'
import { buildMetadata } from '@/lib/seo/metadata'
import type { JsonLdGraph, JsonLdNode } from '@/lib/seo/schema'
import { HOME_TITLE } from '@/lib/seo/site'

// How a route gets a page's metadata and structured data (src/components/blocks/PageAt.tsx).
// The CMS is faked: getPage answers with the starter pages and the fake pages below.
vi.mock('@/lib/content/pages', () => ({ getPage: vi.fn() }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('fake not found')
  },
}))

const ORIGIN = 'https://fake.example'

/** A page under /organisations/, two levels down. Obviously fake. */
const DEEP: PageContent = {
  title: 'Fake deeper page',
  slug: 'organisations/fake/deeper-page',
  description: 'A fake description of a fake page.',
  layout: [{ blockType: 'hero', heading: 'Fake heading', copyStatus: 'approved' }],
}

const FAKE_PAGES: Readonly<Record<string, PageContent>> = { [DEEP.slug]: DEEP }

const asked = () => vi.mocked(getPage).mock.calls.map(([slug]) => slug)

/** The graph a rendered PageJsonLd hands to the script element. */
async function graphOf(slug: string, page: PageContent): Promise<JsonLdNode[]> {
  const element = (await PageJsonLd({ slug, page })) as ReactElement<{ graph: JsonLdGraph }>
  expect(element.type).toBe(JsonLd)
  return element.props.graph['@graph']
}

const ofType = (graph: JsonLdNode[], type: string) => graph.filter((node) => node['@type'] === type)

type Step = { position: number; name: string; item: string }
const trail = (graph: JsonLdNode[]) =>
  (ofType(graph, 'BreadcrumbList')[0]?.itemListElement ?? []) as unknown as Step[]

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', ORIGIN)
  vi.mocked(getPage).mockReset()
  vi.mocked(getPage).mockImplementation(
    async (slug: string) => FAKE_PAGES[slug] ?? starterAt(slug) ?? null,
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('metadataAt', () => {
  it('is empty for an address with no page, so the 404 carries no canonical URL', async () => {
    expect(await metadataAt('no-such-page')).toEqual({})
    expect(await metadataAt('organisations/no-such-page')).toEqual({})
  })

  it('is the page’s own metadata: its title, description, canonical URL and share tags', async () => {
    const framework = STARTER_PAGES.framework!
    expect(await metadataAt('framework')).toEqual(
      buildMetadata({
        path: '/framework',
        title: framework.title,
        description: framework.description,
      }),
    )
    expect((await metadataAt('framework')).alternates).toEqual({
      canonical: `${ORIGIN}/framework`,
    })
    expect((await metadataAt(DEEP.slug)).alternates).toEqual({
      canonical: `${ORIGIN}/organisations/fake/deeper-page`,
    })
  })
})

describe('metadataOf', () => {
  it('gives the home page the site’s fixed title, whatever the page is called in the admin', () => {
    const home = metadataOf('home', { title: 'Fake home name', description: 'Fake text.' })
    expect(home.title).toEqual({ absolute: HOME_TITLE })
    expect(home.alternates).toEqual({ canonical: `${ORIGIN}/` })
    expect(home.description).toBe('Fake text.')
  })

  it('gives any other page its own title at its own address', () => {
    const page = metadataOf('organisations/team-map', { title: 'Fake title', description: null })
    expect(page.title).toBe('Fake title')
    expect(page.alternates).toEqual({ canonical: `${ORIGIN}/organisations/team-map` })
  })
})

describe('PageAt', () => {
  it('is the 404 where there is no page', async () => {
    await expect(PageAt({ slug: 'no-such-page' })).rejects.toThrow('fake not found')
  })

  it('draws the page’s structured data first, then its blocks', async () => {
    const privacy = STARTER_PAGES.privacy!
    const drawn = (await PageAt({ slug: 'privacy' })) as ReactElement<{ children: ReactElement[] }>
    const [data, blocks] = drawn.props.children
    expect(drawn.props.children).toHaveLength(2)
    expect(data?.type).toBe(PageJsonLd)
    expect(data?.props).toEqual({ slug: 'privacy', page: privacy })
    expect(blocks?.type).toBe(RenderBlocks)
    expect(blocks?.props).toEqual({ layout: privacy.layout, legalReview: 'draft' })
  })
})

describe('PageJsonLd', () => {
  it('carries the home page under the site’s fixed title, with the business and no breadcrumb', async () => {
    const graph = await graphOf('home', STARTER_PAGES.home!)
    expect(ofType(graph, 'WebPage')[0]).toMatchObject({ url: `${ORIGIN}/`, name: HOME_TITLE })
    expect(ofType(graph, 'LocalBusiness')).toHaveLength(1)
    expect(ofType(graph, 'WebSite')).toHaveLength(1)
    expect(ofType(graph, 'BreadcrumbList')).toHaveLength(0)
    // The home page has no page above it to ask for.
    expect(asked()).toEqual([])
  })

  it('carries a top-level page with the way down from the home page', async () => {
    const about = STARTER_PAGES.about!
    const graph = await graphOf('about', about)
    expect(ofType(graph, 'AboutPage')[0]).toMatchObject({
      url: `${ORIGIN}/about`,
      name: about.title,
      description: about.description,
    })
    expect(trail(graph).map((step) => [step.position, step.name, step.item])).toEqual([
      [1, 'Home', `${ORIGIN}/`],
      [2, about.title, `${ORIGIN}/about`],
    ])
    expect(asked()).toEqual([])
  })

  it('names the pages above a nested page that exist, and skips those that do not', async () => {
    const graph = await graphOf(DEEP.slug, DEEP)
    // /organisations is a page; /organisations/fake is not.
    expect(trail(graph).map((step) => [step.position, step.name, step.item])).toEqual([
      [1, 'Home', `${ORIGIN}/`],
      [2, STARTER_PAGES.organisations!.title, `${ORIGIN}/organisations`],
      [3, 'Fake deeper page', `${ORIGIN}/organisations/fake/deeper-page`],
    ])
    // Only the pages above are asked for: the route already holds the page itself.
    expect(asked()).toEqual(['organisations', 'organisations/fake'])
  })

  it('names every page above it when each exists', async () => {
    vi.mocked(getPage).mockImplementation(async (slug: string) =>
      slug === 'organisations/fake'
        ? { ...DEEP, slug, title: 'Fake middle page' }
        : (starterAt(slug) ?? null),
    )
    const graph = await graphOf(DEEP.slug, DEEP)
    expect(trail(graph).map((step) => step.name)).toEqual([
      'Home',
      STARTER_PAGES.organisations!.title,
      'Fake middle page',
      'Fake deeper page',
    ])
    expect(trail(graph).map((step) => step.position)).toEqual([1, 2, 3, 4])
  })

  it('names the home page once for a page under home/, whose ancestor is the home page', async () => {
    const underHome: PageContent = { ...DEEP, slug: 'home/fake-page', title: 'Fake page' }
    const graph = await graphOf(underHome.slug, underHome)
    expect(trail(graph).map((step) => [step.position, step.name, step.item])).toEqual([
      [1, 'Home', `${ORIGIN}/`],
      [2, 'Fake page', `${ORIGIN}/home/fake-page`],
    ])
    expect(asked()).toEqual(['home'])
  })

  it('carries only the page and its breadcrumb for a nested page', async () => {
    const graph = await graphOf(DEEP.slug, DEEP)
    expect(graph.map((node) => node['@type'])).toEqual(['WebPage', 'BreadcrumbList'])
    expect(graph[0]).toMatchObject({
      url: `${ORIGIN}/organisations/fake/deeper-page`,
      name: 'Fake deeper page',
      description: 'A fake description of a fake page.',
    })
  })
})
