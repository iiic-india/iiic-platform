import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SiteFooter } from '@/components/site/SiteFooter'
import { FIXED_PLACEHOLDERS } from '@/lib/content/placeholders'

// next/image needs Next's loader; an element with the image's role and name is enough to
// test the footer's structure.
vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} />,
}))

const footer = () => screen.getByRole('contentinfo')

describe('SiteFooter', () => {
  afterEach(cleanup)

  it('titles its columns with h2, so headings never skip a level after a page’s h1', () => {
    render(<SiteFooter />)
    expect(footer().querySelectorAll('h3, h4, h5, h6')).toHaveLength(0)
    expect(
      within(footer())
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(['Learn', 'Work with us', 'Institute'])
  })

  it('carries the eight main links and the legal row inside the footer landmark', () => {
    render(<SiteFooter />)
    const hrefs = within(footer())
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'))
    // docs/11 §5.1: Home, Framework, For organisations, Learn, Counselling, Proof, Journal, Contact.
    for (const href of [
      '/',
      '/framework',
      '/organisations',
      '/learn',
      '/counselling',
      '/proof',
      '/journal',
      '/about#contact',
    ]) {
      expect(hrefs).toContain(href)
    }
    for (const href of [
      '/legal',
      '/privacy',
      '/terms',
      '/refunds',
      '/grievance',
      '/accessibility',
    ]) {
      expect(hrefs).toContain(href)
    }
  })

  it('names the proprietor, the GSTIN and the grievance officer in the legal row (docs/08 §3, §4)', () => {
    render(<SiteFooter />)
    const legal = footer().querySelector('.iiic-footer-legal') as HTMLElement
    // The legal name (I-26), the GSTIN (I-05), the grievance officer (I-21) and the affiliation
    // statement (I-30), each a placeholder until it is supplied.
    expect(
      [...legal.querySelectorAll('.iiic-todo')].map((chip) => chip.getAttribute('data-todo')),
    ).toEqual(['I-26', 'I-05', 'I-21', 'I-30'])
    const chip = ({ what, id }: { what: string; id: string }) => `[[TODO: ${what}, ${id}]]`
    expect(legal.firstElementChild?.textContent?.replace(/^© \d{4} /, '')).toBe(
      [
        'Indian Institute of Image Catalysts',
        // The label /legal uses, so the proprietor's name never reads as a contact.
        `Legal name: ${chip(FIXED_PLACEHOLDERS.footerLegalName)}`,
        `GSTIN ${chip(FIXED_PLACEHOLDERS.footerGstin)}`,
        `Grievance officer: ${chip(FIXED_PLACEHOLDERS.footerGrievanceOfficer)}`,
        chip(FIXED_PLACEHOLDERS.footerAffiliation),
      ].join(' · '),
    )
  })

  it('gives the brochure address without a PIN, the phone and the email in an address (D-31)', () => {
    render(<SiteFooter />)
    const address = footer().querySelector('address')
    expect(address).not.toBeNull()
    const contact = within(address as HTMLElement)
    expect(address?.textContent).toContain(
      '408, The Claywalls, above Bonanza Salon, Zydus Hospital Lane, Hebatpur Road, Ahmedabad',
    )
    expect(address?.textContent).not.toMatch(/\b\d{6}\b/)
    expect(contact.getByRole('link', { name: '+91 96240 46464' }).getAttribute('href')).toBe(
      'tel:+919624046464',
    )
    expect(contact.getByRole('link', { name: 'info@iiicedu.com' }).getAttribute('href')).toBe(
      'mailto:info@iiicedu.com',
    )
  })
})
