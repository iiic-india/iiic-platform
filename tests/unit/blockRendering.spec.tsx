import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import styles from '@/components/blocks/blocks.module.css'
import { RenderBlocks } from '@/components/blocks/PageBlocks'
import { FRAMEWORK } from '@/content/starter/framework'
import { LEGAL } from '@/content/starter/legal'
import { placeholdersIn } from '@/lib/content/placeholders'
import type { PageContent } from '@/lib/content/types'
import { CRISIS_HEADING, CRISIS_LINES } from '@/lib/counselling/scope'
import { LEGAL_INFORMATION_HEADING, legalRows, NO_LEGAL_INFORMATION } from '@/lib/settings/legal'
import type { ComparisonBlock } from '@/payload-types'

afterEach(cleanup)

/** A chip as the site draws it: "[[TODO: what, I-xx]]" with its input as an attribute. */
const chips = (container: HTMLElement) =>
  [...container.querySelectorAll('.iiic-todo')]
    .map((chip) => `${chip.getAttribute('data-todo')}|${chip.textContent}`)
    .sort()

const asChips = (placeholders: { id: string; what: string }[]) =>
  placeholders.map(({ id, what }) => `${id}|[[TODO: ${what}, ${id}]]`).sort()

/** A fake placeholder for one field, so that every chip says which field drew it. */
const todo = (field: string) => `[[TODO: fake ${field}, I-41]]`

/** One block of every type, with a placeholder in every text field a visitor sees. */
const EVERY_FIELD: PageContent['layout'] = [
  {
    blockType: 'hero',
    kicker: todo('hero kicker'),
    heading: todo('hero heading'),
    lead: todo('hero lead'),
    primary: { label: todo('hero primary label'), href: '/fake-primary' },
    secondary: { label: todo('hero secondary label'), href: '/fake-secondary' },
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
        glyph: 'F',
        audience: todo('door audience'),
        href: '/fake-door',
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
    action: { label: todo('statement action label'), href: '/fake-statement' },
    copyStatus: 'approved',
  },
  {
    blockType: 'steps',
    kicker: todo('steps kicker'),
    heading: todo('steps heading'),
    lead: todo('steps lead'),
    steps: [{ title: todo('step title'), text: todo('step text') }],
    copyStatus: 'approved',
  },
  {
    blockType: 'comparison',
    kicker: todo('comparison kicker'),
    heading: todo('comparison heading'),
    leftLabel: todo('comparison leftLabel'),
    rightLabel: todo('comparison rightLabel'),
    pairs: [{ left: todo('comparison left'), right: todo('comparison right') }],
    copyStatus: 'approved',
  },
  {
    blockType: 'points',
    kicker: todo('points kicker'),
    heading: todo('points heading'),
    lead: todo('points lead'),
    points: [{ text: todo('point text') }],
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
        href: '/fake-card',
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
    sanskrit: 'आत्मानं विद्धि',
    translation: todo('band translation'),
    primary: { label: todo('band primary label'), href: '/fake-band' },
    copyStatus: 'approved',
  },
]

describe('a placeholder in any field a visitor sees', () => {
  it('draws a placeholder in every text field as the chip, and reports exactly those', () => {
    const { container } = render(<RenderBlocks layout={EVERY_FIELD} />)
    expect(asChips(placeholdersIn({ layout: EVERY_FIELD }))).toEqual(chips(container))
    // The 52 typed placeholders, the two the founder's note and the contact section draw, and
    // the seven of the legal information while the settings hold none of it.
    expect(chips(container)).toHaveLength(61)
    // None is left as raw text.
    const page = container.cloneNode(true) as HTMLElement
    for (const chip of page.querySelectorAll('.iiic-todo')) chip.remove()
    expect(page.textContent).not.toMatch(/\[\[|\]\]/)
  })

  it('draws the words of every button inside its link', () => {
    render(<RenderBlocks layout={EVERY_FIELD} />)
    const hrefs = (field: string) =>
      screen.getAllByRole('link', { name: todo(field) }).map((link) => link.getAttribute('href'))
    expect(hrefs('hero primary label')).toEqual(['/fake-primary'])
    expect(hrefs('hero secondary label')).toEqual(['/fake-secondary'])
    expect(hrefs('statement action label')).toEqual(['/fake-statement'])
    expect(hrefs('band primary label')).toEqual(['/fake-band'])
    // A door and a card are links as a whole; their button is the words inside.
    for (const [field, href] of [
      ['door action', '/fake-door'],
      ['card action', '/fake-card'],
    ] as const) {
      const chip = screen.getByText(todo(field))
      expect(chip.closest('.iiic-btn')).not.toBeNull()
      expect(chip.closest('a')?.getAttribute('href')).toBe(href)
    }
  })

  it('keeps the Sanskrit line as typed, and its translation outside it', () => {
    const { container } = render(<RenderBlocks layout={EVERY_FIELD} />)
    const band = container.querySelector('.iiic-band-yellow') as HTMLElement
    expect(band.querySelector('[lang="sa"]')?.textContent).toBe('आत्मानं विद्धि')
    expect(band.querySelector('[lang="sa"] .iiic-todo')).toBeNull()
    expect(within(band).getByText(todo('band translation')).closest('[lang="sa"]')).toBeNull()
  })

  it('reads no placeholder from the admin’s block name or a row id, which no page shows', () => {
    const fakeStatement = {
      blockType: 'statement' as const,
      heading: 'Fake statement',
      paragraphs: [{ text: 'Fake paragraph', id: '[[TODO: fake, I-41]]' }],
      copyStatus: 'approved' as const,
    }
    expect(
      placeholdersIn({ layout: [{ ...fakeStatement, blockName: '[[TODO: fake, I-41]]' }] }),
    ).toEqual([])
  })
})

/** The comparison a page sets out. */
const comparisonOf = (page: PageContent) => {
  const block = page.layout.find(
    (candidate): candidate is ComparisonBlock => candidate.blockType === 'comparison',
  )
  if (!block) throw new Error(`${page.slug} has no comparison`)
  return block
}

describe('a comparison', () => {
  it('heads each row with its first line, so a screen reader reads each pair together', () => {
    render(<RenderBlocks layout={FRAMEWORK.layout} />)
    const table = screen.getByRole('table')
    expect(
      within(table)
        .getAllByRole('rowheader')
        .map((cell) => cell.textContent),
    ).toEqual(comparisonOf(FRAMEWORK).pairs.map((pair) => pair.left))
    expect(within(table).getAllByRole('rowheader')[0]?.textContent).toBe('Life happens to me')
    // The columns stay headed as before, and each row keeps one value cell. A row's heading
    // keeps the look of a body cell, not of the column headings.
    expect(within(table).getAllByRole('columnheader')).toHaveLength(2)
    for (const row of within(table).getAllByRole('row').slice(1)) {
      const heads = [...row.querySelectorAll('th[scope="row"]')]
      expect(heads).toHaveLength(1)
      expect(heads[0]?.className).toBe(styles.rowHead)
      expect(row.querySelectorAll('td')).toHaveLength(1)
    }
  })

  it('heads each line of the legal information table with its label, as a comparison does', () => {
    render(<RenderBlocks layout={LEGAL.layout} legalReview={LEGAL.legalReview} />)
    const labels = screen.getAllByRole('rowheader').map((cell) => cell.textContent)
    expect(labels).toEqual(legalRows(NO_LEGAL_INFORMATION).map((row) => row.item))
    expect(labels).toContain('Grievance officer')
    const region = screen.getByRole('region', { name: LEGAL_INFORMATION_HEADING })
    expect(region.getAttribute('tabindex')).toBe('0')
    expect(region.className.split(' ')).toEqual(['iiic-table-wrap', styles.tableRegion])
    for (const row of within(region).getAllByRole('row').slice(1)) {
      expect(row.querySelector('th[scope="row"]')?.className).toBe(styles.rowHead)
    }
  })

  it('scrolls inside a region that keyboard focus reaches and that shows the kit’s ring', () => {
    render(<RenderBlocks layout={FRAMEWORK.layout} />)
    const region = screen.getByRole('region', { name: comparisonOf(FRAMEWORK).heading })
    expect(region.getAttribute('tabindex')).toBe('0')
    // The kit's wrapper, and the class that gives it the ring; the ring itself is checked in a
    // browser (site.e2e.spec.ts, the framework page).
    expect(region.className.split(' ')).toEqual(['iiic-table-wrap', styles.tableRegion])
    expect(region.querySelector('table')).not.toBeNull()
  })
})

describe('the crisis numbers', () => {
  const draw = () => {
    const { container } = render(<RenderBlocks layout={[{ blockType: 'scope' }]} />)
    return container.querySelector('#scope') as HTMLElement
  }

  it('name the line each number calls, for someone moving through the links', () => {
    const scope = draw()
    const links = [...scope.querySelectorAll<HTMLAnchorElement>('a[href^="tel:"]')]
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['14416, Tele-MANAS', 'tel:14416'],
      ['1-800-891-4416, Tele-MANAS', 'tel:18008914416'],
      ['112, Emergencies', 'tel:112'],
      ['1098, Children', 'tel:1098'],
    ])
    expect(links).toHaveLength(CRISIS_LINES.flatMap((line) => line.numbers).length)
    // The line's name is for a screen reader only, after the number the link starts with.
    for (const link of links) {
      expect(link.firstChild?.textContent).toMatch(/^[\d-]+$/)
      expect(link.querySelector('.iiic-sr-only')?.textContent).toMatch(/^, /)
    }
  })

  it('read on screen exactly as before', () => {
    const shown = draw().cloneNode(true) as HTMLElement
    for (const hidden of shown.querySelectorAll('.iiic-sr-only')) hidden.remove()
    expect(within(shown).getByRole('heading', { level: 3 }).textContent).toBe(CRISIS_HEADING)
    expect([...shown.querySelectorAll('li')].map((item) => item.textContent)).toEqual([
      'Tele-MANAS: 14416 or 1-800-891-4416 (free, 24×7)',
      'Emergencies: 112',
      'Children: 1098',
    ])
  })
})

describe('a hero', () => {
  it('draws its small print after its buttons, so a button’s words stand on their own', () => {
    const { container } = render(
      <RenderBlocks
        layout={[
          {
            blockType: 'hero',
            heading: 'Fake heading',
            primary: { label: 'Fake primary', href: '/fake-primary' },
            secondary: { label: 'Fake secondary', href: '/fake-secondary' },
            note: 'Fake note.',
            copyStatus: 'approved',
          },
        ]}
      />,
    )
    const hero = container.querySelector('.iiic-hero') as HTMLElement
    const row = hero.querySelector('.iiic-row') as HTMLElement
    expect(
      within(row)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Fake primary', 'Fake secondary'])
    expect(row.nextElementSibling?.textContent).toBe('Fake note.')
  })
})
