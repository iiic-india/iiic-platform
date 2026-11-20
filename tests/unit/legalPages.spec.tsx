import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { RenderBlocks } from '@/components/blocks/PageBlocks'
import { ABOUT } from '@/content/starter/about'
import {
  ACCESSIBILITY,
  GRIEVANCES,
  LEGAL,
  LEGAL_PAGES,
  PRIVACY,
  REFUNDS,
  TERMS,
} from '@/content/starter/legal'
import type { PageContent } from '@/lib/content/types'
import { CONTACT } from '@/lib/site/contact'

afterEach(cleanup)

const draw = (page: PageContent) =>
  render(<RenderBlocks layout={page.layout} legalReview={page.legalReview} />)

const waiting = (container: HTMLElement) =>
  [...container.querySelectorAll('.iiic-todo')].map((chip) => chip.getAttribute('data-todo')).sort()

describe.each(LEGAL_PAGES.map((page) => [page.slug, page] as const))(
  'the legal page "%s", drawn',
  (_, page) => {
    it('is headed by its own name and marked as a draft for the lawyer (I-22)', () => {
      const { container } = draw(page)
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(page.title)
      const marks = [...container.querySelectorAll('[data-draft]')]
      expect(marks.map((mark) => [mark.getAttribute('data-draft'), mark.textContent])).toEqual([
        ['I-22', 'Draft page, awaiting legal review (I-22)'],
      ])
      // The marker sits in the hero, above the heading it qualifies.
      expect(marks[0]?.closest('.iiic-hero')).not.toBeNull()
      expect(container.querySelector('[data-candidate]')).toBeNull()
    })

    it('promises nothing beyond the rules: no price, no outcome, no clinical or degree words', () => {
      const { container } = draw(page)
      const text = container.textContent ?? ''
      expect(text).not.toMatch(/₹|\bRs\b|\bINR\b/)
      expect(text).not.toMatch(/guarantee|therap|psycholog|clinical|diagnos|treatment/i)
      expect(text).not.toMatch(/degree|diploma|accredit|recognis|affiliat/i)
      expect(text).not.toMatch(/!/)
    })

    it('leads to the grievance officer, or to the contact details', () => {
      draw(page)
      const hero = page.layout[0]
      const primary = hero?.blockType === 'hero' ? hero.primary : undefined
      expect(['/grievance', '/about#contact']).toContain(primary?.href)
      expect(
        screen.getAllByRole('link', { name: primary?.label ?? '' })[0]?.getAttribute('href'),
      ).toBe(primary?.href)
    })
  },
)

describe('the legal information page', () => {
  it('sets out who runs the site as a table, with what IIIC has yet to supply', () => {
    const { container } = draw(LEGAL)
    const rows = [...container.querySelectorAll('tbody tr')].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => cell.textContent),
    )
    expect(rows.map(([item]) => item)).toEqual([
      'Trade name',
      'Legal name',
      'Kind of business',
      'Address',
      'GSTIN',
      'Customer care',
      'Grievance officer',
      'CERT-In point of contact',
      'Dark-pattern self-audit',
    ])
    expect(rows[0]?.[1]).toBe('Indian Institute of Image Catalysts (IIIC)')
    expect(rows[5]?.[1]).toBe(`${CONTACT.email} or ${CONTACT.phone}, ${CONTACT.hours}`)
    // The address prints without a PIN until IIIC confirms it (D-31, I-33).
    expect(rows[3]?.[1]).toContain(CONTACT.address)
    expect(rows[3]?.[1]).not.toMatch(/\b3[0-9]{5}\b/)
    expect(waiting(container)).toEqual(['I-21', 'I-22', 'I-26', 'I-26', 'I-27', 'I-33'])
  })
})

describe('the privacy notice', () => {
  it('says what the site collects today, and that it sets no cookies for readers', () => {
    const { container } = draw(PRIVACY)
    const text = container.textContent ?? ''
    expect(text).toContain('You can read this site without giving any personal details.')
    expect(text).toContain('The site sets no cookies when you read it')
    expect(text).toContain('There are no advertising trackers.')
  })

  it('keeps counselling private and consent separate (CLAUDE.md, non-negotiables 3 and 4)', () => {
    const { container } = draw(PRIVACY)
    const text = container.textContent ?? ''
    expect(text).toContain(
      'Nothing said in a counselling session is used for marketing or analytics.',
    )
    expect(text).toContain('Each purpose has its own box, and no box is ticked for you.')
    expect(text).toContain(
      'A booking never depends on agreeing to a newsletter or to WhatsApp updates.',
    )
  })

  it('gives the 30 days IIIC publishes for a request, and the way to make one', () => {
    const { container } = draw(PRIVACY)
    expect(container.textContent).toContain('We answer within 30 days.')
    expect(screen.getByRole('link', { name: 'How to make a request' }).getAttribute('href')).toBe(
      '/grievance',
    )
    // Who is responsible, the officer and the retention periods wait on IIIC and the lawyer.
    expect(waiting(container)).toEqual(['I-21', 'I-22', 'I-26'])
  })
})

describe('the terms page', () => {
  it('leaves the terms to the lawyer and points at the statements already fixed', () => {
    const { container } = draw(TERMS)
    expect(waiting(container)).toEqual(['I-22'])
    expect(container.textContent).toContain('The governing law, with courts in Gujarat')
    expect(
      [...container.querySelectorAll('a.iiic-card')].map((card) => card.getAttribute('href')),
    ).toEqual(['/counselling#scope', '/learn#certificate'])
  })
})

describe('the refunds page', () => {
  it('states the rules the docs have set and leaves each service’s rules to IIIC', () => {
    const { container } = draw(REFUNDS)
    const text = container.textContent ?? ''
    expect(text).toContain('This site takes no payments yet.')
    expect(text).toContain(
      'If IIIC charges for a late cancellation, IIIC pays the same when it cancels late.',
    )
    expect(text).toContain('A refund goes back to the payment method you used.')
    expect(waiting(container)).toEqual(['D-16', 'I-04', 'I-07'])
  })
})

describe('the grievance page', () => {
  it('gives the three response times of docs/08, and a way to write before the officer is named', () => {
    const { container } = draw(GRIEVANCES)
    expect(
      [...container.querySelectorAll('.iiic-steps > li strong')].map((step) => step.textContent),
    ).toEqual([
      'You write or call',
      'We acknowledge it within 48 hours',
      'We resolve it within one month',
    ])
    const text = container.textContent ?? ''
    expect(text).toContain('We answer within 30 days.')
    expect(text).toContain(`write to ${CONTACT.email} or call ${CONTACT.phone}`)
    expect(waiting(container)).toEqual(['I-21', 'I-22'])
  })
})

describe('the accessibility page', () => {
  it('is IIIC’s own statement: candidate copy, not a legal draft', () => {
    const { container } = draw(ACCESSIBILITY)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Accessibility')
    expect(container.querySelector('[data-draft]')).toBeNull()
    expect(container.querySelectorAll('[data-candidate="I-41"]')).toHaveLength(
      ACCESSIBILITY.layout.length,
    )
    const text = container.textContent ?? ''
    expect(text).toContain('(WCAG) 2.2 at level AA')
    expect(text).toContain('We reply within five working days.')
    expect(container.querySelector('.iiic-todo')).toBeNull()
  })
})

describe('the legal review mark', () => {
  it('is drawn for a draft only', () => {
    const reviewed = render(<RenderBlocks layout={PRIVACY.layout} legalReview="approved" />)
    expect(reviewed.container.querySelector('[data-draft]')).toBeNull()
    cleanup()
    const other = draw(ABOUT)
    expect(other.container.querySelector('[data-draft]')).toBeNull()
  })
})
