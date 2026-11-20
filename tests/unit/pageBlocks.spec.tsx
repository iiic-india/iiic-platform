import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { RenderBlocks } from '@/components/blocks/PageBlocks'
import { renderText } from '@/components/blocks/text'
import { COUNSELLING, COUNSELLING_IIIC_LINES } from '@/content/starter/counselling'
import { FRAMEWORK, FRAMEWORK_IIIC_LINES } from '@/content/starter/framework'
import { HOME, HOME_IIIC_LINES } from '@/content/starter/home'
import { LEARN, LEARN_IIIC_LINES, PDEU_WORKSHOP } from '@/content/starter/learn'
import { ORGANISATIONS, ORGANISATIONS_IIIC_LINES } from '@/content/starter/organisations'
import { CERTIFICATE_STATEMENT } from '@/lib/certificates/statement'
import type { PageContent } from '@/lib/content/types'
import { CRISIS_LINES, SCOPE_STATEMENT } from '@/lib/counselling/scope'

afterEach(cleanup)

/** How many blocks of a page carry copy IIIC has not approved yet. */
const candidates = (layout: PageContent['layout']) =>
  layout.filter((block) => 'copyStatus' in block && block.copyStatus === 'candidate').length

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
      candidates(HOME.layout),
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
      candidates(FRAMEWORK.layout),
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

describe('the organisations starter page, drawn', () => {
  const draw = () => render(<RenderBlocks layout={ORGANISATIONS.layout} />)

  it('sets out IIIC’s three pillars in IIIC’s sentences, then the services awaiting copy', () => {
    const { container } = draw()
    const cards = [...container.querySelectorAll('.iiic-grid > .iiic-card')]
    expect(cards.map((card) => card.querySelector('h3')?.textContent)).toEqual([
      'People',
      'Processes',
      'Culture',
      'Organisation planning',
      'Marketing and sales',
      'Brand positioning',
    ])
    expect(cards[0]?.textContent).toContain(ORGANISATIONS_IIIC_LINES.people)
    expect(cards[1]?.textContent).toContain(ORGANISATIONS_IIIC_LINES.processes)
    expect(cards[2]?.textContent).toContain(ORGANISATIONS_IIIC_LINES.culture)
    // Three to a row on the kit’s twelve-column grid.
    for (const card of cards) expect(card.className).toContain('iiic-span-4')
    // What each service offers is IIIC’s to say (I-11): a placeholder, never copy.
    for (const card of cards.slice(3)) {
      expect(card.querySelector('.iiic-todo')?.getAttribute('data-todo')).toBe('I-11')
    }
    // A card without a link is an article, not a link to nowhere.
    expect(cards.every((card) => card.tagName === 'ARTICLE')).toBe(true)
  })

  it('asks for the proposal call in the hero and again in the band, in IIIC’s closing words', () => {
    const { container } = draw()
    const calls = screen.getAllByRole('link', { name: 'Book a proposal call' })
    expect(calls).toHaveLength(2)
    for (const call of calls) expect(call.getAttribute('href')).toBe('/book/call')
    const band = container.querySelector('.iiic-band-yellow') as HTMLElement
    expect(band.textContent).toContain(ORGANISATIONS_IIIC_LINES.sustainable)
    expect(band.textContent).toContain('Leadership · Systems · Culture')
  })

  it('leaves the Team Map’s description to IIIC and offers the request', () => {
    const { container } = draw()
    const waiting = [...container.querySelectorAll('.iiic-todo')].map((chip) =>
      chip.getAttribute('data-todo'),
    )
    expect(waiting.sort()).toEqual(['I-11', 'I-11', 'I-11', 'I-12'])
    const request = screen.getByRole('link', { name: 'Request a Team Map' })
    expect(request.getAttribute('href')).toBe('/organisations/team-map')
  })
})

describe('cards', () => {
  it('links a card that has somewhere to go, and sizes the row to its cards', () => {
    const layout: PageContent['layout'] = [
      {
        blockType: 'cards',
        heading: 'Fake cards',
        cards: [
          { title: 'Fake one', href: '/fake-one', action: 'Fake action' },
          { title: 'Fake two' },
        ],
        copyStatus: 'approved',
      },
    ]
    const { container } = render(<RenderBlocks layout={layout} />)
    const [first, second] = [...container.querySelectorAll('.iiic-grid > .iiic-card')]
    expect(first?.tagName).toBe('A')
    expect(first?.getAttribute('href')).toBe('/fake-one')
    expect(first?.textContent).toContain('Fake action')
    expect(second?.tagName).toBe('ARTICLE')
    expect(first?.className).toContain('iiic-span-6')
  })
})

describe('the counselling starter page, drawn', () => {
  const draw = () => render(<RenderBlocks layout={COUNSELLING.layout} />)

  it('carries the scope statement in its fixed wording, marked as a draft for the lawyer', () => {
    const { container } = draw()
    const scope = container.querySelector('#scope') as HTMLElement
    for (const sentence of SCOPE_STATEMENT) expect(scope.textContent).toContain(sentence)
    expect(scope.querySelector('[data-draft]')?.getAttribute('data-draft')).toBe('I-22')
  })

  it('lists the crisis numbers as links a phone can dial', () => {
    const { container } = draw()
    const scope = container.querySelector('#scope') as HTMLElement
    const links = [...scope.querySelectorAll<HTMLAnchorElement>('a[href^="tel:"]')]
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['14416', 'tel:14416'],
      ['1-800-891-4416', 'tel:18008914416'],
      ['112', 'tel:112'],
      ['1098', 'tel:1098'],
    ])
    expect(links).toHaveLength(CRISIS_LINES.flatMap((line) => line.numbers).length)
    expect(scope.textContent).toContain('Tele-MANAS: 14416 or 1-800-891-4416 (free, 24×7)')
  })

  it('points from the hero to the statement instead of promising confidentiality outright', () => {
    draw()
    const pointer = screen.getByRole('link', { name: 'What that means, and what we keep private' })
    expect(pointer.getAttribute('href')).toBe('/counselling#scope')
    expect(screen.getByText('Sessions are non-clinical conversations.')).toBeTruthy()
    expect(screen.getByText(COUNSELLING_IIIC_LINES.lead)).toBeTruthy()
  })

  it('never describes counselling in clinical words, outside the statement that rules them out', () => {
    const { container } = draw()
    container.querySelector('#scope')?.remove()
    const text = container.textContent ?? ''
    // src/brand/VOICE.md, "Words to avoid" and "Counselling copy"; docs/08 §7.
    expect(text).not.toMatch(
      /therap|psycholog|(?<!non-)clinical|diagnos|treatment|\bcure|\bheal|safe space|guarantee/i,
    )
    expect(text).not.toMatch(/confidential/i)
    expect(text).not.toMatch(/₹|\bRs\b/)
  })

  it('leaves what IIIC and its lawyer have yet to supply as placeholders', () => {
    const { container } = draw()
    const waiting = [...container.querySelectorAll('.iiic-todo')].map((chip) =>
      chip.getAttribute('data-todo'),
    )
    expect(waiting.sort()).toEqual(['D-19', 'I-08', 'I-09', 'I-20', 'I-31'])
    expect(container.querySelectorAll('[data-candidate="I-41"]')).toHaveLength(
      candidates(COUNSELLING.layout),
    )
  })

  it('gives the steps their line, in IIIC’s words', () => {
    const { container } = draw()
    expect(screen.getByText(COUNSELLING_IIIC_LINES.how)).toBeTruthy()
    expect(
      [...container.querySelectorAll('ol.iiic-steps > li > strong')].map(
        (step) => step.textContent,
      ),
    ).toEqual(['We listen.', 'We explain.', 'We equip.'])
  })
})

describe('the learn starter page, drawn', () => {
  const draw = () => render(<RenderBlocks layout={LEARN.layout} />)

  it('sets out the five pillars, each in IIIC’s own sentence', () => {
    const { container } = draw()
    const cards = [...container.querySelectorAll('.iiic-grid > .iiic-card')]
    expect(cards.map((card) => card.querySelector('h3')?.textContent)).toEqual([
      'Purpose',
      'Identity',
      'Significance',
      'Logic',
      'Accountability',
    ])
    expect(cards.map((card) => card.querySelector('p')?.textContent)).toEqual([
      LEARN_IIIC_LINES.purpose,
      LEARN_IIIC_LINES.identity,
      LEARN_IIIC_LINES.significance,
      LEARN_IIIC_LINES.logic,
      LEARN_IIIC_LINES.accountability,
    ])
  })

  it('carries the certificate’s fixed statement, marked as a draft for the lawyer', () => {
    const { container } = draw()
    const certificate = container.querySelector('#certificate') as HTMLElement
    for (const sentence of CERTIFICATE_STATEMENT) {
      expect(certificate.textContent).toContain(sentence)
    }
    expect(certificate.querySelector('[data-draft]')?.getAttribute('data-draft')).toBe('I-22')
  })

  it('never calls the course a degree or implies recognition, outside that statement', () => {
    const { container } = draw()
    container.querySelector('#certificate')?.remove()
    const text = container.textContent ?? ''
    // src/brand/VOICE.md, "Words to avoid" and "Certificates and affiliation"; docs/08 §7.
    expect(text).not.toMatch(/degree|diploma|accredit|recognis|approved|affiliat|guarantee/i)
    // A university IIIC worked with may be named; the course is never called one.
    expect(text.match(/universit(y|ies)/gi)).toEqual(['universities', 'University'])
    expect(text).toContain(PDEU_WORKSHOP)
    expect(text).not.toMatch(/₹|\bRs\b/)
  })

  it('offers the info session to learners and the partnership to institutions', () => {
    draw()
    const sessions = screen.getAllByRole('link', { name: 'Join a free info session' })
    expect(sessions).toHaveLength(3)
    for (const link of sessions) expect(link.getAttribute('href')).toBe('/book/info')
    const partner = screen.getAllByRole('link', { name: 'Partner with IIIC' })
    expect(partner).toHaveLength(2)
    for (const link of partner) expect(link.getAttribute('href')).toBe('/institute')
  })

  it('leaves the course, the info session and the programmes for institutes to IIIC', () => {
    const { container } = draw()
    const waiting = [...container.querySelectorAll('.iiic-todo')].map((chip) =>
      chip.getAttribute('data-todo'),
    )
    expect(waiting.sort()).toEqual(['I-11', 'I-13', 'I-14'])
    expect(container.querySelectorAll('[data-candidate="I-41"]')).toHaveLength(
      candidates(LEARN.layout),
    )
  })
})
