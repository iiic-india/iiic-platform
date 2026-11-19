import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SiteFooter } from '@/components/site/SiteFooter'

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
    for (const href of ['/legal', '/privacy', '/terms', '/refunds', '/grievance']) {
      expect(hrefs).toContain(href)
    }
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
