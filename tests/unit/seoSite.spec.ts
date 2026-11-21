// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  canonicalPath,
  canonicalUrl,
  fact,
  FOUNDER,
  FRAMEWORK_DEFINITION,
  hasPlaceholder,
  HOME_TITLE,
  PRODUCTION_ORIGIN,
  SITE_ALTERNATE_NAMES,
  SITE_DESCRIPTION,
  SITE_LANGUAGE,
  SITE_NAME,
  siteOrigin,
  TITLE_SUFFIX,
} from '@/lib/seo/site'

// The facts every search surface reads (src/lib/seo/site.ts), each held to where the docs
// record it, and the canonical form of an address.
const source = (name: string) =>
  readFileSync(join(process.cwd(), 'docs/content/sources', name), 'utf8').replace(/\*\*/g, '')

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('the site’s facts', () => {
  it('names the organisation in full, with the one other name IIIC uses (D-63)', () => {
    expect(SITE_NAME).toBe('Indian Institute of Image Catalysts')
    expect([...SITE_ALTERNATE_NAMES]).toEqual(['IIIC'])
    expect(SITE_LANGUAGE).toBe('en-IN')
    expect(PRODUCTION_ORIGIN).toBe('https://imagecatalysts.in')
  })

  it('keeps the home page’s fixed title and the suffix within 60 characters (docs/12 §3)', () => {
    expect(HOME_TITLE).toBe('Indian Institute of Image Catalysts · Subjective Self')
    expect(TITLE_SUFFIX).toBe(' · IIIC')
    expect([...HOME_TITLE].length).toBeLessThanOrEqual(60)
  })

  it('describes IIIC in the philosophy’s first sentence, without "(IIIC)", in 155 characters', () => {
    const philosophy = source('iiic-philosophy-2026-11-19.md')
    expect(philosophy).toContain(
      SITE_DESCRIPTION.replace('Catalysts operates', 'Catalysts (IIIC) operates'),
    )
    expect([...SITE_DESCRIPTION].length).toBeLessThanOrEqual(155)
  })

  it('defines the framework in IIIC’s own sentence, word for word', () => {
    expect(source('iiic-description-2026-11-04.md')).toContain(FRAMEWORK_DEFINITION)
  })

  it('names the founder as the brochure does: no honorific, his own title (D-64)', () => {
    expect(FOUNDER).toEqual({ name: 'Gaurang Mistry', jobTitle: 'Image Consultant' })
    expect(source('brochures-2026.md')).toContain(
      `Mr. ${FOUNDER.name}, ${FOUNDER.jobTitle} and founder of IIIC`,
    )
  })
})

describe('siteOrigin', () => {
  it('is the platform domain when no site URL is set, as on a preview', () => {
    // An absent value falls back to the environment, which CI sets: unset it first.
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    expect(siteOrigin(undefined)).toBe('https://imagecatalysts.in')
    expect(siteOrigin('')).toBe('https://imagecatalysts.in')
    expect(siteOrigin()).toBe('https://imagecatalysts.in')
  })

  it('is the origin of the site URL, without its path, query or trailing slash', () => {
    expect(siteOrigin('https://imagecatalysts.in/')).toBe('https://imagecatalysts.in')
    expect(siteOrigin('https://Fake.Example/some/path?x=1#y')).toBe('https://fake.example')
    expect(siteOrigin('http://localhost:3000')).toBe('http://localhost:3000')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000/about')
    expect(siteOrigin()).toBe('http://localhost:3000')
  })

  it('is the platform domain when the value is not a web address', () => {
    // "localhost:3000" parses as a URL whose scheme is "localhost" and whose origin is "null".
    for (const value of [
      'not a url',
      'localhost:3000',
      'imagecatalysts.in',
      'mailto:x@fake.example',
      '/about',
    ]) {
      expect(siteOrigin(value), value).toBe('https://imagecatalysts.in')
    }
  })
})

describe('canonicalPath', () => {
  it.each([
    ['/', '/'],
    ['', '/'],
    ['/about', '/about'],
    ['about', '/about'],
    ['/About', '/about'],
    ['/about/', '/about'],
    ['/about//', '/about'],
    ['//about', '/about'],
    ['/organisations//team-map/', '/organisations/team-map'],
    ['/about?utm_source=chatgpt.com', '/about'],
    ['/About/?utm_source=x&y=1', '/about'],
    ['/about#contact', '/about'],
    ['/about/?x=1#contact', '/about'],
    ['/?utm_source=x', '/'],
    ['/#main', '/'],
    ['?x=1', '/'],
  ])('reads "%s" as %s', (path, canonical) => {
    expect(canonicalPath(path)).toBe(canonical)
  })
})

describe('canonicalUrl', () => {
  it('puts the canonical path on the given origin, the home page with its slash', () => {
    expect(canonicalUrl('/', 'https://fake.example')).toBe('https://fake.example/')
    expect(canonicalUrl('', 'https://fake.example')).toBe('https://fake.example/')
    expect(canonicalUrl('/About/?x=1#y', 'https://fake.example')).toBe('https://fake.example/about')
    expect(canonicalUrl('/organisations/team-map/', 'https://fake.example')).toBe(
      'https://fake.example/organisations/team-map',
    )
  })

  it('points at the platform domain unless the deployment names its own origin', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    expect(canonicalUrl('/about')).toBe('https://imagecatalysts.in/about')
    expect(canonicalUrl('/')).toBe('https://imagecatalysts.in/')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000')
    expect(canonicalUrl('/about')).toBe('http://localhost:3000/about')
  })
})

describe('hasPlaceholder and fact', () => {
  it('finds a placeholder however it is typed', () => {
    for (const text of [
      '[[TODO: the PIN, I-33]]',
      'About [[TODO: the years, I-32]]',
      'Fake [[unfinished',
      'Fake unfinished]]',
      'TODO: write this',
    ]) {
      expect(hasPlaceholder(text), text).toBe(true)
    }
    for (const text of ['About', 'Fake [brackets]', 'What to do next', '']) {
      expect(hasPlaceholder(text), text).toBe(false)
    }
  })

  it('gives a text fit to show, or nothing', () => {
    expect(fact('  About  ')).toBe('About')
    for (const text of [undefined, null, '', '   ', '\n', '[[TODO: the PIN, I-33]]', 'Fake ]]']) {
      expect(fact(text), String(text)).toBeUndefined()
    }
  })
})
