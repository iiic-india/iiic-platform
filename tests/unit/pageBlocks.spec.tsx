import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { RenderBlocks } from '@/components/blocks/PageBlocks'
import { renderText } from '@/components/blocks/text'
import { ABOUT, ABOUT_IIIC_LINES, PUBLIC_WORKSHOP } from '@/content/starter/about'
import { COUNSELLING, COUNSELLING_IIIC_LINES } from '@/content/starter/counselling'
import {
  FOUNDERS,
  FOUNDERS_CHAPTER_KICKER,
  FOUNDERS_IIIC_LINES,
  FOUNDERS_NARRATIVE_FIGURES,
  FOUNDERS_STORY_LABEL,
} from '@/content/starter/founders'
import { FRAMEWORK, FRAMEWORK_IIIC_LINES } from '@/content/starter/framework'
import { HOME, HOME_IIIC_LINES } from '@/content/starter/home'
import { INSTITUTE, INSTITUTE_IIIC_LINES } from '@/content/starter/institute'
import { LEARN, LEARN_IIIC_LINES, PDEU_WORKSHOP } from '@/content/starter/learn'
import { ORGANISATIONS, ORGANISATIONS_IIIC_LINES } from '@/content/starter/organisations'
import { CERTIFICATE_STATEMENT } from '@/lib/certificates/statement'
import { candidateSections } from '@/lib/content/placeholders'
import type { PageContent } from '@/lib/content/types'
import { CRISIS_LINES, SCOPE_STATEMENT } from '@/lib/counselling/scope'
import { CONTACT } from '@/lib/site/contact'

afterEach(cleanup)

/** How many blocks of a page carry copy IIIC has not approved yet. */
// The sections the report lists as candidates, the public forms' included (I-41).
const candidates = (layout: PageContent['layout']) => candidateSections({ layout }).length

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
    // docs/11 §3.4: the outcome band is the door's footer and the whole card is the link; a
    // button would need a verb (VOICE.md).
    for (const door of doors) expect(door.querySelector('.iiic-btn')).toBeNull()
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
    // Each row is headed by its first cell, so the pair is read together (WCAG 1.3.1).
    expect(
      within(table)
        .getAllByRole('rowheader')
        .map((cell) => cell.textContent),
    ).toEqual([
      'Life happens to me',
      'I react to people and events',
      'Others decide my worth',
      'I follow instructions',
      'Circumstances drive my choices',
    ])
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
    // docs/11 §3.4: the outcome band is the door's footer and the whole card is the link; a
    // button would need a verb (VOICE.md).
    for (const door of doors) expect(door.querySelector('.iiic-btn')).toBeNull()
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
    // A card without a link is an article, not a link to nowhere; each service's card opens
    // the service's own page (copy architecture §4.4, section 5).
    expect(cards.slice(0, 3).every((card) => card.tagName === 'ARTICLE')).toBe(true)
    expect(cards.slice(3).map((card) => card.getAttribute('href'))).toEqual([
      '/organisations/organisation-planning',
      '/organisations/marketing-and-sales',
      '/organisations/brand-positioning',
    ])
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
    // Confidentiality with its legal limit stated (docs/08 §7; VOICE.md, "Counselling copy").
    expect(scope.textContent).toContain('mandatory reporting where a child may be at risk')
    expect(scope.querySelector('[data-draft]')?.getAttribute('data-draft')).toBe('I-22')
  })

  it('lists the crisis numbers as links a phone can dial, each named with its line', () => {
    const { container } = draw()
    const scope = container.querySelector('#scope') as HTMLElement
    const links = [...scope.querySelectorAll<HTMLAnchorElement>('a[href^="tel:"]')]
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['14416, Tele-MANAS', 'tel:14416'],
      ['1-800-891-4416, Tele-MANAS', 'tel:18008914416'],
      ['112, Emergencies', 'tel:112'],
      ['1098, Children', 'tel:1098'],
    ])
    expect(links).toHaveLength(CRISIS_LINES.flatMap((line) => line.numbers).length)
    // What the eye reads is unchanged: the line's name is for screen readers only.
    const seen = scope.cloneNode(true) as HTMLElement
    for (const hidden of seen.querySelectorAll('.iiic-sr-only')) hidden.remove()
    expect(seen.textContent).toContain('Tele-MANAS: 14416 or 1-800-891-4416 (free, 24×7)')
  })

  it('points from the hero to the statement instead of promising confidentiality outright', () => {
    const { container } = draw()
    const pointer = screen.getByRole('link', {
      name: 'What a session is, and what we keep private',
    })
    expect(pointer.getAttribute('href')).toBe('/counselling#scope')
    expect(screen.getByText('Sessions are non-clinical conversations.')).toBeTruthy()
    expect(screen.getByText(COUNSELLING_IIIC_LINES.lead)).toBeTruthy()
    // The note is drawn after the actions, so the pointer's label has to stand on its own.
    const hero = container.querySelector('.iiic-hero') as HTMLElement
    expect(hero.querySelector('.iiic-row')?.nextElementSibling?.textContent).toBe(
      'Sessions are non-clinical conversations.',
    )
  })

  it('files the session lengths under IIIC’s registration form, where docs/09 has them', () => {
    expect(
      COUNSELLING.facts?.find((fact) => fact.statement === '1:1 sessions of 15, 30 or 45 minutes.')
        ?.source,
    ).toBe('form')
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
    expect(waiting.sort()).toEqual(['I-08', 'I-09', 'I-20', 'I-30', 'I-31'])
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
    // IIIC's own line opens the list, so "they" in each card refers to someone.
    expect(cards[0]?.closest('section')?.querySelector('.iiic-section-head p')?.textContent).toBe(
      LEARN_IIIC_LINES.understand,
    )
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
    // The partnership enquiry, on the institute page (docs/17 §6).
    for (const link of partner) {
      expect(link.getAttribute('href')).toBe('/institute#partnership-enquiry')
    }
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

describe('the about starter page, drawn', () => {
  const draw = () => render(<RenderBlocks layout={ABOUT.layout} />)

  it('is headed by the institute’s name until the headline has its years (I-32)', () => {
    const { container } = draw()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Indian Institute of Image Catalysts',
    )
    const hero = container.querySelector('.iiic-hero') as HTMLElement
    expect(hero.textContent).toContain(ABOUT_IIIC_LINES.opening)
    expect(hero.querySelector('.iiic-todo')?.getAttribute('data-todo')).toBe('I-32')
    // No number of years is printed as a headline before the founder settles on one.
    expect(container.textContent).not.toMatch(/\b(25|30) years\b/)
  })

  it('opens the larger vision at its second sentence, without naming IIIC first (I-31)', () => {
    const { container } = draw()
    const vision = screen.getByRole('heading', { level: 2, name: 'The Larger Vision' })
    const section = vision.closest('section') as HTMLElement
    expect([...section.querySelectorAll('p')].map((p) => p.textContent)).toEqual([
      ABOUT_IIIC_LINES.purpose,
      ABOUT_IIIC_LINES.progress,
    ])
    expect(section.querySelector('[data-candidate]')).toBeNull()
    expect(container.textContent).not.toMatch(/\bfirst\b/i)
  })

  it('gives the founder’s biography as the brochure has it, less its guarantee', () => {
    const { container } = draw()
    const founder = container.querySelector('.iiic-split') as HTMLElement
    expect(within(founder).getByRole('heading', { level: 2 }).textContent).toBe('Gaurang Mistry')
    expect([...founder.querySelectorAll('.iiic-prose p')].map((p) => p.textContent)).toEqual([
      ABOUT_IIIC_LINES.founder,
      ABOUT_IIIC_LINES.research,
      '[[TODO: one factual line about Ankvishwa, in his own words, I-10]]',
    ])
    // The photograph and the Ankvishwa line are his to give (I-10, D-26).
    expect(
      [...founder.querySelectorAll('.iiic-todo')].map((chip) => chip.getAttribute('data-todo')),
    ).toEqual(['I-10', 'I-10'])
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/guarantee|assessment|date of birth|\bDr\b/i)
    expect(text.match(/ankvishwa/gi)).toHaveLength(1)
  })

  it('lists the two workshops and leads to a partnership', () => {
    const { container } = draw()
    const text = container.textContent ?? ''
    expect(text).toContain(PDEU_WORKSHOP)
    expect(text).toContain(PUBLIC_WORKSHOP)
    expect(screen.getByRole('link', { name: 'Partner with IIIC' }).getAttribute('href')).toBe(
      '/institute#partnership-enquiry',
    )
  })

  it('ends on the contact section the main action and the footer open', () => {
    const { container } = draw()
    expect(screen.getByRole('link', { name: 'Contact' }).getAttribute('href')).toBe(
      '/about#contact',
    )
    const contact = container.querySelector('#contact') as HTMLElement
    expect(container.querySelector('.iiic-page > section:last-child')).toBe(contact)
    expect(within(contact).getByRole('heading', { level: 2 }).textContent).toBe('Contact')
    expect([...contact.querySelectorAll('dt')].map((term) => term.textContent)).toEqual([
      'Phone',
      'Email',
      'Office hours',
      'Address',
    ])
    expect(within(contact).getByRole('link', { name: CONTACT.phone }).getAttribute('href')).toBe(
      'tel:+919624046464',
    )
    expect(within(contact).getByRole('link', { name: CONTACT.email }).getAttribute('href')).toBe(
      'mailto:info@iiicedu.com',
    )
    expect(contact.textContent).toContain(CONTACT.hours)
    expect(contact.textContent).toContain(CONTACT.address)
    // The address prints without a PIN until IIIC confirms it (D-31, I-33).
    expect(contact.textContent).not.toMatch(/\b3[0-9]{5}\b/)
    expect(contact.querySelector('.iiic-todo')?.getAttribute('data-todo')).toBe('I-33')
    expect(container.querySelector('.iiic-band')).toBeNull()
  })

  it('leaves the team and the organisations to IIIC, and marks what it has not approved', () => {
    const { container } = draw()
    const waiting = [...container.querySelectorAll('.iiic-todo')].map((chip) =>
      chip.getAttribute('data-todo'),
    )
    expect(waiting.sort()).toEqual(['I-09', 'I-10', 'I-10', 'I-32', 'I-33', 'I-38'])
    expect(container.querySelectorAll('[data-candidate="I-41"]')).toHaveLength(
      candidates(ABOUT.layout),
    )
    expect(container.textContent).not.toMatch(/₹|\bRs\b/)
  })
})

describe('the institute starter page, drawn', () => {
  const draw = () => render(<RenderBlocks layout={INSTITUTE.layout} />)

  it('opens with the plan’s list and IIIC’s own line on education', () => {
    const { container } = draw()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Research, programmes and partnerships',
    )
    expect(container.querySelector('.iiic-hero p')?.textContent).toBe(
      INSTITUTE_IIIC_LINES.education,
    )
  })

  it('sets out the plan’s sections in order, with the certificate’s fixed statement', () => {
    const { container } = draw()
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual([
      'Framework and research',
      'Programmes',
      'The certificate',
      'Partnerships',
      // The partnership enquiry follows the section (docs/17 §6).
      'Partner with IIIC',
      'Faculty',
      'Verify a certificate',
    ])
    const certificate = container.querySelector('#certificate') as HTMLElement
    for (const sentence of CERTIFICATE_STATEMENT) {
      expect(certificate.textContent).toContain(sentence)
    }
    expect(certificate.querySelector('[data-draft]')?.getAttribute('data-draft')).toBe('I-22')
  })

  it('describes the one partnership as it happened and implies no recognition', () => {
    const { container } = draw()
    container.querySelector('#certificate')?.remove()
    const text = container.textContent ?? ''
    expect(text).toContain(PDEU_WORKSHOP)
    // src/brand/VOICE.md, "Certificates and affiliation"; docs/08 §7.
    expect(text).not.toMatch(
      /degree|diploma|accredit|recognis|approved|affiliat|guarantee|\bMoUs?\b/i,
    )
    expect(text.match(/universit(y|ies)/gi)).toEqual(['University'])
    expect(text).not.toMatch(/₹|\bRs\b/)
  })

  it('leads to pages that exist and to the contact details, and holds the partnership enquiry', () => {
    const { container } = draw()
    expect(screen.getByRole('link', { name: 'Read the framework' }).getAttribute('href')).toBe(
      '/framework',
    )
    expect(
      screen.getByRole('link', { name: 'See the certification course' }).getAttribute('href'),
    ).toBe('/learn')
    expect(screen.getByRole('link', { name: 'Contact' }).getAttribute('href')).toBe(
      '/about#contact',
    )
    // Where About's and the course page's Partner with IIIC lead.
    expect(container.querySelector('section#partnership-enquiry')).not.toBeNull()
  })

  it('leaves the research, the programmes, the credentials and verification as placeholders', () => {
    const { container } = draw()
    const waiting = [...container.querySelectorAll('.iiic-todo')].map((chip) =>
      chip.getAttribute('data-todo'),
    )
    // The partnership enquiry waits on its consent text (I-22) in this drawing, which has none.
    expect(waiting.sort()).toEqual(['D-39', 'I-14', 'I-22', 'I-43', 'I-43'])
    expect(container.querySelectorAll('[data-candidate="I-41"]')).toHaveLength(
      candidates(INSTITUTE.layout),
    )
  })
})

describe('the founders starter page, drawn', () => {
  const draw = () => render(<RenderBlocks layout={FOUNDERS.layout} />)
  const LINES = FOUNDERS_IIIC_LINES

  it('opens with IIIC’s headline, and its button leads into the story', () => {
    const { container } = draw()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(LINES.headline)
    const hero = container.querySelector('.iiic-hero') as HTMLElement
    expect(hero.textContent).toContain(LINES.subheadline)
    expect(hero.textContent).toContain('Built on Subjective Self')
    expect(screen.getByRole('link', { name: LINES.begin }).getAttribute('href')).toBe(
      '/founders#story',
    )
    const story = container.querySelector('#story') as HTMLElement
    expect(within(story).getByRole('heading', { level: 2 }).textContent).toBe(LINES.storyHeading)
  })

  it('tells the story in IIIC’s words and says it is an illustration (D-28)', () => {
    const { container } = draw()
    const story = container.querySelector('#story') as HTMLElement
    // The chapter's kicker waits on IIIC (I-41); the label follows it, whatever it becomes.
    const kicker = story.querySelector('.iiic-kicker') as HTMLElement
    expect(kicker.textContent).toBe(`${FOUNDERS_CHAPTER_KICKER} · ${FOUNDERS_STORY_LABEL}`)
    expect(kicker.querySelector('.iiic-todo')?.getAttribute('data-todo')).toBe('I-41')
    expect([...story.querySelectorAll('.iiic-prose p')].map((p) => p.textContent)).toEqual([
      LINES.shed,
      LINES.today,
      LINES.cabin,
      LINES.question,
      LINES.hands,
      LINES.chapter,
    ])
    // No review, name or badge stands beside the illustration, here or anywhere on the page.
    expect(story.querySelector('.iiic-card, blockquote, figure')).toBeNull()
    expect(container.textContent).not.toMatch(/verified|testimonial|case study|client story/i)
  })

  it('sets out the six insights, each in IIIC’s own sentences', () => {
    const { container } = draw()
    const cards = [...container.querySelectorAll('.iiic-grid > .iiic-card')]
    expect(cards.map((card) => card.querySelector('h3')?.textContent)).toEqual([
      'The Empire',
      'Decisions',
      'Systems',
      'People',
      'Gratitude',
      'Brand and Worth',
    ])
    expect(cards.map((card) => card.querySelector('p')?.textContent)).toEqual([
      LINES.empire,
      LINES.decisions,
      LINES.systems,
      LINES.people,
      LINES.gratitude,
      LINES.brand,
    ])
  })

  it('lists what moves differently, in IIIC’s order', () => {
    draw()
    const section = screen
      .getByRole('heading', { level: 2, name: LINES.rhythmHeading })
      .closest('section') as HTMLElement
    expect(section.querySelector('p.iiic-lede')?.textContent).toBe(LINES.rhythm)
    expect([...section.querySelectorAll('li')].map((item) => item.textContent)).toEqual([
      LINES.ownership,
      LINES.load,
      LINES.speaks,
      LINES.space,
    ])
  })

  it('closes on the signature line and the consultation, which books the proposal call', () => {
    const { container } = draw()
    const band = container.querySelector('.iiic-band') as HTMLElement
    expect(within(band).getByRole('heading', { level: 2 }).textContent).toBe(LINES.closingHeading)
    expect(band.textContent).toContain(LINES.supporting)
    expect(band.querySelector('[lang="sa"]')?.textContent).toBe('आत्मानं विद्धि')
    expect(band.textContent).toContain('Know thyself')
    // I-36: the supplied label, on the free proposal call, until IIIC defines the offer.
    expect(
      within(band).getByRole('link', { name: 'Book a Founder Consultation' }).getAttribute('href'),
    ).toBe('/book/call')
  })

  it('names money only as the turnover in the story, never as a price (D-21)', () => {
    const { container } = draw()
    const text = container.textContent ?? ''
    expect(text.match(FOUNDERS_NARRATIVE_FIGURES)).toEqual([
      '₹100 Crore',
      '₹1000 Crore',
      '₹100 crore',
      '₹1000 crore',
      '₹900 crore',
    ])
    expect(text.replace(FOUNDERS_NARRATIVE_FIGURES, '')).not.toMatch(/₹|\bRs\b|\bINR\b|\bfee\b/i)
  })

  it('keeps “journey” to IIIC’s two lines, and marks only the heading IIIC has not seen', () => {
    const { container } = draw()
    expect((container.textContent ?? '').match(/journey/gi)).toHaveLength(2)
    const marks = [...container.querySelectorAll('[data-candidate="I-41"]')]
    expect(marks).toHaveLength(1)
    expect(marks[0]?.closest('section')?.querySelector('h2')?.textContent).toBe('Six Insights')
    expect(container.querySelector('[data-draft]')).toBeNull()
  })

  it('waits on IIIC for the four chapter kickers alone, each above IIIC’s heading (I-41)', () => {
    const { container } = draw()
    const chips = [...container.querySelectorAll('.iiic-todo')]
    expect(chips.map((chip) => chip.textContent)).toEqual(Array(4).fill(FOUNDERS_CHAPTER_KICKER))
    expect(
      chips.map((chip) => chip.closest('.iiic-section-head')?.querySelector('h2')?.textContent),
    ).toEqual([LINES.storyHeading, LINES.shiftHeading, 'Six Insights', LINES.rhythmHeading])
    for (const chip of chips) {
      expect(chip.closest('.iiic-kicker')).not.toBeNull()
      expect(chip.getAttribute('data-todo')).toBe('I-41')
    }
  })
})

describe('a section’s link name', () => {
  it('is the section’s id, and a section without one has no id', () => {
    const section = (anchor?: string) => ({
      blockType: 'statement' as const,
      heading: anchor ? 'Named' : 'Unnamed',
      paragraphs: [{ text: 'Fake paragraph' }],
      copyStatus: 'approved' as const,
      ...(anchor ? { anchor } : {}),
    })
    const { container } = render(<RenderBlocks layout={[section('story'), section()]} />)
    const sections = [...container.querySelectorAll('section')]
    expect(sections.map((element) => element.getAttribute('id'))).toEqual(['story', null])
  })
})

describe('the way from the organisations page to the founders’ story', () => {
  it('shows the story’s heading and first line, says what it is, and leads to it', () => {
    render(<RenderBlocks layout={ORGANISATIONS.layout} />)
    const section = screen
      .getByRole('heading', { level: 2, name: FOUNDERS_IIIC_LINES.storyHeading })
      .closest('section') as HTMLElement
    expect(section.querySelector('.iiic-kicker')?.textContent).toBe(FOUNDERS_STORY_LABEL)
    // The narrative is told once, on its own page: one line of it here, no more.
    expect([...section.querySelectorAll('.iiic-prose p')].map((p) => p.textContent)).toEqual([
      FOUNDERS_IIIC_LINES.shed,
    ])
    expect(within(section).getByRole('link', { name: 'Read the story' }).getAttribute('href')).toBe(
      '/founders#story',
    )
  })
})
