// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type {
  BlocksField,
  DateField,
  Field,
  TextareaField,
  TextField,
  TextFieldSingleValidation,
} from 'payload'
import { describe, expect, it } from 'vitest'

import {
  appliesPageRules,
  carriesFixedStatements,
  FIXED_ANCHORS,
  hasWords,
  isAnchor,
  isCounsellingPath,
  isSitePath,
  oneClosingBand,
  oneOpeningHero,
  PAGE_BLOCKS,
  SHELL_IDS,
  showsCopyStatus,
  uniqueAnchors,
  wordsNeedLink,
} from '@/blocks/pageBlocks'
import { Pages } from '@/collections/Pages'
import { STARTER_IIIC_LINES, STARTER_PAGES, starterAt } from '@/content/starter'
import { PUBLIC_WORKSHOP } from '@/content/starter/about'
import { FOUNDERS_NARRATIVE_FIGURES, FOUNDERS_STORY_LABEL } from '@/content/starter/founders'
import { FRAMEWORK_IIIC_LINES } from '@/content/starter/framework'
import { PDEU_WORKSHOP } from '@/content/starter/learn'
import { hasStrayBrackets } from '@/lib/content/placeholders'
import { PAGE_SLUG } from '@/lib/content/slug'
import type { BandBlock, HeroBlock } from '@/payload-types'

// The starter pages are IIIC's copy, not seed data (D-51): what they call IIIC's own words
// must be in IIIC's own sources exactly, and what nobody has supplied must point at a real input.
// Not IIIC's words: the copy system's lines are candidates (I-41), the feedback cards are other
// people's (I-37), and in each file the notes after the text are the platform team's.
// The sources are compared as plain text: Markdown's bold and quote marks are not words.
const SOURCES = join(process.cwd(), 'docs/content/sources')
const NOT_IIIC = new Set(['copy-system-falak-2026-11-03.md', 'testimonials-and-feedback.md'])
const NOTES =
  /^## (Notes for use|What is new against|Review against the platform|3\. Design observations|Redirect map)/m
const sources = readdirSync(SOURCES)
  .filter((name) => name.endsWith('.md') && !NOT_IIIC.has(name))
  .map((name) => {
    const text = readFileSync(join(SOURCES, name), 'utf8')
    const notes = text.search(NOTES)
    return notes === -1 ? text : text.slice(0, notes)
  })
  .join('\n')
  .replace(/\*\*/g, '')
  .replace(/^> ?/gm, '')
  .replace(/\s+/g, ' ')
/** IIIC's current site as the source file records it (docs/09). */
const site = readFileSync(join(SOURCES, 'old-site-iiicedu-com.md'), 'utf8')
const inputs = readFileSync(join(process.cwd(), 'docs/09-content-and-inputs.md'), 'utf8')
const decisions = readFileSync(join(process.cwd(), 'docs/decisions.md'), 'utf8')

/** Words an approved section may hold besides the page's IIIC lines, each with its reason. */
const APPROVED_EXTRAS: Readonly<Record<string, readonly string[]>> = {
  // IIIC's diagram heading, "HUMAN TRANSFORMATION", in sentence case.
  framework: ['Human transformation'],
  // D-55's additions, and the signature line (D-36).
  founders: ['Built on Subjective Self', FOUNDERS_STORY_LABEL, 'आत्मानं विद्धि', 'Know thyself'],
  // The page's kicker, IIIC's name until the headline has its years (I-32), and its action (§4.9).
  about: ['About', 'Indian Institute of Image Catalysts', 'Contact'],
}

/** Routes the starter pages link to before they exist, and what builds each. */
const NOT_BUILT_YET: Readonly<Record<string, string>> = {
  '/book/call': 'the booking flow (M3)',
  '/book/session': 'the booking flow (M3)',
  '/book/info': 'the booking flow (M3)',
  '/organisations/team-map': 'the Team Map page (I-12) and its request form (M4)',
}

/** Routes the app serves that are not starter pages. */
const APP_ROUTES = new Set(['/map'])

/** Every string in a page, whatever field holds it. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(strings)
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings)
  return []
}

/** The words in a block: every string except links, link names and settings. */
function words(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(words)
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) =>
      ['href', 'anchor', 'blockType', 'copyStatus', 'id'].includes(key) ? [] : words(inner),
    )
  }
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

/** Every button's words with the data beside them: an action's label, a card's or a door's action. */
function buttons(value: unknown): [string, unknown][] {
  if (Array.isArray(value)) return value.flatMap(buttons)
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, inner]): [string, unknown][] =>
    (key === 'label' || key === 'action') && typeof inner === 'string'
      ? [[inner, value]]
      : buttons(inner),
  )
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

describe.each(Object.entries(STARTER_IIIC_LINES))('approved sections on "%s"', (slug, lines) => {
  it('hold only IIIC’s own lines, or words APPROVED_EXTRAS lists with its reason', () => {
    const allowed = new Set([...Object.values(lines), ...(APPROVED_EXTRAS[slug] ?? [])])
    for (const block of STARTER_PAGES[slug]?.layout ?? []) {
      if (!('copyStatus' in block) || block.copyStatus !== 'approved') continue
      for (const text of words(block)) {
        if (/^\[\[TODO: .+, [ID]-\d+\]\]$/.test(text)) continue
        expect(allowed.has(text), `${slug}: ${text}`).toBe(true)
      }
    }
  })
})

describe.each(Object.entries(STARTER_PAGES))('starter page "%s"', (slug, page) => {
  it('lives at its own address and follows the page rules', () => {
    expect(page.slug).toBe(slug)
    expect(slug).toMatch(PAGE_SLUG)
    expect(page.layout.length).toBeGreaterThan(0)
    expect(oneOpeningHero(page.layout)).toBe(true)
    expect(oneClosingBand(page.layout)).toBe(true)
    expect(carriesFixedStatements(page.layout, page.slug)).toBe(true)
  })

  it('has a title the browser tab shows whole, with " · IIIC" (docs/12 §3)', () => {
    expect(`${page.title} · IIIC`.length).toBeLessThanOrEqual(60)
  })

  it('links only to paths on this site', () => {
    const links = hrefs(page.layout)
    expect(links.length).toBeGreaterThan(0)
    for (const href of links) expect(isSitePath(href), href).toBe(true)
  })

  it('links to a page that exists, or to a route listed as not built yet', () => {
    for (const href of hrefs(page.layout)) {
      const path = href.split('#')[0] ?? ''
      const built = path === '/' || starterAt(path.slice(1)) !== undefined || APP_ROUTES.has(path)
      expect(built || path in NOT_BUILT_YET, href).toBe(true)
    }
  })

  it('gives every button the link it opens', () => {
    for (const [label, siblingData] of buttons(page.layout)) {
      expect(wordsNeedLink(label, { siblingData }), label).toBe(true)
    }
  })

  it('points every placeholder at an input or a decision that exists', () => {
    const placeholders = strings(page.layout).flatMap((text) => [
      ...text.matchAll(/\[\[TODO: .+?, ([ID]-\d+)\]\]/g),
    ])
    for (const [, id] of placeholders) {
      expect(id?.startsWith('I') ? inputs : decisions, id).toContain(`| ${id} |`)
    }
    // Anything that looks like a placeholder must be a well-formed one.
    expect(strings(page.layout).filter((text) => hasStrayBrackets(text))).toEqual([])
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
  const hero = { blockType: 'hero' }
  const band = { blockType: 'band' }

  it('opens every page with its one hero', () => {
    const statement = { blockType: 'statement' }
    expect(oneOpeningHero([hero])).toBe(true)
    expect(oneOpeningHero([hero, band])).toBe(true)
    expect(oneOpeningHero([statement])).toMatch(/add one at the top/)
    expect(oneOpeningHero([hero, hero])).toMatch(/one hero at most/)
    expect(oneOpeningHero([statement, hero])).toMatch(/move it to the top/)
  })

  it('allows one yellow band, at the end', () => {
    expect(oneClosingBand([hero])).toBe(true)
    expect(oneClosingBand([hero, band])).toBe(true)
    expect(oneClosingBand([band, hero])).toMatch(/closes the page/)
    expect(oneClosingBand([hero, band, band])).toMatch(/one yellow band/)
  })

  it('keeps the scope statement on every counselling page and the certificate statement on the course page', () => {
    expect(carriesFixedStatements([hero], 'counselling')).toMatch(/scope statement/)
    expect(carriesFixedStatements([hero, { blockType: 'scope' }], 'counselling')).toBe(true)
    expect(carriesFixedStatements([hero], 'counselling/families')).toMatch(/scope statement/)
    // The session booking is a counselling path too, where "Book a session" leads.
    expect(carriesFixedStatements([hero], 'book/session')).toMatch(/scope statement/)
    expect(carriesFixedStatements([hero, { blockType: 'scope' }], 'book/session')).toBe(true)
    expect(carriesFixedStatements([hero], 'book/info')).toBe(true)
    expect(carriesFixedStatements([hero], 'counselling-notes')).toBe(true)
    expect(carriesFixedStatements([hero], 'learn')).toMatch(/certificate statement/)
    expect(carriesFixedStatements([hero, { blockType: 'certificate' }], 'learn')).toBe(true)
    expect(carriesFixedStatements([hero], 'framework')).toBe(true)
    expect(carriesFixedStatements([hero], undefined)).toBe(true)
  })

  it('asks the page and the 404 at an address the same question: is it a counselling path?', () => {
    const counselling = ['counselling', 'counselling/families', 'book/session', 'book/session/x']
    const other = ['book/info', 'counselling-notes', 'framework', 'institute/verify', 'book']
    for (const slug of counselling) {
      expect(isCounsellingPath(`/${slug}`), slug).toBe(true)
      expect(carriesFixedStatements([hero], slug), slug).toMatch(/scope statement/)
    }
    for (const slug of other) {
      expect(isCounsellingPath(`/${slug}`), slug).toBe(false)
      expect(carriesFixedStatements([hero], slug), slug).toBe(true)
    }
    // The 404 is asked with the path as typed: a mistyped capital still gets the numbers.
    expect(isCounsellingPath('/Counselling/x')).toBe(true)
    expect(isCounsellingPath('')).toBe(false)
  })

  it('accepts paths on this site and nothing else as a link', () => {
    for (const ok of ['/', '/framework', '/proof#voices', undefined, null, '']) {
      expect(isSitePath(ok), String(ok)).toBe(true)
    }
    // Browsers read a backslash as a slash: "/\evil.example" opens another site.
    const bad = ['framework', '//evil.example', '/\\evil.example', '/\\/evil.example']
    for (const link of [...bad, 'https://example.com', '/a b', 7]) {
      expect(isSitePath(link), String(link)).toMatch(/path on this site/)
    }
  })

  it('draws a button only with the link it opens', () => {
    expect(wordsNeedLink('Fake', { siblingData: { href: '' } })).toMatch(/Add the link/)
    expect(wordsNeedLink('Fake', { siblingData: undefined })).toMatch(/Add the link/)
    expect(wordsNeedLink('Fake', { siblingData: { href: '/fake' } })).toBe(true)
    expect(wordsNeedLink('', { siblingData: {} })).toBe(true)
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
    // Nor the shell's: a link to /page#main would open the page shell, not the section.
    for (const id of SHELL_IDS) expect(uniqueAnchors([section(id)]), id).toMatch(/already taken/)
    // And each fixed block comes once a page.
    for (const type of FIXED_ANCHORS) {
      expect(uniqueAnchors([{ blockType: type }, { blockType: type }]), type).toMatch(/at most/)
    }
    const fixedOnce = FIXED_ANCHORS.map((type) => ({ blockType: type }))
    expect(uniqueAnchors(fixedOnce)).toBe(true)
    expect(uniqueAnchors(undefined)).toBe(true)
  })

  it('needs words in a heading, not only spaces', () => {
    expect(hasWords('Fake')).toBe(true)
    expect(hasWords('   ')).toMatch(/Write the heading/)
    expect(hasWords(undefined)).toMatch(/Write the heading/)
  })

  it('shows a section’s copy status except on a legal page (D-52)', () => {
    expect(showsCopyStatus({})).toBe(true)
    expect(showsCopyStatus({ legalReview: null })).toBe(true)
    expect(showsCopyStatus({ legalReview: 'draft' })).toBe(false)
    expect(showsCopyStatus({ legalReview: 'approved' })).toBe(false)
  })

  it('accepts only lower-case, hyphenated addresses', () => {
    for (const ok of ['home', 'framework', 'organisations/team-map', 'a1/b-2']) {
      expect(ok).toMatch(PAGE_SLUG)
    }
    for (const bad of ['', '/framework', 'Framework', 'a//b', 'a/', 'wp-login.php', 'a b']) {
      expect(bad).not.toMatch(PAGE_SLUG)
    }
  })

  it('lists as not built only routes no starter page serves', () => {
    for (const path of Object.keys(NOT_BUILT_YET)) {
      expect(starterAt(path.slice(1)), path).toBeUndefined()
    }
  })

  it('reads IIIC’s own words only, no candidate line and no platform note', () => {
    expect(sources).not.toContain('Know Yourself. Every Answer Follows.')
    expect(sources).not.toContain('an Indian theory of psychology')
  })

  it('records the home hero’s claim and the framework’s five outcome lines, with their sources', () => {
    expect(STARTER_PAGES.home?.facts).toContainEqual(
      expect.objectContaining({
        statement: "India's indigenous framework of psychology",
        // The founders' page copy IIIC supplied, not its description or philosophy.
        source: 'pageCopy',
      }),
    )
    const { decisions, reasoning, discipline, trueSelf, goals } = FRAMEWORK_IIIC_LINES
    for (const statement of [decisions, reasoning, discipline, trueSelf, goals]) {
      expect(STARTER_PAGES.framework?.facts).toContainEqual(
        expect.objectContaining({ statement, source: 'brochure' }),
      )
    }
  })
})

describe('the workshops, as the current site records them (docs/09)', () => {
  it.each([
    [PDEU_WORKSHOP, ['Pandit Deendayal Energy University', '3–4 April 2023']],
    [PUBLIC_WORKSHOP, ['Cafe Venture Studio, Commerce Six Roads, Ahmedabad', '8–9 July 2023']],
  ] as const)('%s', (line, parts) => {
    for (const part of parts) {
      expect(line).toContain(part)
      expect(site).toContain(part)
    }
  })
})

describe('the pages collection applies the page rules (src/collections/Pages.ts)', () => {
  /** A field of the collection, by name. */
  const field = <T extends Field>(name: string) =>
    Pages.fields.find((candidate) => 'name' in candidate && candidate.name === name) as T
  /** The fields a list holds, those inside a row included: a row has no name of its own. */
  const flat = (fields: Field[]): Field[] =>
    fields.flatMap((candidate) => (candidate.type === 'row' ? flat(candidate.fields) : [candidate]))
  /** A field inside a block, by the names that lead to it, such as hero, primary, label. */
  const blockField = <T extends Field>(block: string, ...names: string[]) => {
    let fields = PAGE_BLOCKS.find((candidate) => candidate.slug === block)?.fields ?? []
    let found: Field | undefined
    for (const name of names) {
      found = flat(fields).find((candidate) => 'name' in candidate && candidate.name === name)
      fields = found && 'fields' in found ? found.fields : []
    }
    return found as T
  }
  /**
   * What Payload hands a field's check, as far as these checks read it: the page as it will be
   * saved, with its status, and where the check runs ('submit' when the page is saved,
   * 'onChange' in the admin's live checks).
   */
  const options = (
    config: object,
    data: Record<string, unknown> = {},
    { event = 'submit', siblingData = data }: { event?: string; siblingData?: object } = {},
  ) =>
    ({
      ...config,
      data,
      event,
      siblingData,
      req: { t: (key: string) => key, payload: { config: {} } },
    }) as never
  const publishing = { _status: 'published' }
  /** An unpublish through Payload's API: every field is checked, against the newest draft. */
  const unpublishing = { _status: 'draft' }
  const fakeHero = { blockType: 'hero', heading: 'Fake heading', copyStatus: 'approved' }
  const fakeBand = { blockType: 'band', heading: 'Fake band', copyStatus: 'approved' }
  const scope = { blockType: 'scope' }

  it('runs every rule on the sections of a page being published, with the page’s address', async () => {
    const layout = field<BlocksField>('layout')
    const check = (value: unknown[], slug = 'fake-page') =>
      layout.validate?.(value, options(layout, { ...publishing, slug }))
    expect(await check([fakeHero, fakeBand])).toBe(true)
    expect(await check([])).not.toBe(true)
    expect(await check([{ ...fakeHero, blockType: 'statement' }, fakeHero])).toMatch(/to the top/)
    expect(await check([fakeHero, fakeBand, scope])).toMatch(/closes the page/)
    expect(await check([fakeHero, scope, scope])).toMatch(/at most/)
    expect(await check([{ ...fakeHero, lead: '[[TODO: fake]]' }])).toMatch(/typed another way/)
    expect(await check([fakeHero], 'counselling')).toMatch(/scope statement/)
    expect(await check([fakeHero, scope], 'counselling')).toBe(true)
  })

  it('keeps Payload’s own checks on the title and the description, and refuses a placeholder in either', async () => {
    const title = field<TextField>('title')
    const titled = (value: string) =>
      (title.validate as TextFieldSingleValidation)(value, options(title, publishing))
    expect(await titled('Fake page')).toBe(true)
    expect(await titled('F'.repeat(54))).not.toBe(true)
    expect(await titled('[[TODO: fake, I-41]]')).toMatch(/browser tab/)

    const description = field<TextareaField>('description')
    const described = (value: string) =>
      description.validate?.(value, options(description, publishing))
    expect(await described('Fake description.')).toBe(true)
    expect(await described('F'.repeat(156))).not.toBe(true)
    expect(await described('Fake [[TODO: fake, I-41]]')).toMatch(/search result/)
  })

  it('leaves the page rules to publishing, so a page comes off the site whatever its newest draft holds', async () => {
    const layout = field<BlocksField>('layout')
    // A late hero, two bands, and no scope block on a counselling page.
    const broken = [{ ...fakeHero, blockType: 'statement' }, fakeHero, fakeBand, fakeBand]
    const sections = (value: unknown[], data: Record<string, unknown>) =>
      layout.validate?.(value, options(layout, { slug: 'counselling', ...data }))
    expect(await sections(broken, unpublishing)).toBe(true)
    expect(await sections(broken, publishing)).toMatch(/to the top/)
    // Payload's own checks still hold: at least one section, and the title's length.
    expect(await sections([], unpublishing)).not.toBe(true)
    const title = field<TextField>('title')
    const titled = (value: string) =>
      (title.validate as TextFieldSingleValidation)(value, options(title, unpublishing))
    expect(await titled('[[TODO: fake, I-41]]')).toBe(true)
    expect(await titled('F'.repeat(54))).not.toBe(true)
    const description = field<TextareaField>('description')
    expect(
      await description.validate?.('Fake [[TODO: fake, I-41]]', options(description, unpublishing)),
    ).toBe(true)

    // The rules inside a section pass an unpublish too: a heading of spaces, button words
    // without their link, a placeholder in the Sanskrit line.
    const inSections = [
      [blockField<TextField>('hero', 'heading'), '   '],
      [blockField<TextField>('hero', 'primary', 'label'), 'Fake action'],
      [blockField<TextField>('statement', 'action', 'label'), 'Fake action'],
      [blockField<TextField>('cards', 'cards', 'action'), 'Fake action'],
      [blockField<TextField>('band', 'sanskrit'), '[[TODO: fake, I-41]]'],
    ] as const
    for (const [rule, value] of inSections) {
      const check = (data: Record<string, unknown>) =>
        (rule.validate as TextFieldSingleValidation)(
          value,
          options(rule, data, { siblingData: {} }),
        )
      expect(await check(publishing), rule.name).not.toBe(true)
      expect(await check(unpublishing), rule.name).toBe(true)
    }
  })

  it('shows in the admin’s live checks what publishing would refuse, whatever the page’s status', async () => {
    expect(appliesPageRules({ data: publishing, event: 'submit' })).toBe(true)
    expect(appliesPageRules({ data: unpublishing, event: 'submit' })).toBe(false)
    expect(appliesPageRules({ data: unpublishing, event: 'onChange' })).toBe(true)
    expect(appliesPageRules({ data: undefined })).toBe(false)
    const layout = field<BlocksField>('layout')
    const live = options(layout, unpublishing, { event: 'onChange' })
    expect(
      await layout.validate?.([{ ...fakeHero, blockType: 'statement' }, fakeHero], live),
    ).toMatch(/to the top/)
  })

  it('records when a page is first published, and keeps it through an unpublish (D-57)', () => {
    const hook = field<DateField>('firstPublishedAt').hooks?.beforeChange?.[0]
    const run = (args: Record<string, unknown>) => hook?.(args as never)
    const earlier = '2026-11-01T10:00:00.000Z'
    const published = { _status: 'published', firstPublishedAt: earlier }

    const created = (data: Record<string, unknown>, rest = {}) =>
      run({ operation: 'create', value: undefined, data, originalDoc: {}, ...rest })
    expect(created({ _status: 'draft' })).toBeNull()
    expect(created({ _status: 'published' })).toEqual(expect.any(String))
    // A duplicate is a new page: its original's history does not carry over.
    expect(created({ _status: 'draft' }, { value: earlier, originalDoc: published })).toBeNull()

    const updated = (rest: Record<string, unknown>) => run({ operation: 'update', ...rest })
    expect(
      updated({ value: undefined, originalDoc: {}, data: { _status: 'draft' } }),
    ).toBeUndefined()
    expect(updated({ value: null, originalDoc: {}, data: { _status: 'published' } })).toEqual(
      expect.any(String),
    )
    expect(updated({ value: earlier, data: { _status: 'draft' } })).toBe(earlier)
    expect(updated({ value: null, originalDoc: published, data: { _status: 'draft' } })).toBe(
      earlier,
    )
    // Payload hands the hook the page's latest version as the original. A page published before
    // the field existed gets it at its next save, an unpublish included, while that version is
    // the published one...
    const legacy = { _status: 'published', firstPublishedAt: null }
    expect(updated({ value: null, originalDoc: legacy, data: { _status: 'draft' } })).toEqual(
      expect.any(String),
    )
    // ...but once a draft is saved on top, not until it is next published (D-57 says why no
    // page needed it filled in).
    const draftOnTop = { _status: 'draft', firstPublishedAt: null }
    expect(
      updated({ value: null, originalDoc: draftOnTop, data: { _status: 'draft' } }),
    ).toBeUndefined()
    expect(
      updated({ value: null, originalDoc: draftOnTop, data: { _status: 'published' } }),
    ).toEqual(expect.any(String))
  })
})
