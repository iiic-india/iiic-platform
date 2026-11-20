// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { isSitePath, oneClosingBand } from '@/blocks/pageBlocks'
import { STARTER_IIIC_LINES, STARTER_PAGES } from '@/content/starter'
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

  it('points every placeholder at an input that exists (docs/09)', () => {
    const placeholders = strings(page.layout).flatMap((text) => [
      ...text.matchAll(/\[\[TODO: .+?, (I-\d+)\]\]/g),
    ])
    for (const [, id] of placeholders) expect(inputs, id).toContain(`| ${id} |`)
    // Anything that looks like a placeholder must be a well-formed one.
    const loose = strings(page.layout).filter((text) =>
      /\[\[|\]\]/.test(text.replace(/\[\[TODO: .+?, [ID]-\d+\]\]/g, '')),
    )
    expect(loose).toEqual([])
  })

  it('shows no price (D-21) and traces every fact it lists to the page', () => {
    const text = strings(page.layout).join('\n')
    expect(text).not.toMatch(/₹|\bRs\.?\s?\d|\bINR\b/)
    for (const fact of page.facts ?? []) expect(text, fact.statement).toContain(fact.statement)
  })

  it('repeats the hero’s action in the closing band, in the same words', () => {
    const hero = page.layout.find((block): block is HeroBlock => block.blockType === 'hero')
    const band = page.layout.find((block): block is BandBlock => block.blockType === 'band')
    expect(band?.primary).toEqual(hero?.primary)
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

  it('accepts only lower-case, hyphenated addresses', () => {
    for (const ok of ['home', 'framework', 'organisations/team-map', 'a1/b-2']) {
      expect(ok).toMatch(PAGE_SLUG)
    }
    for (const bad of ['', '/framework', 'Framework', 'a//b', 'a/', 'wp-login.php', 'a b']) {
      expect(bad).not.toMatch(PAGE_SLUG)
    }
  })
})
