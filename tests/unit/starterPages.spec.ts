// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  FIXED_ANCHORS,
  isAnchor,
  isSitePath,
  oneClosingBand,
  uniqueAnchors,
} from '@/blocks/pageBlocks'
import { STARTER_IIIC_LINES, STARTER_PAGES } from '@/content/starter'
import { FOUNDERS_NARRATIVE_FIGURES } from '@/content/starter/founders'
import { PAGE_SLUG } from '@/lib/content/slug'
import type { BandBlock, HeroBlock } from '@/payload-types'

// The starter pages are IIIC's copy, not seed data (D-51): what they call IIIC's own words
// must be in the sources exactly, and what nobody has supplied must point at a real input.
// The sources are compared as plain text: Markdown's bold and quote marks are not words.
const SOURCES = join(process.cwd(), 'docs/content/sources')
const sources = readdirSync(SOURCES)
  .filter((name) => name.endsWith('.md'))
  .map((name) => readFileSync(join(SOURCES, name), 'utf8'))
  .join('\n')
  .replace(/\*\*/g, '')
  .replace(/^> ?/gm, '')
  .replace(/\s+/g, ' ')
const inputs = readFileSync(join(process.cwd(), 'docs/09-content-and-inputs.md'), 'utf8')
const decisions = readFileSync(join(process.cwd(), 'docs/decisions.md'), 'utf8')

/** Every string in a page, whatever field holds it. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(strings)
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings)
  return []
}

/** Every link in a page. */
function hrefs(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(hrefs)
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) =>
      key === 'href' && typeof inner === 'string' ? [inner] : hrefs(inner),
    )
  }
  return []
}

describe.each(Object.entries(STARTER_IIIC_LINES))('IIIC’s own lines on "%s"', (slug, lines) => {
  it.each(Object.entries(lines))('%s is in the sources, word for word', (_, line) => {
    expect(sources).toContain(line)
  })

  it('are all on the page', () => {
    const text = strings(STARTER_PAGES[slug]?.layout).join('\n')
    for (const line of Object.values(lines)) expect(text, line).toContain(line)
  })
})

describe.each(Object.entries(STARTER_PAGES))('starter page "%s"', (slug, page) => {
  it('lives at its own address and follows the page rules', () => {
    expect(page.slug).toBe(slug)
    expect(slug).toMatch(PAGE_SLUG)
    expect(page.layout.length).toBeGreaterThan(0)
    expect(oneClosingBand(page.layout)).toBe(true)
    expect(page.layout.filter((block) => block.blockType === 'hero')).toHaveLength(1)
    expect(page.layout[0]?.blockType).toBe('hero')
  })

  it('links only to paths on this site', () => {
    const links = hrefs(page.layout)
    expect(links.length).toBeGreaterThan(0)
    for (const href of links) expect(isSitePath(href), href).toBe(true)
  })

  it('points every placeholder at an input or a decision that exists', () => {
    const placeholders = strings(page.layout).flatMap((text) => [
      ...text.matchAll(/\[\[TODO: .+?, ([ID]-\d+)\]\]/g),
    ])
    for (const [, id] of placeholders) {
      expect(id?.startsWith('I') ? inputs : decisions, id).toContain(`| ${id} |`)
    }
    // Anything that looks like a placeholder must be a well-formed one.
    const loose = strings(page.layout).filter((text) =>
      /\[\[|\]\]/.test(text.replace(/\[\[TODO: .+?, [ID]-\d+\]\]/g, '')),
    )
    expect(loose).toEqual([])
  })

  it('shows no price (D-21) and traces every fact it lists to the page', () => {
    const text = strings(page.layout).join('\n')
    // The founders' story names a company's turnover in IIIC's words: that is not a price.
    const priced = slug === 'founders' ? text.replace(FOUNDERS_NARRATIVE_FIGURES, '') : text
    expect(priced).not.toMatch(/₹|\bRs\.?\s?\d|\bINR\b/)
    for (const fact of page.facts ?? []) expect(text, fact.statement).toContain(fact.statement)
  })

  it('repeats the hero’s action in its closing band, in the same words', () => {
    const hero = page.layout.find((block): block is HeroBlock => block.blockType === 'hero')
    const band = page.layout.find((block): block is BandBlock => block.blockType === 'band')
    // A page may end without a band: the About page ends on its contact section. And a hero
    // whose button only moves down its own page (the founders' story) leaves the band its own.
    const movesDown = hero?.primary?.href?.startsWith(`/${slug}#`) ?? false
    if (band && !movesDown) expect(band.primary).toEqual(hero?.primary)
  })

  it('opens a section that exists wherever a link names one', () => {
    for (const href of hrefs(page.layout)) {
      const [path, name] = href.split('#')
      if (!name || !path) continue
      // A page that is not built yet has no sections to check.
      const target = STARTER_PAGES[path === '/' ? 'home' : path.slice(1)]
      if (!target) continue
      const names = target.layout.flatMap((block) => {
        if ('anchor' in block && block.anchor) return [block.anchor]
        return (FIXED_ANCHORS as readonly string[]).includes(block.blockType)
          ? [block.blockType]
          : []
      })
      expect(names, href).toContain(name)
    }
    expect(uniqueAnchors(page.layout)).toBe(true)
  })
})

describe('page rules', () => {
  it('allows one yellow band, at the end', () => {
    const hero = { blockType: 'hero' }
    const band = { blockType: 'band' }
    expect(oneClosingBand([hero])).toBe(true)
    expect(oneClosingBand([hero, band])).toBe(true)
    expect(oneClosingBand([band, hero])).toMatch(/closes the page/)
    expect(oneClosingBand([hero, band, band])).toMatch(/one yellow band/)
  })

  it('accepts paths on this site and nothing else as a link', () => {
    for (const ok of ['/', '/framework', '/proof#voices', undefined, null, '']) {
      expect(isSitePath(ok), String(ok)).toBe(true)
    }
    for (const bad of ['framework', '//evil.example', 'https://example.com', '/a b', 7]) {
      expect(isSitePath(bad), String(bad)).toMatch(/path on this site/)
    }
  })

  it('accepts short, lower-case link names, each once a page', () => {
    for (const ok of ['story', 'the-story', 'q2', undefined, null, '']) {
      expect(isAnchor(ok), String(ok)).toBe(true)
    }
    for (const bad of ['Story', 'the story', '2nd', '-story', '#story', 'a'.repeat(41), 7]) {
      expect(isAnchor(bad), String(bad)).toMatch(/small letters/)
    }
    const section = (anchor?: string) => ({ blockType: 'statement', anchor })
    expect(uniqueAnchors([section('story'), section('shift'), section(), section('')])).toBe(true)
    expect(uniqueAnchors([section('story'), section('story')])).toMatch(/"story" is already taken/)
    // The fixed blocks keep their own ids: no section may take one of them.
    for (const fixed of FIXED_ANCHORS) {
      expect(uniqueAnchors([section(fixed)]), fixed).toMatch(/already taken/)
    }
    expect(uniqueAnchors(undefined)).toBe(true)
  })

  it('accepts only lower-case, hyphenated addresses', () => {
    for (const ok of ['home', 'framework', 'organisations/team-map', 'a1/b-2']) {
      expect(ok).toMatch(PAGE_SLUG)
    }
    for (const bad of ['', '/framework', 'Framework', 'a//b', 'a/', 'wp-login.php', 'a b']) {
      expect(bad).not.toMatch(PAGE_SLUG)
    }
  })
})
