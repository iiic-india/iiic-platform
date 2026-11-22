// @vitest-environment node
import { createHash } from 'node:crypto'

import type { Metadata } from 'next'
import { resolveAlternates, resolveRobots } from 'next/dist/lib/metadata/resolvers/resolve-basics'
import { resolveOpenGraph } from 'next/dist/lib/metadata/resolvers/resolve-opengraph'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { metadataOf } from '@/components/blocks/PageAt'
import { STARTER_PAGES } from '@/content/starter'
import { pagePath } from '@/lib/content/slug'
import { MAP_PAGE } from '@/lib/seo/appPages'
import { buildMetadata, SHARE_IMAGE_SIZE, shareImagePath, shareImageUrl } from '@/lib/seo/metadata'
import {
  canonicalUrl,
  hasPlaceholder,
  HOME_TITLE,
  SITE_DESCRIPTION,
  SITE_NAME,
} from '@/lib/seo/site'

// A page's metadata (src/lib/seo/metadata.ts; docs/12 §3). The CMS is not asked here: the
// starter pages are read as the routes hand them over, and no redirect is read either.
vi.mock('@/lib/content/pages', () => ({ getPage: vi.fn() }))
vi.mock('@/lib/redirects/lookup', () => ({ redirectOrNotFound: vi.fn() }))
// The legal information comes from the settings (tests/unit/settingsLegal.spec.tsx).
vi.mock('@/lib/settings/read', () => ({ legalInformationFor: async () => undefined }))
vi.mock('@/lib/content/faqs', () => ({ getFaqs: vi.fn(async () => []) }))

/** A fake origin, so that nothing here depends on the machine's own site URL. */
const ORIGIN = 'https://fake.example'

type Image = { url: string; width: number; height: number; alt: string }
type Built = {
  title: string | { absolute: string }
  description: string
  alternates: { canonical: string }
  openGraph: {
    type: string
    url: string
    siteName: string
    locale: string
    title: string
    description: string
    images: Image[]
  }
  twitter: { card: string; title: string; description: string; images: Image[]; site?: string }
  robots: { index: boolean; follow: boolean } | { 'max-image-preview': string }
  keywords?: unknown
}

/** The metadata as plain data, in the shape buildMetadata gives it. */
const plain = (metadata: Metadata) => JSON.parse(JSON.stringify(metadata)) as Built

/** The version a share image's address carries: the first 8 hex digits of the title's SHA-256. */
const version = (title: string) => createHash('sha256').update(title).digest('hex').slice(0, 8)

/** What a page that may be indexed says to robots: large image previews allowed. */
const INDEXABLE = { 'max-image-preview': 'large' }

/** Every string in a value, whatever holds it. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(strings)
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings)
  return []
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', ORIGIN)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('shareImagePath', () => {
  it('names the image by the page’s slug, "home" for the first page', () => {
    expect(shareImagePath('/')).toBe('/og/home')
    expect(shareImagePath('/about')).toBe('/og/about')
    expect(shareImagePath('/About/?x=1')).toBe('/og/about')
    expect(shareImagePath('/organisations/team-map')).toBe('/og/organisations/team-map')
    expect(SHARE_IMAGE_SIZE).toEqual({ width: 1200, height: 630 })
  })
})

describe('shareImageUrl', () => {
  it('versions every page’s image by the first 8 hex digits of its title’s SHA-256', () => {
    expect(version('Fake title')).toBe('5702aa47')
    expect(shareImageUrl('/fake-page', 'Fake title')).toBe('/og/fake-page?v=5702aa47')
    expect(shareImageUrl('/Organisations/Team-Map/', 'Fake title')).toBe(
      '/og/organisations/team-map?v=5702aa47',
    )
  })

  it('gives a page a new address when its title changes, and the same one while it does not', () => {
    const before = shareImageUrl('/fake-page', 'Fake title')
    expect(shareImageUrl('/fake-page', 'Fake title')).toBe(before)
    expect(shareImageUrl('/fake-page', 'Fake new title')).toBe('/og/fake-page?v=496306a4')
    expect(shareImageUrl('/fake-page', 'Fake new title')).not.toBe(before)
  })

  it('leaves the home page’s address as it is: its image always draws the name', () => {
    expect(shareImageUrl('/', 'Fake title')).toBe('/og/home')
    expect(shareImageUrl('/', 'Fake new title')).toBe('/og/home')
  })
})

describe('buildMetadata', () => {
  it('gives the home page the site’s fixed title, which the layout does not extend', () => {
    const home = plain(
      buildMetadata({ path: '/', title: 'Fake home', description: 'Fake home text.' }),
    )
    expect(home.title).toEqual({ absolute: HOME_TITLE })
    expect(home.description).toBe('Fake home text.')
    expect(home.alternates.canonical).toBe(`${ORIGIN}/`)
    expect(home.openGraph).toEqual({
      type: 'website',
      url: `${ORIGIN}/`,
      siteName: SITE_NAME,
      locale: 'en_IN',
      title: HOME_TITLE,
      description: 'Fake home text.',
      images: [{ url: '/og/home', width: 1200, height: 630, alt: SITE_NAME }],
    })
    expect(home.twitter).toEqual({
      card: 'summary_large_image',
      title: HOME_TITLE,
      description: 'Fake home text.',
      images: [{ url: '/og/home', width: 1200, height: 630, alt: SITE_NAME }],
    })
  })

  it('gives an ordinary page its own title, description, canonical URL and share tags', () => {
    const page = plain(
      buildMetadata({
        path: '/Fake-Page/?utm_source=x#top',
        title: 'Fake title',
        description: 'Fake text.',
      }),
    )
    // The layout's template adds " · IIIC" to the tab; the share tags carry the whole title.
    expect(page.title).toBe('Fake title')
    expect(page.description).toBe('Fake text.')
    expect(page.alternates.canonical).toBe(`${ORIGIN}/fake-page`)
    expect(page.openGraph).toEqual({
      type: 'website',
      url: `${ORIGIN}/fake-page`,
      siteName: SITE_NAME,
      locale: 'en_IN',
      title: 'Fake title · IIIC',
      description: 'Fake text.',
      images: [
        {
          url: `/og/fake-page?v=${version('Fake title')}`,
          width: 1200,
          height: 630,
          alt: `Fake title, ${SITE_NAME}`,
        },
      ],
    })
    expect(page.twitter.title).toBe('Fake title · IIIC')
    expect(page.twitter.images).toEqual(page.openGraph.images)
    // Large image previews allowed (Google Discover shows large images only with that), no
    // keywords tag (plan F), and no X handle (D-33).
    expect(page.robots).toEqual(INDEXABLE)
    expect(page.keywords).toBeUndefined()
    expect(page.twitter.site).toBeUndefined()
  })

  it('points at the platform domain whatever host answers, when no site URL is set', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    const page = plain(buildMetadata({ path: '/about', title: 'Fake title' }))
    expect(page.alternates.canonical).toBe('https://imagecatalysts.in/about')
    expect(page.openGraph.url).toBe('https://imagecatalysts.in/about')
  })

  it('never shows a placeholder: the title falls back to the name, the description to IIIC’s sentence', () => {
    for (const title of ['[[TODO: the title, I-41]]', 'Fake [[TODO', '', '   ']) {
      const page = plain(buildMetadata({ path: '/fake', title, description: 'Fake text.' }))
      expect(page.title, title).toBe(SITE_NAME)
      expect(page.openGraph.title, title).toBe(`${SITE_NAME} · IIIC`)
      // The name once, not "name, name".
      expect(page.openGraph.images[0]?.alt, title).toBe(SITE_NAME)
      // The image draws the name, and its address carries the name's version.
      expect(page.openGraph.images[0]?.url, title).toBe(`/og/fake?v=${version(SITE_NAME)}`)
    }
    for (const description of [
      '[[TODO: the description, I-41]]',
      'Fake ]]',
      '',
      '  \n ',
      null,
      undefined,
    ]) {
      const page = plain(buildMetadata({ path: '/fake', title: 'Fake title', description }))
      expect(page.description, String(description)).toBe(SITE_DESCRIPTION)
      expect(page.openGraph.description, String(description)).toBe(SITE_DESCRIPTION)
      expect(page.twitter.description, String(description)).toBe(SITE_DESCRIPTION)
    }
  })

  it('does not repeat IIIC’s name in the image’s description when the title holds it', () => {
    const about = plain(buildMetadata({ path: '/about', title: `${SITE_NAME}, Ahmedabad` }))
    expect(about.openGraph.images[0]?.alt).toBe(`${SITE_NAME}, Ahmedabad`)
  })

  it('writes a noindex tag only when asked, and marks an article as one', () => {
    const hidden = plain(buildMetadata({ path: '/fake', title: 'Fake title', noindex: true }))
    expect(hidden.robots).toEqual({ index: false, follow: true })
    const article = plain(buildMetadata({ path: '/fake', title: 'Fake title', type: 'article' }))
    expect(article.openGraph.type).toBe('article')
    expect(article.robots).toEqual(INDEXABLE)
  })

  it('allows large image previews on every page that may be indexed, the home page included', () => {
    for (const path of ['/', '/fake', '/fake/deeper']) {
      expect(plain(buildMetadata({ path, title: 'Fake title' })).robots, path).toEqual(INDEXABLE)
    }
  })
})

describe.each(Object.entries(STARTER_PAGES))('the metadata of starter page "%s"', (slug, page) => {
  const built = () => plain(metadataOf(slug, page))

  it('has a canonical URL that is absolute, on the origin, at the page’s own path', () => {
    const { alternates, openGraph } = built()
    expect(alternates.canonical).toBe(slug === 'home' ? `${ORIGIN}/` : `${ORIGIN}/${slug}`)
    expect(new URL(alternates.canonical).pathname).toBe(pagePath(slug))
    expect(openGraph.url).toBe(alternates.canonical)
  })

  it('has its own title and description, within the limits (docs/12 §3)', () => {
    const { title, description, openGraph } = built()
    if (slug === 'home') expect(title).toEqual({ absolute: HOME_TITLE })
    else expect(title).toBe(page.title)
    expect(openGraph.title).toBe(slug === 'home' ? HOME_TITLE : `${page.title} · IIIC`)
    expect([...openGraph.title].length, openGraph.title).toBeLessThanOrEqual(60)
    // Its own description, not the site's sentence standing in for one.
    expect(description).toBe(page.description)
    expect([...description].length, description).toBeGreaterThan(0)
    expect([...description].length, description).toBeLessThanOrEqual(155)
  })

  it('has complete Open Graph and card tags, with its own share image', () => {
    const { description, openGraph, twitter } = built()
    expect(openGraph.type).toBe('website')
    expect(openGraph.siteName).toBe('Indian Institute of Image Catalysts')
    expect(openGraph.locale).toBe('en_IN')
    expect(openGraph.description).toBe(description)
    expect(openGraph.images).toHaveLength(1)
    const [image] = openGraph.images
    expect(image).toMatchObject({
      url: slug === 'home' ? '/og/home' : `/og/${slug}?v=${version(page.title)}`,
      width: 1200,
      height: 630,
    })
    expect(image?.alt).toContain(slug === 'home' ? SITE_NAME : page.title)
    expect(twitter.card).toBe('summary_large_image')
    expect(twitter.title).toBe(openGraph.title)
    expect(twitter.description).toBe(description)
    expect(twitter.images).toEqual(openGraph.images)
  })

  it('holds no placeholder in any value', () => {
    for (const text of strings(built())) {
      expect(hasPlaceholder(text), text).toBe(false)
      expect(text.trim(), 'an empty value').not.toBe('')
    }
  })
})

describe('the tags as Next.js writes them', () => {
  // Next.js's own resolvers, with the layout's metadataBase: the deployment's own origin, which
  // on a preview is not the platform's.
  const BASE = new URL('https://deployment.fake.example')
  const CONTEXT = { trailingSlash: false, isStaticMetadataRouteFile: false }

  const written = async (slug: string, page: { title: string; description?: string | null }) => {
    const metadata = metadataOf(slug, page)
    const path = Promise.resolve(pagePath(slug))
    const alternates = await resolveAlternates(metadata.alternates, BASE, path, CONTEXT)
    const openGraph = await resolveOpenGraph(metadata.openGraph, BASE, path, CONTEXT, null)
    return JSON.parse(JSON.stringify({ alternates, openGraph })) as {
      alternates: { canonical: { url: string } }
      openGraph: { url: string; images: Image[] }
    }
  }

  it.each(Object.entries(STARTER_PAGES))(
    'give "%s" a canonical URL on the platform’s origin and a share image on the deployment’s',
    async (slug, page) => {
      const { alternates, openGraph } = await written(slug, page)
      // The same URL as the sitemap's and the structured data's, whatever host answered.
      expect(new URL(alternates.canonical.url).href).toBe(canonicalUrl(pagePath(slug)))
      expect(openGraph.url).toBe(alternates.canonical.url)
      // og:image must be absolute; the image is served by the deployment that drew the page.
      const address = slug === 'home' ? '/og/home' : `/og/${slug}?v=${version(page.title)}`
      expect(openGraph.images).toEqual([
        expect.objectContaining({
          url: `https://deployment.fake.example${address}`,
          width: 1200,
          height: 630,
        }),
      ])
    },
  )

  it('write the robots tag of a page that may be indexed as large image previews, and nothing else', () => {
    const page = buildMetadata({ path: '/fake', title: 'Fake title' })
    expect(resolveRobots(page.robots ?? null)).toEqual({
      basic: 'max-image-preview:large',
      googleBot: null,
    })
    const hidden = buildMetadata({ path: '/fake', title: 'Fake title', noindex: true })
    expect(resolveRobots(hidden.robots ?? null)?.basic).toBe('noindex, follow')
  })

  it('write the home page’s canonical URL as the bare origin, which is the same URL', async () => {
    // With a metadataBase, Next.js drops the path of a URL that is only "/". A test that
    // compares canonical URLs must read both as URLs, not as text.
    const { alternates, openGraph } = await written('home', STARTER_PAGES.home!)
    expect(alternates.canonical.url).toBe(ORIGIN)
    expect(openGraph.url).toBe(ORIGIN)
    expect(new URL(alternates.canonical.url).href).toBe(`${ORIGIN}/`)
  })
})

describe('the metadata of Find your path', () => {
  it('is built like any page’s, from the app’s own title and description', () => {
    const map = plain(buildMetadata(MAP_PAGE))
    expect(map.title).toBe('Find your path')
    expect(map.description).toBe(MAP_PAGE.description)
    expect(map.alternates.canonical).toBe(`${ORIGIN}/map`)
    expect(map.openGraph.url).toBe(`${ORIGIN}/map`)
    expect(map.openGraph.title).toBe('Find your path · IIIC')
    expect(map.openGraph.images[0]?.url).toBe(`/og/map?v=${version('Find your path')}`)
    for (const text of strings(map)) expect(hasPlaceholder(text), text).toBe(false)
  })
})
