import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { RenderBlocks } from '@/components/blocks/PageBlocks'
import { renderText } from '@/components/blocks/text'
import { FRAMEWORK, FRAMEWORK_IIIC_LINES } from '@/content/starter/framework'
import { HOME, HOME_IIIC_LINES } from '@/content/starter/home'
import type { PageContent } from '@/lib/content/types'

afterEach(cleanup)

describe('renderText', () => {
  it('shows text exactly as written', () => {
    expect(renderText('Know thyself')).toBe('Know thyself')
    expect(renderText('')).toBeNull()
    expect(renderText(null)).toBeNull()
  })

  it('draws each placeholder as the kit’s chip, with the input it waits on', () => {
    const { container } = render(
      <p>{renderText('Fee: [[TODO: course fee, I-07]] from [[TODO: start date, D-21]].')}</p>,
    )
    const chips = [...container.querySelectorAll('.iiic-todo')]
    expect(chips.map((chip) => chip.getAttribute('data-todo'))).toEqual(['I-07', 'D-21'])
    expect(chips.map((chip) => chip.textContent)).toEqual([
      '[[TODO: course fee, I-07]]',
      '[[TODO: start date, D-21]]',
    ])
    expect(container.textContent).toBe(
      'Fee: [[TODO: course fee, I-07]] from [[TODO: start date, D-21]].',
    )
  })
})

describe('the home starter page, drawn', () => {
  const draw = () => render(<RenderBlocks layout={HOME.layout} />)

  it('has one h1, the candidate headline', () => {
    draw()
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([
      'Know Yourself. Every Answer Follows.',
    ])
  })

  it('opens three doors, each with IIIC’s own line for its vertical', () => {
    const { container } = draw()
    const doors = [...container.querySelectorAll<HTMLAnchorElement>('a.iiic-card-door')]
    expect(doors.map((door) => door.getAttribute('href'))).toEqual([
      '/counselling',
      '/organisations',
      '/learn',
    ])
    expect(doors[0]?.textContent).toContain(HOME_IIIC_LINES.counselling)
    expect(doors[1]?.textContent).toContain(HOME_IIIC_LINES.consultancy)
    expect(doors[2]?.textContent).toContain(HOME_IIIC_LINES.education)
    // The glyph is decoration: a screen reader hears the words, not a stray letter.
    for (const door of doors) {
      expect(door.querySelector('.iiic-door-glyph')?.getAttribute('aria-hidden')).toBe('true')
    }
  })

  it('states the framework in IIIC’s words and lists the four steps', () => {
    const { container } = draw()
    expect(screen.getByText(HOME_IIIC_LINES.framework)).toBeTruthy()
    expect(
      [...container.querySelectorAll('ol.iiic-steps > li')].map((step) => step.textContent),
    ).toEqual(['Observe', 'Understand', 'Choose', 'Own'])
  })

  it('shows unsupplied facts as placeholders, never as copy', () => {
    const { container } = draw()
    const waiting = [...container.querySelectorAll('.iiic-todo')].map((chip) =>
      chip.getAttribute('data-todo'),
    )
    expect(waiting.sort()).toEqual(['I-10', 'I-10', 'I-38', 'I-41'])
    expect(container.textContent).not.toMatch(/₹|\bRs\b/)
  })

  it('marks every block whose wording IIIC has not approved yet (I-41)', () => {
    const { container } = draw()
    expect(container.querySelectorAll('[data-candidate="I-41"]')).toHaveLength(
      HOME.layout.filter((block) => block.copyStatus === 'candidate').length,
    )
  })

  it('closes with the one yellow band, outside the page column, with the signature line', () => {
    const { container } = draw()
    const bands = [...container.querySelectorAll('.iiic-band-yellow')]
    expect(bands).toHaveLength(1)
    const band = bands[0] as HTMLElement
    expect(band.closest('.iiic-page')).toBeNull()
    const sanskrit = band.querySelector('[lang="sa"]')
    expect(sanskrit?.textContent).toBe('आत्मानं विद्धि')
    expect(band.textContent).toContain('आत्मानं विद्धि · Know thyself')
    // The band repeats the hero's action, in the same words.
    const action = within(band).getByRole('link', { name: 'Find your path' })
    expect(action.getAttribute('href')).toBe('/map')
    expect(screen.getAllByRole('link', { name: 'Find your path' })).toHaveLength(2)
  })
})

describe('approved copy', () => {
  it('carries no marker', () => {
    const layout: PageContent['layout'] = [
      { blockType: 'hero', heading: 'Fake approved heading', copyStatus: 'approved' },
      { blockType: 'band', heading: 'Fake approved band', copyStatus: 'approved' },
    ]
    const { container } = render(<RenderBlocks layout={layout} />)
    expect(container.querySelectorAll('[data-candidate]')).toHaveLength(0)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Fake approved heading')
  })
})

describe('the framework starter page, drawn', () => {
  const draw = () => render(<RenderBlocks layout={FRAMEWORK.layout} />)

  it('sets Object against Subject as a table a screen reader can follow', () => {
    draw()
    const table = screen.getByRole('table')
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Living as the object', 'Living as the subject'])
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(5)
    expect(rows[0]?.textContent).toBe('Life happens to meI shape how I meet life')
    // The kit's wrapper lets a narrow screen scroll the table, never the page.
    expect(table.parentElement?.className).toContain('iiic-table-wrap')
  })

  it('lists what changes in IIIC’s words, after the line they follow', () => {
    const { container } = draw()
    expect(screen.getByText(FRAMEWORK_IIIC_LINES.move)).toBeTruthy()
    expect(
      [...container.querySelectorAll('.iiic-prose ul > li')].map((li) => li.textContent),
    ).toEqual([
      FRAMEWORK_IIIC_LINES.decisions,
      FRAMEWORK_IIIC_LINES.reasoning,
      FRAMEWORK_IIIC_LINES.discipline,
      FRAMEWORK_IIIC_LINES.trueSelf,
      FRAMEWORK_IIIC_LINES.goals,
    ])
  })

  it('shows the three applications in the order of IIIC’s diagram, under its own line', () => {
    const { container } = draw()
    const doors = [...container.querySelectorAll<HTMLAnchorElement>('a.iiic-card-door')]
    expect(doors.map((door) => door.getAttribute('href'))).toEqual([
      '/learn',
      '/organisations',
      '/counselling',
    ])
    expect(doors.map((door) => door.querySelector('h3')?.textContent)).toEqual([
      'Education',
      'Business & Management',
      'Counselling',
    ])
    expect(
      screen.getByText(FRAMEWORK_IIIC_LINES.foundation).closest('.iiic-section-head'),
    ).not.toBeNull()
  })

  it('leaves IIIC’s own section unmarked and marks the candidate ones', () => {
    const { container } = draw()
    expect(container.querySelectorAll('[data-candidate="I-41"]')).toHaveLength(
      FRAMEWORK.layout.filter((block) => block.copyStatus === 'candidate').length,
    )
    const own = screen.getByRole('heading', { level: 2, name: 'Human transformation' })
    expect(own.closest('section')?.querySelector('[data-candidate]')).toBeNull()
  })

  it('keeps one h1 and never skips a heading level', () => {
    const { container } = draw()
    const levels = [...container.querySelectorAll('h1, h2, h3, h4')].map((h) =>
      Number(h.tagName[1]),
    )
    expect(levels.filter((level) => level === 1)).toHaveLength(1)
    expect(levels[0]).toBe(1)
    levels.reduce((previous, level) => {
      expect(level - previous).toBeLessThanOrEqual(1)
      return level
    })
  })
})
