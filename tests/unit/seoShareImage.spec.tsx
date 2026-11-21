// @vitest-environment node
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ImageResponse } from 'next/og'
import sharp from 'sharp'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { GET, maxDuration, runtime } from '@/app/og/[...slug]/route'
import { STARTER_PAGES } from '@/content/starter'
import { pagePath } from '@/lib/content/slug'
import type { PageContent } from '@/lib/content/types'
import { APP_PAGES } from '@/lib/seo/appPages'
import metrics from '@/lib/seo/fonts/fraunces-latin-opsz144-wght500.metrics.json'
import { SHARE_IMAGE_SIZE, shareImagePath, shareImageUrl } from '@/lib/seo/metadata'
import {
  SHARE_IMAGE_CITY,
  SHARE_IMAGE_COLOURS,
  SHARE_IMAGE_TITLE_BOX,
  SHARE_IMAGE_TITLE_LEADING,
  SHARE_IMAGE_TITLE_SETTINGS,
  shareImage,
  shareImageLabels,
  shareImageTitle,
  shareImageTitleFit,
  type ShareImageInput,
} from '@/lib/seo/shareImage'
import { SITE_NAME } from '@/lib/seo/site'
import { CONTACT } from '@/lib/site/contact'

// The share image (plan A8) and its route, /og/<slug>, against a fake Payload (as
// getPage.spec.ts) and with the network shut: every fetch fails, and is recorded.
const { find, count } = vi.hoisted(() => ({ find: vi.fn(), count: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('payload', () => ({ getPayload: async () => ({ find, count }) }))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: () => unknown) => fn,
}))

const fetchSpy = vi
  .spyOn(globalThis, 'fetch')
  .mockRejectedValue(new Error('the share image must not use the network'))

/** What the admin holds at an address: its published page, and whether one was ever published. */
function adminHolds(published: PageContent | null, everPublished = published !== null) {
  find.mockResolvedValue({ docs: published ? [published] : [] })
  count.mockResolvedValue({ totalDocs: everPublished ? 1 : 0 })
}

beforeEach(() => {
  fetchSpy.mockClear()
  find.mockReset()
  count.mockReset()
  adminHolds(null)
})

afterAll(() => {
  fetchSpy.mockRestore()
})

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
/** WhatsApp shows no preview for a larger image: the tightest limit among the places links go. */
const LARGEST_IMAGE = 300_000
/** A page's title may hold 53 characters (src/collections/Pages.ts; docs/12 §3). */
const LONGEST_TITLE = 53

async function pngOf(input: ShareImageInput): Promise<Buffer> {
  return Buffer.from(await (await shareImage(input)).arrayBuffer())
}

type Picture = { data: Buffer; width: number; height: number }

async function pictureOf(png: Buffer): Promise<Picture> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

/** The colour of one pixel, as the kit writes colours. */
function colourAt({ data, width }: Picture, x: number, y: number): string {
  const at = (y * width + x) * 4
  const hex = [data[at], data[at + 1], data[at + 2]]
    .map((channel) => (channel ?? 0).toString(16).padStart(2, '0'))
    .join('')
  return `#${hex.toUpperCase()}`
}

/** How many pixels of two pictures differ outside a rectangle. */
function differencesOutside(
  a: Picture,
  b: Picture,
  box: { left: number; top: number; width: number; height: number },
): number {
  let differences = 0
  for (let y = 0; y < a.height; y += 1) {
    for (let x = 0; x < a.width; x += 1) {
      const inside =
        x >= box.left && x < box.left + box.width && y >= box.top && y < box.top + box.height
      if (inside) continue
      const at = (y * a.width + x) * 4
      if (a.data.readUInt32LE(at) !== b.data.readUInt32LE(at)) differences += 1
    }
  }
  return differences
}

/** The starter pages' titles, the app's own pages' and the name: every heading the site draws. */
const SITE_TITLES = [
  ...Object.values(STARTER_PAGES)
    .filter((page) => page.slug !== 'home')
    .map((page) => page.title),
  ...APP_PAGES.map((page) => page.title),
]
const LONGEST_STARTER_TITLE = [...SITE_TITLES].sort((a, b) => b.length - a.length)[0] ?? ''

/** Titles at the limit that take the most room: the widest letters, in words and unbroken. */
const WIDEST_TITLES = [
  Array.from({ length: 9 }, () => 'WWWWW')
    .join(' ')
    .slice(0, LONGEST_TITLE),
  'M'.repeat(LONGEST_TITLE),
  'Hippopotomonstrosesquippedaliophobia and other words',
  'BUSINESS & MANAGEMENT CONSULTANCY FOR OWNERS & LEADERS',
]

describe('the share image (plan A8)', () => {
  it('is a PNG, 1200 by 630, for the home page and for a page with a title', async () => {
    for (const input of [{ home: true }, { title: LONGEST_STARTER_TITLE }]) {
      const response = await shareImage(input)
      expect(response.headers.get('content-type')).toBe('image/png')
      const png = Buffer.from(await response.arrayBuffer())
      expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true)
      const { format, width, height } = await sharp(png).metadata()
      expect({ format, width, height }).toEqual({ format: 'png', ...SHARE_IMAGE_SIZE })
    }
    expect(SHARE_IMAGE_SIZE).toEqual({ width: 1200, height: 630 })
  })

  it('stays under 300 KB for every page of the site, the longest title included', async () => {
    expect(LONGEST_STARTER_TITLE.length).toBeGreaterThanOrEqual(50)
    expect((await pngOf({ title: LONGEST_STARTER_TITLE })).length).toBeLessThan(LARGEST_IMAGE)
    expect((await pngOf({ home: true })).length).toBeLessThan(LARGEST_IMAGE)
    for (const title of [...SITE_TITLES, ...WIDEST_TITLES]) {
      expect((await pngOf({ title })).length, title).toBeLessThan(LARGEST_IMAGE)
    }
  })

  it('takes its colours from the kit: each constant equals its token', async () => {
    const tokens = await readFile(join(process.cwd(), 'src/brand/css/01-tokens.css'), 'utf8')
    const json = JSON.parse(
      await readFile(join(process.cwd(), 'src/brand/tokens.json'), 'utf8'),
    ) as { color: Record<string, string> }
    for (const [token, value] of Object.entries(SHARE_IMAGE_COLOURS)) {
      // "--iiic-slate-500: #5E6C74;" in the CSS, the source of truth, and "slate500" in its mirror.
      expect(tokens, token).toMatch(new RegExp(`${token}:\\s*${value};`))
      const name = token.replace('--iiic-', '').replace(/-(\d)/, '$1')
      expect(json.color[name], token).toBe(value)
    }
  })

  it('is paper with one yellow field, and nothing filled dark (CLAUDE.md #2)', async () => {
    const picture = await pictureOf(await pngOf({ title: LONGEST_STARTER_TITLE }))
    // The ground at the left, the field at the right, both from edge to edge.
    for (const y of [2, 315, 627]) {
      expect(colourAt(picture, 2, y)).toBe(SHARE_IMAGE_COLOURS['--iiic-paper'])
      expect(colourAt(picture, 1197, y)).toBe(SHARE_IMAGE_COLOURS['--iiic-yellow'])
    }
    // Ink and slate are type and the mark's line, never a surface: a small share of the picture.
    let dark = 0
    for (let at = 0; at < picture.data.length; at += 4) {
      const [red = 0, green = 0, blue = 0] = picture.data.subarray(at, at + 3)
      if (red + green + blue < 3 * 128) dark += 1
    }
    expect(dark / (picture.width * picture.height)).toBeLessThan(0.1)
  })

  it('names the city of the address the site prints', () => {
    expect(CONTACT.address.endsWith(`, ${SHARE_IMAGE_CITY}`)).toBe(true)
  })

  it('names the institute and its city once: a label the title repeats gives way', () => {
    const name = SITE_NAME.toUpperCase()
    expect(shareImageLabels('Privacy notice')).toEqual({ kicker: name, city: 'Ahmedabad' })
    expect(shareImageLabels('Business & management consultancy in Ahmedabad')).toEqual({
      kicker: name,
      city: '',
    })
    // Where the heading is the full name, the short one stands above it.
    expect(shareImageLabels(SITE_NAME)).toEqual({ kicker: 'IIIC', city: 'Ahmedabad' })
    expect(shareImageLabels(`${SITE_NAME}, Ahmedabad`)).toEqual({ kicker: 'IIIC', city: '' })
  })
})

describe('no request while the image is drawn', () => {
  it('starts the library without one: it only unpacks the layout engine it carries', async () => {
    // A fresh copy of the modules, so that this test sees the library start whatever ran before.
    vi.resetModules()
    const fresh = await import('@/lib/seo/shareImage')
    const png = Buffer.from(await (await fresh.shareImage({ home: true })).arrayBuffer())
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true)
    for (const [input] of fetchSpy.mock.calls) {
      expect(String(input).slice(0, 37)).toBe('data:application/octet-stream;base64,')
    }
  })

  it('never looks for a font or an emoji elsewhere, whatever the title holds', async () => {
    // IIIC's own headline for founders, with an emoji and a Devanagari phrase added.
    const title = 'From ₹100 Crore to ₹1000 Crore 🚀 आत्मानं विद्धि'
    expect(shareImageTitle(title)).toBe('From ₹100 Crore to ₹1000 Crore')
    await pngOf({ home: true })
    fetchSpy.mockClear()

    const png = await pngOf({ title })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true)
    const { width, height } = await sharp(png).metadata()
    expect({ width, height }).toEqual(SHARE_IMAGE_SIZE)
    // It is the picture of what was left, rupee sign and all, not of the institute's name.
    expect(png.equals(await pngOf({ title: 'From ₹100 Crore to ₹1000 Crore' }))).toBe(true)
    expect(png.equals(await pngOf({ home: true }))).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('holds a glyph for every character the metrics file lists', async () => {
    await pngOf({ home: true })
    fetchSpy.mockClear()
    const listed = Object.keys(metrics.advances).map((code) => String.fromCodePoint(Number(code)))
    expect(listed.length).toBeGreaterThan(200)
    expect(listed).toEqual(expect.arrayContaining([' ', 'A', 'z', '&', '·', '₹', '’', '—']))
    // Drawn 24 at a time, each run as one unbroken word, so that every one reaches the library.
    for (let from = 0; from < listed.length; from += 24) {
      const run = listed.slice(from, from + 24).join('')
      const heading = shareImageTitle(`a${run}a`)
      expect(heading, run).not.toBe(SITE_NAME)
      await pngOf({ title: heading })
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('is needed: the library itself asks Google for a font when a character has no glyph', async () => {
    // What shareImageTitle prevents, shown on the library directly. If an upgrade of Next.js
    // changes this, the note at the top of src/lib/seo/shareImage.tsx is due a second look.
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fraunces = await readFile(
      join(process.cwd(), 'src/lib/seo/fonts/fraunces-latin-opsz144-wght500.ttf'),
    )
    const image = new ImageResponse(<div style={{ fontFamily: 'Fraunces' }}>विद्धि</div>, {
      width: 200,
      height: 100,
      fonts: [{ name: 'Fraunces', data: fraunces, weight: 500, style: 'normal' }],
    })
    await image.arrayBuffer()
    const asked = fetchSpy.mock.calls.map(([input]) => String(input))
    expect(asked.some((url) => url.startsWith('https://fonts.googleapis.com/'))).toBe(true)
    errors.mockRestore()
  })
})

describe('the heading drawn for a title', () => {
  it('is the title itself for every page of the site', () => {
    for (const title of SITE_TITLES) expect(shareImageTitle(title)).toBe(title)
    expect(shareImageTitle('Café Zoë: “Know thyself” – a talk')).toBe(
      'Café Zoë: “Know thyself” – a talk',
    )
  })

  it('leaves out what the font cannot draw, and what only stood beside it', () => {
    expect(shareImageTitle('आत्मानं विद्धि: Know thyself')).toBe('Know thyself')
    expect(shareImageTitle('Know thyself (आत्मानं विद्धि)')).toBe('Know thyself')
    expect(shareImageTitle('Know · आत्मानं · thyself')).toBe('Know · thyself')
    expect(shareImageTitle('Know thyself · आत्मानं')).toBe('Know thyself')
    expect(shareImageTitle('Counselling 🙂 for families 👨‍👩‍👧')).toBe('Counselling for families')
  })

  it('keeps the base letter of a letter the font lacks, and an ordinary hyphen', () => {
    expect(shareImageTitle('What does ātmānaṃ viddhi mean?')).toBe('What does atmanam viddhi mean?')
    const nonBreakingHyphen = String.fromCodePoint(0x2011)
    const softHyphen = String.fromCodePoint(0x00ad)
    expect(shareImageTitle(`Self${nonBreakingHyphen}awareness`)).toBe('Self-awareness')
    expect(shareImageTitle(`Account${softHyphen}ability`)).toBe('Accountability')
    // A decomposed accent is composed first; one with nothing to sit on is left out.
    const acute = String.fromCodePoint(0x0301)
    expect(shareImageTitle(`Cafe${acute}`)).toBe('Café')
    expect(shareImageTitle(`${acute}Cafe`)).toBe('Cafe')
  })

  it('sets every kind of space as one space', () => {
    const spaces = [9, 10, 13, 0x00a0, 0x2003, 0x3000].map((code) => String.fromCodePoint(code))
    expect(shareImageTitle(` Find${spaces.join('')}your ${spaces[3]} path `)).toBe('Find your path')
  })

  it('is the name of the institute when nothing can be drawn', () => {
    for (const title of ['', '   ', '🙂', 'आत्मानं विद्धि', '(🙂)', '·']) {
      expect(shareImageTitle(title), title).toBe(title === '·' ? '·' : SITE_NAME)
    }
  })

  it('never shows a placeholder (CLAUDE.md #1)', () => {
    for (const title of ['[[TODO: the name of the service, I-11]]', 'Our TODO', 'About ]]']) {
      expect(shareImageTitle(title), title).toBe(SITE_NAME)
    }
  })

  it('holds only characters the font has a glyph for, whatever goes in', () => {
    const listed = new Set(Object.keys(metrics.advances).map(Number))
    // Every character of the Basic Multilingual Plane and the first supplementary planes.
    for (let from = 0; from < 0x30000; from += 61) {
      const title = Array.from({ length: 61 }, (_, index) => String.fromCodePoint(from + index))
      for (const char of shareImageTitle(title.join(' '))) {
        if (!listed.has(char.codePointAt(0) ?? -1)) {
          throw new Error(`U+${char.codePointAt(0)?.toString(16)} is drawn but not listed`)
        }
      }
    }
  })
})

describe('the size of a title', () => {
  it('leaves room in the title box for one line more than each setting allows', () => {
    for (const { size, lines } of SHARE_IMAGE_TITLE_SETTINGS) {
      expect((lines + 1) * size * SHARE_IMAGE_TITLE_LEADING, `${size} px`).toBeLessThanOrEqual(
        SHARE_IMAGE_TITLE_BOX.height,
      )
    }
    const sizes = SHARE_IMAGE_TITLE_SETTINGS.map(({ size }) => size)
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a))
  })

  it('sets the name of the institute at the largest size', () => {
    expect(shareImageTitleFit(SITE_NAME)).toEqual({
      size: SHARE_IMAGE_TITLE_SETTINGS[0].size,
      breakWords: false,
    })
  })

  it('sets every page of the site without breaking a word, and a short title largest', () => {
    for (const title of SITE_TITLES) {
      expect(title.length, title).toBeLessThanOrEqual(LONGEST_TITLE)
      const fit = shareImageTitleFit(title)
      expect(fit?.breakWords, title).toBe(false)
      expect(fit?.size, title).toBeGreaterThanOrEqual(64)
    }
    expect(shareImageTitleFit('Find your path')?.size).toBe(SHARE_IMAGE_TITLE_SETTINGS[0].size)
  })

  it('finds a setting for any title of 53 characters, the widest letters included', () => {
    for (const title of WIDEST_TITLES) {
      expect(title.length, title).toBeLessThanOrEqual(LONGEST_TITLE + 1)
      expect(shareImageTitleFit(title), title).not.toBeNull()
      expect(shareImageTitle(title), title).toBe(title)
    }
    // Every character the font holds, 53 times over, as one word and as short words.
    for (const code of Object.keys(metrics.advances)) {
      const char = String.fromCodePoint(Number(code))
      if (char === ' ') continue
      expect(shareImageTitleFit(char.repeat(LONGEST_TITLE)), `U+${code}`).not.toBeNull()
      const words = Array.from({ length: 9 }, () => char.repeat(5)).join(' ')
      expect(shareImageTitleFit(words), `U+${code}`).not.toBeNull()
    }
  })

  it('gives way to the name of the institute when a title is too long to set whole', () => {
    const endless = Array.from({ length: 120 }, () => 'counselling').join(' ')
    expect(shareImageTitleFit(endless)).toBeNull()
    expect(shareImageTitle(endless)).toBe(SITE_NAME)
  })

  it('keeps a title inside its box: nothing clipped, nothing over the labels or the field', async () => {
    // Outside the title box, the picture of any title is the picture of a short one with the
    // same labels. A few pixels of leeway round the box: a letter may reach just past its line.
    const leeway = 8
    const box = {
      left: SHARE_IMAGE_TITLE_BOX.left - leeway,
      top: SHARE_IMAGE_TITLE_BOX.top - leeway,
      width: SHARE_IMAGE_TITLE_BOX.width + 2 * leeway,
      height: SHARE_IMAGE_TITLE_BOX.height + 2 * leeway,
    }
    const short = new Map<string, Picture>()
    for (const title of ['Terms', 'Ahmedabad', SITE_NAME, `${SITE_NAME}, Ahmedabad`]) {
      short.set(JSON.stringify(shareImageLabels(title)), await pictureOf(await pngOf({ title })))
    }
    expect(short.size).toBe(4)
    for (const title of [...SITE_TITLES, ...WIDEST_TITLES]) {
      const picture = await pictureOf(await pngOf({ title }))
      const same = short.get(JSON.stringify(shareImageLabels(title)))
      if (!same) throw new Error(`no short title with the labels of "${title}"`)
      expect(differencesOutside(picture, same, box), title).toBe(0)
      // And the title is there: the box itself differs from the short title's.
      expect(picture.data.equals(same.data), title).toBe(title === `${SITE_NAME}, Ahmedabad`)
    }
  }, 60_000)
})

describe('the fonts the image is set in', () => {
  it('are the files src/lib/seo/fonts/README.md records, byte for byte', async () => {
    const folder = join(process.cwd(), 'src/lib/seo/fonts')
    const readme = await readFile(join(folder, 'README.md'), 'utf8')
    for (const file of [
      'fraunces-latin-opsz144-wght500.ttf',
      'manrope-latin-wght800.ttf',
      'manrope-latin-wght600.ttf',
    ]) {
      const hash = createHash('sha256')
        .update(await readFile(join(folder, file)))
        .digest('hex')
      // The row as Prettier writes it: each cell padded to the width of its column.
      const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      expect(readme, file).toMatch(new RegExp(`^\\| \`${escaped}\` +\\| \`${hash}\` \\|$`, 'm'))
    }
  })
})

describe('/og/<slug>', () => {
  const get = (...slug: string[]) =>
    GET(new Request(`http://localhost/og/${slug.join('/')}`), {
      params: Promise.resolve({ slug }),
    })

  /** A page published in the admin. Obviously fake. */
  const published = (title: string): PageContent => ({
    title,
    slug: 'fake-page',
    layout: [{ blockType: 'hero', heading: 'Fake heading', copyStatus: 'approved' }],
  })

  it('declares its runtime and its time limit (docs/12 §6)', () => {
    expect(runtime).toBe('nodejs')
    expect(maxDuration).toBeGreaterThan(0)
  })

  it('answers with the image at the address the metadata gives each page', async () => {
    const paths = [
      '/',
      ...Object.keys(STARTER_PAGES).map(pagePath),
      ...APP_PAGES.map((p) => p.path),
    ]
    expect(paths).toEqual(expect.arrayContaining(['/', '/counselling', '/map']))
    for (const path of new Set(paths)) {
      const address = shareImagePath(path)
      expect(address.startsWith('/og/'), path).toBe(true)
      const response = await get(...address.slice('/og/'.length).split('/'))
      expect(response.status, path).toBe(200)
      expect(response.headers.get('Content-Type'), path).toBe('image/png')
      // A day at the edge, as the other generated files (docs/12 §1, src/app/llms.txt/route.ts).
      expect(response.headers.get('Cache-Control'), path).toBe(
        'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400',
      )
      const png = Buffer.from(await response.arrayBuffer())
      const { format, width, height } = await sharp(png).metadata()
      expect({ format, width, height }, path).toEqual({ format: 'png', ...SHARE_IMAGE_SIZE })
    }
    expect(fetchSpy.mock.calls.filter(([input]) => !String(input).startsWith('data:'))).toEqual([])
  }, 60_000)

  it('draws the home image whether or not a home page is published (the 404 carries it too)', async () => {
    adminHolds(null, true)
    const response = await get('home')
    expect(response.status).toBe(200)
    expect(Buffer.from(await response.arrayBuffer()).equals(await pngOf({ home: true }))).toBe(true)
    expect(find).not.toHaveBeenCalled()
  })

  it('draws the title of the page a visitor reads there: the published one, else the starter', async () => {
    const starter = await get('counselling')
    expect(
      Buffer.from(await starter.arrayBuffer()).equals(
        await pngOf({ title: STARTER_PAGES.counselling?.title }),
      ),
    ).toBe(true)

    adminHolds(published('Fake published page'))
    const page = await get('counselling')
    expect(
      Buffer.from(await page.arrayBuffer()).equals(await pngOf({ title: 'Fake published page' })),
    ).toBe(true)

    const app = await get('map')
    expect(
      Buffer.from(await app.arrayBuffer()).equals(await pngOf({ title: 'Find your path' })),
    ).toBe(true)
  })

  it('serves the versioned address the metadata gives, the version ignored', async () => {
    const title = STARTER_PAGES.counselling?.title ?? ''
    const url = new URL(shareImageUrl('/counselling', title), 'http://localhost')
    expect(url.search).toMatch(/^\?v=[0-9a-f]{8}$/)
    const slug = url.pathname.slice('/og/'.length).split('/')
    const versioned = await GET(new Request(url), { params: Promise.resolve({ slug }) })
    expect(versioned.status).toBe(200)
    // An old version, or none: the route draws the title as it is now.
    const stale = await GET(new Request('http://localhost/og/counselling?v=00000000'), {
      params: Promise.resolve({ slug: ['counselling'] }),
    })
    const plain = Buffer.from(await (await get('counselling')).arrayBuffer())
    expect(Buffer.from(await versioned.arrayBuffer()).equals(plain)).toBe(true)
    expect(Buffer.from(await stale.arrayBuffer()).equals(plain)).toBe(true)
    expect(plain.equals(await pngOf({ title }))).toBe(true)
  })

  it('draws the name of the institute in place of a title that holds a placeholder', async () => {
    adminHolds(published('[[TODO: the name of the service, I-11]]'))
    const response = await get('fake-page')
    expect(response.status).toBe(200)
    expect(Buffer.from(await response.arrayBuffer()).equals(await pngOf({ home: true }))).toBe(true)
  })

  it('gives a plain 404, with no image, where there is no page', async () => {
    // No page at the address; a page that was published and is not now (D-57).
    const missing = [['no-such-page'], ['organisations', 'no-such-service'], ['constructor']]
    for (const slug of missing) {
      const response = await get(...slug)
      expect(response.status, slug.join('/')).toBe(404)
      expect(response.headers.get('Content-Type'), slug.join('/')).toBeNull()
      expect((await response.arrayBuffer()).byteLength, slug.join('/')).toBe(0)
    }
    adminHolds(null, true)
    expect((await get('counselling')).status).toBe(404)
  })

  it('refuses an address no page could have before the database is asked', async () => {
    const invalid = [
      ['About'],
      ['counselling_'],
      ['a b'],
      ['-about'],
      ['about', ''],
      ['home', 'x-'],
    ]
    for (const slug of invalid) {
      expect((await get(...slug)).status, slug.join('/')).toBe(404)
    }
    expect(find).not.toHaveBeenCalled()
    expect(count).not.toHaveBeenCalled()
  })

  it('has no image for a route that is never indexed (D-67)', async () => {
    const noindex = [
      ['admin'],
      ['admin', 'placeholders'],
      ['api', 'pages'],
      ['book', 'session'],
      ['b', 'fake-token'],
      ['feedback', 'fake-token'],
      ['subscribe', 'confirm'],
      ['account'],
      ['search'],
      ['map', 'go'],
      ['map', 'result', 'fake-id'],
      ['login'],
      ['institute', 'verify', 'fake-id'],
    ]
    for (const slug of noindex) {
      const response = await get(...slug)
      expect(response.status, slug.join('/')).toBe(404)
      expect((await response.arrayBuffer()).byteLength, slug.join('/')).toBe(0)
    }
    expect(find).not.toHaveBeenCalled()
  })
})
