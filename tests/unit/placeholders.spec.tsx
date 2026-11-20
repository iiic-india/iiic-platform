import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import FindYourPathPage from '@/app/(platform)/(default)/map/page'
import { RenderBlocks } from '@/components/blocks/PageBlocks'
import { SiteFooter } from '@/components/site/SiteFooter'
import { STARTER_PAGES } from '@/content/starter'
import {
  buildReport,
  candidateSections,
  CODED_PLACEHOLDERS,
  FIXED_PLACEHOLDERS,
  legalItems,
  placeholdersIn,
  sectionName,
  WHOLE_PAGE,
  type PageRef,
} from '@/lib/content/placeholders'

// next/image needs Next's loader; the footer's structure is not what is tested here.
vi.mock('next/image', () => ({ default: () => null }))

afterEach(cleanup)

/** A chip as the site draws it: "[[TODO: what, I-xx]]" with its input as an attribute. */
const chips = (container: HTMLElement) =>
  [...container.querySelectorAll('.iiic-todo')]
    .map((chip) => `${chip.getAttribute('data-todo')}|${chip.textContent}`)
    .sort()

const asChips = (placeholders: { id: string; what: string }[]) =>
  placeholders.map(({ id, what }) => `${id}|[[TODO: ${what}, ${id}]]`).sort()

const ref = (title: string, inAdmin = false): PageRef => ({
  title,
  path: `/${title.toLowerCase()}`,
  href: inAdmin ? '/admin/collections/pages/7' : `/${title.toLowerCase()}`,
  inAdmin,
})

describe.each(Object.entries(STARTER_PAGES))('what the report reads on "%s"', (_, page) => {
  it('is exactly what the page draws: every placeholder, marker and draft label', () => {
    const { container } = render(
      <RenderBlocks layout={page.layout} legalReview={page.legalReview} />,
    )
    expect(asChips(placeholdersIn(page))).toEqual(chips(container))
    expect(candidateSections(page)).toHaveLength(
      container.querySelectorAll('[data-candidate]').length,
    )
    expect(legalItems(page)).toHaveLength(container.querySelectorAll('[data-draft]').length)
  })

  it('names every section it points at', () => {
    for (const block of page.layout) {
      expect(sectionName(block), block.blockType).not.toBe('')
      // A heading, never a block's internal name.
      expect(sectionName(block), block.blockType).not.toBe(block.blockType)
    }
  })
})

describe('the placeholders the code draws itself', () => {
  it('are the footer’s and Find your path’s, as the report lists them', () => {
    const footer = render(<SiteFooter />)
    expect(chips(footer.container)).toEqual(asChips([FIXED_PLACEHOLDERS.footerAffiliation]))
    cleanup()
    const path = render(<FindYourPathPage />)
    expect(chips(path.container)).toEqual(asChips([FIXED_PLACEHOLDERS.mapLine]))
    expect(CODED_PLACEHOLDERS.map(({ id, what, page }) => [id, what, page.path])).toEqual([
      ['I-30', FIXED_PLACEHOLDERS.footerAffiliation.what, '/'],
      ['I-41', FIXED_PLACEHOLDERS.mapLine.what, '/map'],
    ])
  })
})

describe('reading one page', () => {
  it('finds typed placeholders and the ones a block draws, each with its section', () => {
    expect(placeholdersIn(STARTER_PAGES.about!)).toEqual([
      {
        id: 'I-32',
        what: 'the headline, once the years have one wording',
        section: 'Indian Institute of Image Catalysts',
      },
      {
        id: 'I-10',
        what: 'the founder’s photograph, as he wants it published',
        section: 'Gaurang Mistry',
      },
      {
        id: 'I-10',
        what: 'one factual line about Ankvishwa, in his own words',
        section: 'Gaurang Mistry',
      },
      {
        id: 'I-09',
        what: 'who delivers sessions at launch, with names, photographs and credentials as on their certificates',
        section: 'The team',
      },
      {
        id: 'I-38',
        what: 'the organisations IIIC has worked with, once the founder confirms the list',
        section: 'Institutional work',
      },
      { id: 'I-33', what: 'the address as it should print, with its PIN', section: 'Contact' },
    ])
  })

  it('lists the sections awaiting approval and what waits for the lawyer', () => {
    expect(candidateSections(STARTER_PAGES.about!)).toEqual([
      'Gaurang Mistry',
      'The team',
      'Institutional work',
    ])
    expect(candidateSections(STARTER_PAGES.privacy!)).toEqual([])
    expect(legalItems(STARTER_PAGES.privacy!)).toEqual([WHOLE_PAGE])
    expect(legalItems(STARTER_PAGES.counselling!)).toEqual([
      'What a session is, and what it is not',
    ])
    expect(legalItems(STARTER_PAGES.learn!)).toEqual(['The certificate'])
    expect(legalItems(STARTER_PAGES.about!)).toEqual([])
  })

  it('finds two placeholders in one field, and none in ordinary text', () => {
    const layout = [
      {
        blockType: 'statement' as const,
        heading: 'Fake section',
        paragraphs: [
          { text: 'Fake text [[TODO: first thing, I-10]] and [[TODO: second thing, D-16]].' },
          { text: 'No placeholder here, only [brackets] and TODO as a word.' },
        ],
        copyStatus: 'approved' as const,
      },
    ]
    expect(placeholdersIn({ layout })).toEqual([
      { id: 'I-10', what: 'first thing', section: 'Fake section' },
      { id: 'D-16', what: 'second thing', section: 'Fake section' },
    ])
  })
})

describe('the report', () => {
  const sources = [
    { page: ref('Refunds'), content: STARTER_PAGES.refunds! },
    { page: ref('About', true), content: STARTER_PAGES.about! },
    { page: ref('Framework'), content: { layout: [], legalReview: null } },
  ]

  it('lists what is missing by input: inputs before decisions, each by its number', () => {
    const { missing } = buildReport(sources)
    expect(missing.map((row) => row.id)).toEqual([
      'I-04',
      'I-07',
      'I-09',
      'I-10',
      'I-10',
      'I-30',
      'I-32',
      'I-33',
      'I-38',
      'I-41',
      'D-16',
    ])
    const founder = missing.filter((row) => row.id === 'I-10')
    expect(founder.map((row) => [row.page.title, row.page.inAdmin, row.section])).toEqual([
      ['About', true, 'Gaurang Mistry'],
      ['About', true, 'Gaurang Mistry'],
    ])
    // The code's own placeholders are in the list with every page's.
    expect(missing.find((row) => row.id === 'I-30')?.page.title).toBe('Every page')
  })

  it('lists approvals and legal review by page, leaving out pages with nothing waiting', () => {
    const report = buildReport(sources)
    expect(report.candidates).toEqual([
      { page: sources[1]!.page, sections: ['Gaurang Mistry', 'The team', 'Institutional work'] },
    ])
    expect(report.legal).toEqual([{ page: sources[0]!.page, items: [WHOLE_PAGE] }])
  })

  it('is empty, apart from the code’s own placeholders, when no page waits for anything', () => {
    expect(buildReport([], [])).toEqual({ missing: [], candidates: [], legal: [] })
    expect(buildReport([]).missing).toHaveLength(CODED_PLACEHOLDERS.length)
  })
})
