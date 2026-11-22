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

    it('shows no price, no exclamation mark, and none of VOICE.md’s outcome, clinical or degree words', () => {
      const { container } = draw(page)
      const text = container.textContent ?? ''
      expect(text).not.toMatch(/₹|\bRs\b|\bINR\b/)
      // Whole words only for "cure" and "heal": "secure" and "health" are fine.
      expect(text).not.toMatch(
        /guarantee|\bcur(?:e|es|ed|ing)\b|\bheal(?:s|ed|ing)?\b|therap|psycholog|clinical|diagnos|treatment/i,
      )
      expect(text).not.toMatch(
        /degree|diploma|universit|accredit|recogni[sz]|affiliat|\bapproved\b/i,
      )
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
      [...row.querySelectorAll('th, td')].map((cell) => cell.textContent),
    )
    const items = [
      'Trade name',
      'Legal name',
      'Kind of business',
      'Address',
      'Website',
      'GSTIN',
      'Customer care',
      'Grievance officer',
      'CERT-In point of contact',
      'Dark-pattern self-audit',
    ]
    expect(rows.map(([item]) => item)).toEqual(items)
    // Each item heads its row, so a screen reader reads every detail with its label (WCAG 1.3.1).
    expect(screen.getAllByRole('rowheader').map((cell) => cell.textContent)).toEqual(items)
    // The name IIIC trades under, until I-26 gives it exactly as registered.
    expect(rows[0]?.[1]).toContain('Indian Institute of Image Catalysts (IIIC)')
    // docs/08 §4 lists the website among the legal information (D-05).
    expect(rows[4]?.[1]).toBe('imagecatalysts.in')
    // IIIC is registered for GST (docs/09): the page waits for the number, not for an answer.
    expect(rows[5]?.[1]).toBe('[[TODO: the GSTIN, I-05]]')
    expect(rows[6]?.[1]).toBe(`${CONTACT.email} or ${CONTACT.phone}, ${CONTACT.hours}`)
    // The address prints without a PIN until IIIC confirms it (D-31, I-33).
    expect(rows[3]?.[1]).toContain(CONTACT.address)
    expect(rows[3]?.[1]).not.toMatch(/\b3[0-9]{5}\b/)
    expect(waiting(container)).toEqual(['I-05', 'I-21', 'I-22', 'I-26', 'I-26', 'I-27', 'I-33'])
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

  it('says how long the 404 log keeps an address as the purge does it (O5): 180 days unasked', () => {
    const { container } = draw(PRIVACY)
    const text = container.textContent ?? ''
    expect(text).toContain('removes them once 180 days pass without anyone asking for that address')
    expect(text).not.toContain('up to 180 days')
  })

  it('records no analytics events about anyone under 18, in docs/08 §3’s words', () => {
    const { container } = draw(PRIVACY)
    // Anonymous page counts are not events about a person, so the sentence stays true when
    // Cloudflare's cookieless counts start (docs/12 §7).
    expect(container.textContent).toContain(
      'IIIC sends no marketing to anyone under 18 and records no analytics events about them.',
    )
  })

  it('says where the site’s functions run, where AiSensy and Meta are, and what the staff calendars show', () => {
    const { container } = draw(PRIVACY)
    const text = container.textContent ?? ''
    // Vercel's functions run in Mumbai; a request enters its network wherever the reader is.
    expect(text).toContain('The site’s functions run in Mumbai')
    expect(text).not.toContain('servers for this site are in Mumbai')
    expect(text).toContain('AiSensy in India, Meta worldwide')
    // The calendars hold booking times and clients' first names (D-22).
    expect(text).toContain('the client’s first name')
  })

  it('keeps counselling private and consent separate (CLAUDE.md, non-negotiables 3 and 4)', () => {
    const { container } = draw(PRIVACY)
    const text = container.textContent ?? ''
    // Never for marketing, routing or analytics.
    expect(text).toContain(
      'Nothing said in a counselling session is used for marketing, to decide what else IIIC offers you, or for analytics.',
    )
    // Private within the law's limits, named as VOICE.md's "Counselling copy" names them. Whether
    // a person sees the notes about them on a request for their data is open (D-11), so the page
    // does not say.
    expect(text).toContain(
      'Session notes are private to the counsellor who wrote them, within the limits the law sets, including mandatory reporting where a child may be at risk.',
    )
    expect(text).not.toContain('can be read only by')
    expect(text).toContain('Each purpose has its own box, and no box is ticked for you.')
    expect(text).toContain(
      'A booking never depends on agreeing to a newsletter or to WhatsApp updates.',
    )
    // The consent receipt covers the Map as well as counselling bookings, and withdrawal is
    // offered on this page as well as in every message (docs/08 §3).
    expect(text).toContain(
      'For a counselling booking or the Map, your consent is also confirmed by email',
    )
    expect(text).toContain('and this page will carry one too')
  })

  it('gives the 30 days IIIC publishes for a request, and the way to make one', () => {
    const { container } = draw(PRIVACY)
    expect(container.textContent).toContain('We answer within 30 days.')
    // Nomination is one of the rights docs/08 §3 lists.
    expect(container.textContent).toContain('to name someone who can make these requests for you')
    expect(screen.getByRole('link', { name: 'How to make a request' }).getAttribute('href')).toBe(
      '/grievance',
    )
    // Who is responsible, the officer, whether a person sees the session notes about them, the
    // legal basis, the retention periods and how changes are announced wait on IIIC and the
    // lawyer.
    expect(waiting(container)).toEqual(['I-21', 'I-22', 'I-22', 'I-22', 'I-22', 'I-26'])
  })

  it('has a place for the legal basis and for changes, as docs/12 §11 asks, both for the lawyer', () => {
    draw(PRIVACY)
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual([
      'Who is responsible',
      'What this site collects today',
      'When bookings and other forms open',
      'The legal basis',
      'Children',
      'Who handles data for IIIC',
      'Your rights',
      'How long data is kept',
      'Changes to this notice',
    ])
    for (const name of ['The legal basis', 'Changes to this notice']) {
      const section = screen.getByRole('heading', { level: 2, name }).closest('section')
      expect(
        [...(section?.querySelectorAll('.iiic-todo') ?? [])].map((chip) =>
          chip.getAttribute('data-todo'),
        ),
        name,
      ).toEqual(['I-22'])
    }
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
    // The refund timeline comes with the rules for each service (I-07, D-16).
    expect(text).toContain('[[TODO: the refund timeline, I-07]]')
    expect(waiting(container)).toEqual(['I-04', 'I-07', 'I-07'])
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
    // Nomination is one of the requests /grievance takes (docs/08 §3).
    expect(text).toContain('name someone to make these requests for you')
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
    // The public pages, each register's 404 included, and the widths tests/e2e/site.e2e.spec.ts
    // checks: those widths and no more, since a range between them is not measured.
    expect(text).toContain('Every public page on the site today has passed two checks.')
    expect(text).toContain('No sideways scrolling at 320, 768 or 1600 pixels wide.')
    expect(text).not.toMatch(/from 320 to 1600/)
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
