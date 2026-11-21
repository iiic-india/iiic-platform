import { expect, type Page, test } from '@playwright/test'

import { STARTER_PAGES } from '../../src/content/starter'
import { pagePath } from '../../src/lib/content/slug'
import { PRIVATE_ROUTES } from '../../src/lib/security/headers'
import { MAP_PAGE } from '../../src/lib/seo/appPages'
import { isNoindexPath, pageSlugOf } from '../../src/lib/seo/paths'
import { disallowLinesFor, TRAINING_CRAWLERS } from '../../src/lib/seo/robots'
import {
  canonicalUrl,
  HOME_TITLE,
  SITE_NAME,
  siteOrigin,
  TITLE_SUFFIX,
} from '../../src/lib/seo/site'

// The search system on the running site (docs/12 §3; D-61 to D-68): what a search engine, a
// link preview and an AI crawler read from each public page, and the files beside the pages.
// Canonical URLs point at the origin the server was built for (NEXT_PUBLIC_SITE_URL; CI sets
// it to the server under test, so each one can be followed), or at the platform domain.
const ORIGIN = siteOrigin()

// Every public page: the starter pages, which are what the site shows until a page is
// published in the CMS (D-51), and Find your path (the list tests/e2e/site.e2e.spec.ts checks).
const PAGES = [
  ...Object.entries(STARTER_PAGES).map(([slug, page]) => ({
    path: pagePath(slug),
    title: slug === 'home' ? HOME_TITLE : `${page.title}${TITLE_SUFFIX}`,
  })),
  { path: MAP_PAGE.path, title: `${MAP_PAGE.title}${TITLE_SUFFIX}` },
]

// The user agents OpenAI and Google publish for their crawlers.
const CRAWLERS = {
  GPTBot:
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.3; +https://openai.com/gptbot',
  Googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
}

/**
 * A URL in its one normal form. Next.js writes the home page's canonical URL as the bare
 * origin, without the slash the sitemap and the structured data give it: the same URL.
 */
const asUrl = (href: string) => new URL(href).href

/** The width and height a PNG states in its header, after its eight signature bytes. */
function pngSize(file: Buffer): { width: number; height: number } {
  expect(file.subarray(0, 8).toString('latin1'), 'the PNG signature').toBe('\x89PNG\r\n\x1a\n')
  return { width: file.readUInt32BE(16), height: file.readUInt32BE(20) }
}

/** A tag in raw HTML that has each of the given attributes, whatever their order. */
const tag = (name: string, ...attributes: string[]) =>
  new RegExp(
    `<${name}\\b${attributes.map((attribute) => `(?=[^>]*\\s${attribute})`).join('')}[^>]*>`,
    'g',
  )

const CANONICAL_TAG = tag('link', 'rel="canonical"', 'href="([^"]+)"')

/** Collects what the browser reports against the Content-Security-Policy while a page loads. */
async function policyViolations(page: Page): Promise<string[]> {
  const violations: string[] = []
  page.on('console', (message) => {
    if (/content security policy/i.test(message.text())) violations.push(message.text())
  })
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(
        `Content Security Policy violation: ${event.effectiveDirective} ${event.blockedURI}`,
      )
    })
  })
  return violations
}

test.describe('Each public page, as a search engine reads it', () => {
  for (const { path, title } of PAGES) {
    test(`${path} has its title, description, canonical URL, share tags and structured data`, async ({
      page,
      request,
      isMobile,
    }) => {
      const violations = await policyViolations(page)
      const response = await page.goto(path)
      expect(response?.status()).toBe(200)
      await expect(page).toHaveTitle(title)

      // docs/12 §3: one description, 155 characters at most, never a placeholder.
      const descriptions = page.locator('meta[name="description"]')
      await expect(descriptions).toHaveCount(1)
      const description = (await descriptions.getAttribute('content')) ?? ''
      expect([...description].length, description).toBeGreaterThanOrEqual(1)
      expect([...description].length, description).toBeLessThanOrEqual(155)
      expect(description).not.toContain('[[')

      // One canonical URL: the origin and the page's own path.
      const canonicals = page.locator('link[rel="canonical"]')
      await expect(canonicals).toHaveCount(1)
      const canonical = (await canonicals.getAttribute('href')) ?? ''
      expect(asUrl(canonical)).toBe(canonicalUrl(path, ORIGIN))

      // Open Graph and the card, complete (D-63: the site's name in full; D-33: no X handle).
      const og = (property: string) => page.locator(`meta[property="og:${property}"]`)
      await expect(og('title')).toHaveAttribute('content', title)
      await expect(og('description')).toHaveAttribute('content', description)
      await expect(og('url')).toHaveAttribute('content', canonical)
      await expect(og('site_name')).toHaveAttribute('content', SITE_NAME)
      await expect(og('locale')).toHaveAttribute('content', 'en_IN')
      await expect(og('type')).toHaveAttribute('content', 'website')
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
        'content',
        'summary_large_image',
      )
      await expect(page.locator('meta[name="twitter:site"]')).toHaveCount(0)
      await expect(page.locator('meta[name="keywords"]')).toHaveCount(0)

      // The share image: an absolute address, 1200 by 630.
      await expect(og('image')).toHaveCount(1)
      const image = (await og('image').getAttribute('content')) ?? ''
      // Every page's but the home page's carries a version of its title, so that a new title
      // is a new address, which link previews fetch afresh.
      expect(image).toMatch(
        path === '/'
          ? /^https?:\/\/[^/]+\/og\/home$/
          : new RegExp(`^https?://[^/]+/og/${pageSlugOf(path)}\\?v=[0-9a-f]{8}$`),
      )
      await expect(og('image:width')).toHaveAttribute('content', '1200')
      await expect(og('image:height')).toHaveAttribute('content', '630')
      await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', image)

      // One block of structured data, which parses and describes this page.
      const blocks = page.locator('script[type="application/ld+json"]')
      await expect(blocks).toHaveCount(1)
      const data = (await blocks.textContent()) ?? ''
      expect(data).not.toMatch(/\[\[|TODO/)
      const { '@graph': graph } = JSON.parse(data) as {
        '@graph': { '@type': string; url?: string }[]
      }
      const described = graph.filter((node) => ['WebPage', 'AboutPage'].includes(node['@type']))
      expect(described).toHaveLength(1)
      expect(described[0]?.url).toBe(canonicalUrl(path, ORIGIN))

      // The block is data, not a script; nothing on the page breaks the policy (D-42).
      await page.waitForLoadState('networkidle')
      expect(violations).toEqual([])

      // The image itself, asked for once: the phone project reads the same address.
      if (isMobile) return
      const picture = await request.get(image)
      expect(picture.status(), image).toBe(200)
      expect(picture.headers()['content-type']).toBe('image/png')
      expect(pngSize(await picture.body())).toEqual({ width: 1200, height: 630 })
    })
  }

  test('an address with no page is a 404 with no canonical URL and no structured data', async ({
    page,
  }) => {
    for (const path of ['/no-such-page', '/organisations/no-such-page']) {
      const response = await page.goto(path)
      expect(response?.status(), path).toBe(404)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found')
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(0)
      await expect(page.locator('meta[property="og:url"]')).toHaveCount(0)
      await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0)
    }
  })
})

// Checks that only make requests: once, in the desktop project.
test.describe('The search files, and the pages as a crawler is sent them', () => {
  test.skip(
    ({ isMobile }) => isMobile,
    'These checks only make requests: the desktop project runs them',
  )

  for (const [crawler, userAgent] of Object.entries(CRAWLERS)) {
    test(`${crawler} is sent each page whole, its metadata inside <head>`, async ({ request }) => {
      // The home page, a door and a legal page (next.config.ts, htmlLimitedBots; D-61).
      for (const path of ['/', '/framework', '/privacy']) {
        const title = PAGES.find((page) => page.path === path)?.title ?? ''
        const response = await request.get(path, { headers: { 'User-Agent': userAgent } })
        expect(response.status(), path).toBe(200)
        const html = await response.text()
        const end = html.indexOf('</head>')
        expect(end, path).toBeGreaterThan(0)
        const head = html.slice(0, end)
        expect(head, path).toContain(`<title>${title}</title>`)
        expect(head.match(tag('meta', 'name="description"', 'content="[^"]+"')), path).toHaveLength(
          1,
        )
        expect(head.match(CANONICAL_TAG), path).toHaveLength(1)
        expect(
          head.match(tag('meta', 'property="og:image"', 'content="https?://[^"]+"')),
          path,
        ).toHaveLength(1)
        // None of them a second time after the head, where a crawler would not look.
        expect(html.slice(end).match(CANONICAL_TAG), path).toBeNull()
      }
    })
  }

  test('a crawler is sent the 404 with no canonical URL and no structured data', async ({
    request,
  }) => {
    const response = await request.get('/no-such-page', {
      headers: { 'User-Agent': CRAWLERS.GPTBot },
    })
    expect(response.status()).toBe(404)
    const html = await response.text()
    expect(html.match(CANONICAL_TAG)).toBeNull()
    expect(html).not.toContain('application/ld+json')
    // Next.js marks every 404 noindex itself.
    expect(html.match(tag('meta', 'name="robots"', 'content="noindex"'))).not.toBeNull()
  })

  test('robots.txt keeps every crawler out of the admin and the API, and the training crawlers out of the private routes (D-61)', async ({
    request,
  }) => {
    const response = await request.get('/robots.txt')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('text/plain')
    const groups = (await response.text())
      .trim()
      .split(/\n\s*\n/)
      .map((group) =>
        group
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line !== ''),
      )
    expect(groups).toHaveLength(3)
    const [everyone = [], training = [], sitemap = []] = groups

    // Every crawler: only the admin and the API kept out, so the other noindex headers are read.
    expect(everyone).toEqual(['User-Agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /api/'])

    // The training crawlers: the same rules, repeated, and every route that is never indexed.
    expect(training.filter((line) => line.startsWith('User-Agent: '))).toEqual(
      TRAINING_CRAWLERS.map((crawler) => `User-Agent: ${crawler}`),
    )
    expect(training.filter((line) => line.startsWith('Allow: '))).toEqual(['Allow: /'])
    const disallowed = training
      .filter((line) => line.startsWith('Disallow: '))
      .map((line) => line.slice('Disallow: '.length))
    expect(disallowed.slice(0, 2)).toEqual(['/admin', '/api/'])
    for (const pattern of PRIVATE_ROUTES) {
      for (const line of disallowLinesFor(pattern)) {
        const shared = line.startsWith('/admin') || line === '/api/'
        expect(shared || disallowed.includes(line), `${pattern}: ${line}`).toBe(true)
      }
    }
    // A route, the route with a query and what is below it, never a bare prefix ("/b" would
    // cover "/blog").
    for (const line of disallowed.slice(2)) expect(line, line).toMatch(/[$/?]$/)

    expect(sitemap).toEqual([`Sitemap: ${ORIGIN}/sitemap.xml`])
  })

  test('sitemap.xml lists every public page once, on the origin, and no route kept out of search', async ({
    request,
  }) => {
    const response = await request.get('/sitemap.xml')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('xml')
    const xml = await response.text()
    const listed = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1] ?? '')
    for (const { path } of PAGES) {
      expect(
        listed.filter((url) => url === canonicalUrl(path, ORIGIN)),
        path,
      ).toHaveLength(1)
    }
    expect(new Set(listed).size).toBe(listed.length)
    for (const url of listed) {
      expect(url.startsWith(`${ORIGIN}/`), url).toBe(true)
      expect(isNoindexPath(new URL(url).pathname), url).toBe(false)
    }
    // No priority or frequency: search engines ignore both (docs/12 §3).
    expect(xml).not.toMatch(/<priority>|<changefreq>/)

    // Each address it lists answers, and names itself as its canonical URL.
    for (const url of listed) {
      const page = await request.get(new URL(url).pathname, {
        headers: { 'User-Agent': CRAWLERS.Googlebot },
      })
      expect(page.status(), url).toBe(200)
      const canonical = [...(await page.text()).matchAll(CANONICAL_TAG)].map(
        (match) => match[1] ?? '',
      )
      expect(canonical.map(asUrl), url).toEqual([url])
    }
  })

  test('llms.txt names the site and the pages the sitemap lists, with no placeholder (D-66)', async ({
    request,
  }) => {
    const response = await request.get('/llms.txt')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe('text/plain; charset=utf-8')
    // Out of search results on every deployment; AI tools still read it.
    expect(response.headers()['x-robots-tag']).toBe('noindex')
    const text = await response.text()
    expect(text.startsWith(`# ${SITE_NAME}\n`)).toBe(true)
    expect(text).not.toContain('[[')
    expect(text).not.toContain('TODO')
    const linked = [...text.matchAll(/^- \[[^\n]*?\]\(([^)\s]+)\)/gm)].map(
      (match) => match[1] ?? '',
    )
    for (const { path } of PAGES) expect(linked, path).toContain(canonicalUrl(path, ORIGIN))
    const sitemap = await (await request.get('/sitemap.xml')).text()
    const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1] ?? '')
    expect([...linked].sort()).toEqual([...listed].sort())
  })

  test('humans.txt says who made the site and carries the signature line (D-36)', async ({
    request,
  }) => {
    const response = await request.get('/humans.txt')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe('text/plain; charset=utf-8')
    const text = await response.text()
    expect(text).toContain(SITE_NAME)
    expect(text).toContain('आत्मानं विद्धि (ātmānaṃ viddhi): Know thyself.')
  })

  test('the web manifest parses, and each of its icons is served', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('application/manifest+json')
    const manifest = (await response.json()) as {
      name: string
      short_name: string
      theme_color: string
      icons: { src: string; sizes: string; type: string }[]
    }
    expect(manifest).toMatchObject({ name: SITE_NAME, short_name: 'IIIC', theme_color: '#FFDD00' })
    expect(manifest.icons).toHaveLength(3)
    for (const icon of manifest.icons) {
      const image = await request.get(icon.src)
      expect(image.status(), icon.src).toBe(200)
      expect(image.headers()['content-type'], icon.src).toBe('image/png')
      const { width, height } = pngSize(await image.body())
      expect(`${width}x${height}`, icon.src).toBe(icon.sizes)
    }
  })

  test('the logo the structured data names is served from the site itself (D-62)', async ({
    request,
  }) => {
    const response = await request.get('/logo.png')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe('image/png')
    expect(pngSize(await response.body()).width).toBe(1200)
  })
})
