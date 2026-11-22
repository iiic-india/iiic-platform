import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import FindYourPathPage from '@/app/(platform)/(default)/map/page'
import { hasQuestions } from '@/blocks/pageBlocks'
import { RenderBlocks } from '@/components/blocks/PageBlocks'
import { SiteFooter } from '@/components/site/SiteFooter'
import { STARTER_PAGES } from '@/content/starter'
import {
  buildReport,
  candidateSections,
  CODED_PLACEHOLDERS,
  FIXED_PLACEHOLDERS,
  hasStrayBrackets,
  legalItems,
  mistypedPlaceholders,
  placeholdersIn,
  sectionName,
  WHOLE_PAGE,
  type PageRef,
} from '@/lib/content/placeholders'
import type { FaqItem, PageContent } from '@/lib/content/types'

/** A published question, so that a page's questions section is drawn. Obviously fake. */
const FAKE_FAQS: FaqItem[] = [{ id: '1', question: 'Fake question?', answer: 'Fake answer.' }]

// next/image needs Next's loader; the footer's structure is not what is tested here.
vi.mock('next/image', () => ({ default: () => null }))
// Find your path's structured data is drawn by a server component that reads the request
// (tests/unit/seoJsonLd.spec.tsx); it holds no placeholder and is not what is tested here.
vi.mock('@/components/seo/JsonLd', () => ({ JsonLd: () => null }))

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

/** Every placeholder typed into the fake page below, one for each field it fills. */
const typed: string[] = []
const todo = (field: string) => {
  const placeholder = `[[TODO: fake ${field}, I-41]]`
  typed.push(placeholder)
  return placeholder
}

/** A fake page with one block of every type and a placeholder in every field a block draws. */
const EVERY_FIELD: PageContent['layout'] = [
  {
    blockType: 'hero',
    kicker: todo('hero kicker'),
    heading: todo('hero heading'),
    lead: todo('hero lead'),
    primary: { label: todo('hero primary label'), href: '/fake' },
    secondary: { label: todo('hero secondary label'), href: '/fake-two' },
    note: todo('hero note'),
    copyStatus: 'approved',
  },
  {
    blockType: 'doors',
    kicker: todo('doors kicker'),
    heading: todo('doors heading'),
    intro: todo('doors intro'),
    doors: [
      {
        href: '/fake',
        audience: todo('door audience'),
        question: todo('door question'),
        line: todo('door line'),
        outcomes: todo('door outcomes'),
        action: todo('door action'),
      },
    ],
    copyStatus: 'approved',
  },
  {
    blockType: 'statement',
    kicker: todo('statement kicker'),
    heading: todo('statement heading'),
    paragraphs: [{ text: todo('statement paragraph') }],
    action: { label: todo('statement action'), href: '/fake' },
    copyStatus: 'approved',
  },
  {
    blockType: 'steps',
    kicker: todo('steps kicker'),
    heading: todo('steps heading'),
    lead: todo('steps lead'),
    steps: [
      { title: todo('first step title'), text: todo('first step text') },
      { title: todo('second step title') },
    ],
    copyStatus: 'approved',
  },
  {
    blockType: 'comparison',
    kicker: todo('comparison kicker'),
    heading: todo('comparison heading'),
    leftLabel: todo('comparison left label'),
    rightLabel: todo('comparison right label'),
    pairs: [{ left: todo('comparison left'), right: todo('comparison right') }],
    copyStatus: 'approved',
  },
  {
    blockType: 'points',
    kicker: todo('points kicker'),
    heading: todo('points heading'),
    lead: todo('points lead'),
    points: [{ text: todo('point') }],
    copyStatus: 'approved',
  },
  {
    blockType: 'cards',
    kicker: todo('cards kicker'),
    heading: todo('cards heading'),
    intro: todo('cards intro'),
    cards: [
      {
        title: todo('card title'),
        text: todo('card text'),
        href: '/fake',
        action: todo('card action'),
      },
    ],
    copyStatus: 'approved',
  },
  {
    blockType: 'factList',
    kicker: todo('facts kicker'),
    heading: todo('facts heading'),
    facts: [{ statement: todo('fact statement'), source: todo('fact source') }],
    copyStatus: 'approved',
  },
  { blockType: 'scope' },
  { blockType: 'certificate' },
  {
    blockType: 'founderNote',
    kicker: todo('founder kicker'),
    heading: todo('founder heading'),
    note: todo('founder note'),
    attribution: todo('founder attribution'),
    copyStatus: 'approved',
  },
  { blockType: 'contact' },
  { blockType: 'legal' },
  {
    blockType: 'band',
    kicker: todo('band kicker'),
    heading: todo('band heading'),
    lead: todo('band lead'),
    translation: todo('band translation'),
    primary: { label: todo('band label'), href: '/fake' },
    copyStatus: 'approved',
  },
]

const fakeStatement = {
  blockType: 'statement' as const,
  heading: 'Fake section',
  paragraphs: [{ text: 'Fake text' }],
  copyStatus: 'approved' as const,
}

describe.each(Object.entries(STARTER_PAGES))('what the report reads on "%s"', (_, page) => {
  it('is exactly what the page draws: every placeholder, marker and draft label', () => {
    // Drawn with its questions section showing, as it does once a question is published.
    const { container } = render(
      <RenderBlocks
        layout={page.layout}
        legalReview={page.legalReview}
        faqs={hasQuestions(page.layout) ? FAKE_FAQS : []}
      />,
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

describe('every text field a block draws', () => {
  it('draws a placeholder as the chip, and the report lists exactly those', () => {
    const { container } = render(<RenderBlocks layout={EVERY_FIELD} />)
    expect(chips(container)).toEqual(asChips(placeholdersIn({ layout: EVERY_FIELD })))
    // Each typed placeholder, the two the blocks draw themselves (the founder's photograph and
    // the contact address), and the legal information's seven while the settings hold none of
    // it. None is left out of both, and none is drawn as plain text.
    expect(chips(container)).toHaveLength(typed.length + 2 + 7)
    expect(container.textContent?.match(/\[\[TODO:/g)).toHaveLength(typed.length + 2 + 7)
  })

  it('reports nothing from the admin’s block name, which the page never draws', () => {
    const named = { ...fakeStatement, blockName: '[[TODO: fake, I-41]]' }
    expect(placeholdersIn({ layout: [named] })).toEqual([])
    expect(mistypedPlaceholders([{ ...fakeStatement, blockName: '[[TODO: fake]]' }])).toEqual([])
  })
})

describe('a placeholder typed another way', () => {
  it('is found, so that a page holding one is refused', () => {
    for (const text of [
      '[[TODO: the PIN]]',
      '[[TODO: the PIN, i-33]]',
      '[[TODO:the PIN, I-33]]',
      'x ]]',
    ]) {
      expect(hasStrayBrackets(text), text).toBe(true)
    }
    for (const text of ['[[TODO: the PIN, I-33]]', 'Fake [brackets]', '']) {
      expect(hasStrayBrackets(text), text).toBe(false)
    }
    const mistyped = { ...fakeStatement, paragraphs: [{ text: 'Fake [[TODO: the PIN]]' }] }
    expect(mistypedPlaceholders([fakeStatement, mistyped])).toEqual(['Fake [[TODO: the PIN]]'])
  })
})

describe('the placeholders the code draws itself', () => {
  it('are the footer’s and Find your path’s, as the report lists them', () => {
    const { footerAffiliation, footerLegalName, footerGstin, footerGrievanceOfficer, mapLine } =
      FIXED_PLACEHOLDERS
    const footer = render(<SiteFooter />)
    expect(chips(footer.container)).toEqual(
      asChips([footerAffiliation, footerLegalName, footerGstin, footerGrievanceOfficer]),
    )
    cleanup()
    const path = render(<FindYourPathPage />)
    expect(chips(path.container)).toEqual(asChips([mapLine]))
    expect(CODED_PLACEHOLDERS.map(({ id, what, page }) => [id, what, page.path])).toEqual([
      ['I-30', footerAffiliation.what, '/'],
      ['I-26', footerLegalName.what, '/'],
      ['I-05', footerGstin.what, '/'],
      ['I-21', footerGrievanceOfficer.what, '/'],
      ['I-41', mapLine.what, '/map'],
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
      'I-05',
      'I-07',
      'I-07',
      'I-09',
      'I-10',
      'I-10',
      'I-21',
      'I-26',
      'I-30',
      'I-32',
      'I-33',
      'I-38',
      'I-41',
    ])
    // A placeholder names a decision only where no input can supply what is missing (D-56);
    // the report lists those after the inputs.
    const both = {
      ...fakeStatement,
      paragraphs: [{ text: '[[TODO: fake decision, D-99]] [[TODO: fake input, I-99]]' }],
    }
    const decided = buildReport([{ page: ref('Fake'), content: { layout: [both] } }], [])
    expect(decided.missing.map((row) => row.id)).toEqual(['I-99', 'D-99'])
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
