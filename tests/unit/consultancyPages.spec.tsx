import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { hasQuestions, uniqueAnchors } from '@/blocks/pageBlocks'
import { RenderBlocks } from '@/components/blocks/PageBlocks'
import { STARTER_PAGES, starterAt } from '@/content/starter'
import {
  BRAND_POSITIONING,
  CONSULTANCY_OFFER_PAGES,
  MARKETING_AND_SALES,
  ORGANISATION_PLANNING,
  TEAM_MAP_PAGE,
} from '@/content/starter/consultancyOffers'
import { placeholdersIn } from '@/lib/content/placeholders'
import { pagePath } from '@/lib/content/slug'
import type { FaqItem, PageContent } from '@/lib/content/types'
import { doorFor } from '@/lib/map/stepZero'
import { pageGraph } from '@/lib/seo/schema'
import { CONSULTANCY_AUDIENCE, CONSULTANCY_SERVICES, TEAM_MAP } from '@/lib/site/consultancy'
import type { CardsBlock } from '@/payload-types'

// The consultancy's pages under /organisations/ (docs/02; copy architecture §4.4): the three
// services docs/09 names and the Team Map, as starter pages (D-51), with their search titles
// (D-65), their Service node (D-62) and their questions section. Fake questions only.
afterEach(cleanup)

const ORIGIN = 'https://fake.example'
const keywordMap = readFileSync(join(process.cwd(), 'docs/content/keyword-map.md'), 'utf8')

/** Questions as the CMS would publish them. Obviously fake. */
const FAKE_FAQS: FaqItem[] = [
  { id: '1', question: 'Fake first question?', answer: 'Fake first answer.\nFake second line.' },
  { id: '2', question: 'Fake second question?', answer: 'Fake second answer.' },
]

/** A price as a page would print it: rupees, "Rs" or a sum in paise. */
const PRICE = /₹|\bRs\.?\s?\d|\bINR\b|\bpaise\b|\bfees?\b/i

describe('the pages under /organisations/', () => {
  it('are the three services docs/09 names and the Team Map, each a starter page there', () => {
    expect(CONSULTANCY_OFFER_PAGES.map((page) => page.slug)).toEqual([
      'organisations/organisation-planning',
      'organisations/marketing-and-sales',
      'organisations/brand-positioning',
      'organisations/team-map',
    ])
    for (const page of CONSULTANCY_OFFER_PAGES) expect(starterAt(page.slug)).toBe(page)
    expect(CONSULTANCY_SERVICES.map((service) => service.name)).toEqual([
      'Organisation planning',
      'Marketing and sales',
      'Brand positioning',
    ])
  })

  it('carry the search titles and descriptions of docs/content/keyword-map.md (D-65)', () => {
    for (const page of [ORGANISATION_PLANNING, MARKETING_AND_SALES, BRAND_POSITIONING]) {
      expect(keywordMap, page.title).toContain(`"${page.title}"`)
      // The map writes IIIC's with a straight apostrophe; the page sets it as type.
      expect(keywordMap, page.description ?? '').toContain(
        `"${(page.description ?? '').replace('’', "'")}"`,
      )
    }
    expect(keywordMap).toContain(`"${TEAM_MAP_PAGE.title}"`)
  })

  it('never call brand positioning image consulting', () => {
    const text = JSON.stringify(BRAND_POSITIONING)
    expect(text).not.toMatch(/image consult/i)
  })

  it('open with the service’s name and book a proposal call, as the organisations page does', () => {
    for (const [page, service] of [
      [ORGANISATION_PLANNING, CONSULTANCY_SERVICES[0]],
      [MARKETING_AND_SALES, CONSULTANCY_SERVICES[1]],
      [BRAND_POSITIONING, CONSULTANCY_SERVICES[2]],
    ] as const) {
      const hero = page.layout[0]
      expect(hero?.blockType).toBe('hero')
      expect(hero && 'heading' in hero ? hero.heading : '').toBe(service?.name)
      expect(hero && 'primary' in hero ? hero.primary : null).toEqual({
        label: 'Book a proposal call',
        href: '/book/call',
      })
    }
  })

  it('leave what each service is to IIIC (I-11), and what the Team Map is (I-12)', () => {
    for (const page of [ORGANISATION_PLANNING, MARKETING_AND_SALES, BRAND_POSITIONING]) {
      expect(placeholdersIn(page).map((placeholder) => placeholder.id)).toEqual(['I-11'])
    }
    expect(new Set(placeholdersIn(TEAM_MAP_PAGE).map((placeholder) => placeholder.id))).toEqual(
      new Set(['I-12', 'I-22']),
    )
    // The request form waits only on its consent text (I-22): once one is in force, it is drawn.
    const withNotice = placeholdersIn(TEAM_MAP_PAGE, undefined, true)
    expect(new Set(withNotice.map((placeholder) => placeholder.id))).toEqual(new Set(['I-12']))
  })

  it('lead from the Team Map’s hero to its request form (docs/17 §6)', () => {
    const hero = TEAM_MAP_PAGE.layout[0]
    expect(hero && 'primary' in hero ? hero.primary : null).toEqual({
      label: 'Request a Team Map',
      href: '/organisations/team-map#team-map-request',
    })
    // The form's block carries that id itself (src/components/blocks/PageBlocks.tsx).
    expect(TEAM_MAP_PAGE.layout.some((block) => block.blockType === 'teamMapRequest')).toBe(true)
  })

  it('each have a questions section, drawn only once IIIC publishes a question', () => {
    for (const page of CONSULTANCY_OFFER_PAGES)
      expect(hasQuestions(page.layout), page.slug).toBe(true)
  })

  it.each(CONSULTANCY_OFFER_PAGES.map((page) => [page.slug, page] as const))(
    '%s shows no price, drawn as a visitor sees it (D-21)',
    (_, page) => {
      const { container } = render(<RenderBlocks layout={page.layout} faqs={FAKE_FAQS} />)
      expect(container.textContent).not.toMatch(PRICE)
    },
  )
})

describe('the organisations page', () => {
  it('links each of its services to the service’s own page, and the Team Map to its page', () => {
    const organisations = STARTER_PAGES.organisations!
    const cards = organisations.layout.find(
      (block): block is CardsBlock => block.blockType === 'cards',
    )
    const links = Object.fromEntries((cards?.cards ?? []).map((card) => [card.title, card.href]))
    for (const service of CONSULTANCY_SERVICES) {
      expect(links[service.name], service.name).toBe(`/${service.slug}`)
    }
    expect(JSON.stringify(organisations.layout)).toContain(`"href":"/${TEAM_MAP.slug}"`)
  })
})

describe('Find your path', () => {
  it('sends an organisation to the Team Map page, which now exists (docs/03 F1)', () => {
    const door = doorFor('organisation')
    expect(door).toBe('/organisations/team-map')
    expect(starterAt((door ?? '').slice(1))).toBe(TEAM_MAP_PAGE)
  })
})

describe('the structured data of the pages under /organisations/ (D-62)', () => {
  const graphOf = (page: PageContent, faqs: FaqItem[] = []) =>
    pageGraph(
      { path: pagePath(page.slug), title: page.title, description: page.description, faqs },
      ORIGIN,
    )['@graph']

  it.each(CONSULTANCY_OFFER_PAGES.map((page) => [page.slug, page] as const))(
    '%s names its service, its provider by @id and its audience, and no offer or price',
    (slug, page) => {
      const services = graphOf(page).filter((node) => node['@type'] === 'Service')
      expect(services).toHaveLength(1)
      const offer = [...CONSULTANCY_SERVICES, TEAM_MAP].find((entry) => entry.slug === slug)
      expect(services[0]).toEqual({
        '@type': 'Service',
        '@id': `${ORIGIN}/${slug}#service`,
        name: offer?.name,
        serviceType: 'Business and management consultancy',
        provider: { '@id': `${ORIGIN}/#organization` },
        audience: { '@type': 'BusinessAudience', audienceType: CONSULTANCY_AUDIENCE },
      })
      const text = JSON.stringify(graphOf(page))
      expect(text).not.toMatch(/"offers"|"price|priceSpecification/)
      expect(text).not.toMatch(PRICE)
    },
  )

  it('carries a FAQPage only around the questions the page shows', () => {
    expect(graphOf(TEAM_MAP_PAGE).filter((node) => node['@type'] === 'FAQPage')).toEqual([])
    const faq = graphOf(TEAM_MAP_PAGE, FAKE_FAQS).filter((node) => node['@type'] === 'FAQPage')
    expect(faq).toHaveLength(1)
    expect(faq[0]?.mainEntity).toEqual(
      FAKE_FAQS.map(({ question, answer }) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer },
      })),
    )
  })

  it('leaves out a question or an answer that is empty or still a placeholder', () => {
    const faqs: FaqItem[] = [
      { id: '1', question: '[[TODO: fake question, I-20]]', answer: 'Fake answer.' },
      { id: '2', question: 'Fake question?', answer: '   ' },
    ]
    expect(graphOf(TEAM_MAP_PAGE, faqs).filter((node) => node['@type'] === 'FAQPage')).toEqual([])
  })
})

describe('the questions section', () => {
  const layout: PageContent['layout'] = [
    { blockType: 'hero', heading: 'Fake heading', copyStatus: 'approved' },
    { blockType: 'faq', heading: 'Fake questions', anchor: 'fake-faq', copyStatus: 'candidate' },
  ]

  it('draws nothing while no question is published for the page', () => {
    const { container } = render(<RenderBlocks layout={layout} />)
    expect(screen.queryByRole('heading', { name: 'Fake questions' })).toBeNull()
    expect(container.querySelector('details')).toBeNull()
    expect(container.querySelector('[data-candidate]')).toBeNull()
  })

  it('draws each question as the kit’s accordion, which opens without JavaScript', () => {
    const { container } = render(<RenderBlocks layout={layout} faqs={FAKE_FAQS} />)
    const section = container.querySelector('section#fake-faq') as HTMLElement
    expect(within(section).getByRole('heading', { name: 'Fake questions' })).toBeTruthy()
    const items = [...section.querySelectorAll('details.iiic-accordion')]
    expect(items.map((item) => item.querySelector('summary')?.textContent)).toEqual([
      'Fake first question?',
      'Fake second question?',
    ])
    // An answer is a paragraph a line, in the accordion's own panel.
    expect(
      [...(items[0]?.querySelectorAll(':scope > div > p') ?? [])].map((p) => p.textContent),
    ).toEqual(['Fake first answer.', 'Fake second line.'])
    // Closed until opened: nothing is shown open for the visitor.
    for (const item of items) expect(item.hasAttribute('open')).toBe(false)
    expect(section.querySelector('[data-candidate="I-41"]')).not.toBeNull()
  })

  it('comes once a page at most', () => {
    const faq = { blockType: 'faq' }
    expect(uniqueAnchors([faq])).toBe(true)
    expect(uniqueAnchors([faq, faq])).toMatch(/at most/)
  })
})
