import { cleanup, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ConsultancyError from '@/app/(platform)/(consultancy)/error'
import CounsellingError from '@/app/(platform)/(counselling)/error'
import DefaultError from '@/app/(platform)/(default)/error'
import EducationError from '@/app/(platform)/(education)/error'
import GlobalError from '@/app/global-error'
import { SERVER_ERROR_TITLE, ServerError } from '@/components/site/ServerError'
import { CRISIS_LINES, SCOPE_HEADING } from '@/lib/counselling/scope'
import { CONTACT } from '@/lib/site/contact'

vi.mock('@/app/fonts', () => ({
  fraunces: { variable: 'fake-fraunces' },
  manrope: { variable: 'fake-manrope' },
}))

// The 500 (docs/11 §5.2): plain, with the reference a person can quote and the address to
// write to; and without a reference where there is none to quote.

afterEach(cleanup)

const failure = (digest?: string) =>
  Object.assign(new Error('fake failure'), digest ? { digest } : {})

describe('the 500 page', () => {
  it('says what happened, gives the reference and where to write, in docs/11’s words', () => {
    const { container } = render(<ServerError reference="2938475610" />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Something went wrong on our side.',
    )
    expect(container.querySelector('p')?.textContent).toBe(
      `It has been logged with the reference 2938475610. Try again in a minute; if it keeps happening, write to ${CONTACT.email} and quote the reference.`,
    )
    expect(screen.getByRole('link', { name: CONTACT.email }).getAttribute('href')).toBe(
      `mailto:${CONTACT.email}`,
    )
  })

  it('says nothing about a log, and asks for no reference, when it has none', () => {
    const { container } = render(<ServerError />)
    expect(container.querySelector('p')?.textContent).toBe(
      `Try again in a minute; if it keeps happening, write to ${CONTACT.email}.`,
    )
  })

  it('is drawn by each register’s error boundary with the error’s digest', () => {
    for (const ErrorPage of [DefaultError, ConsultancyError, CounsellingError, EducationError]) {
      const { container } = render(<ErrorPage error={failure('fake-digest-1')} />)
      expect(container.querySelector('code')?.textContent).toBe('fake-digest-1')
      // Never the error's own message: it can hold anything.
      expect(container.textContent).not.toContain('fake failure')
      cleanup()
    }
  })

  it('carries the scope statement and the crisis numbers on a counselling page (CLAUDE.md #9)', () => {
    const { container } = render(<CounsellingError error={failure('fake-digest-3')} />)
    const scope = container.querySelector('#scope') as HTMLElement
    expect(scope).not.toBeNull()
    expect(scope.textContent).toContain(SCOPE_HEADING)
    const numbers = [...scope.querySelectorAll('a[href^="tel:"]')].map(
      (link) => link.firstChild?.textContent,
    )
    expect(numbers).toEqual(CRISIS_LINES.flatMap((line) => line.numbers))
    cleanup()
    for (const ErrorPage of [DefaultError, ConsultancyError, EducationError]) {
      const other = render(<ErrorPage error={failure()} />)
      expect(other.container.querySelector('#scope')).toBeNull()
      cleanup()
    }
  })

  it('names itself in the tab, as every page does', () => {
    render(<ServerError reference="fake" />)
    expect(document.title).toBe('Something went wrong · IIIC')
    expect(SERVER_ERROR_TITLE).toBe('Something went wrong · IIIC')
  })

  it('carries no question, no field and no button: it is plain', () => {
    const { container } = render(<ServerError reference="fake" />)
    expect(container.querySelectorAll('input, textarea, button, form')).toHaveLength(0)
    expect(container.textContent).not.toContain('?')
  })
})

describe('the global error boundary', () => {
  it('brings its own page, in the site’s language and type, when the layout itself failed', () => {
    const html = renderToStaticMarkup(<GlobalError error={failure('fake-digest-2')} />)
    // React puts the page's title in the <head> a document needs.
    expect(html).toMatch(
      /^<html lang="en-IN" class="fake-manrope fake-fraunces"><head><title>Something went wrong · IIIC<\/title><\/head><body>/,
    )
    expect(html).toContain('<main id="main">')
    expect(html).toContain('fake-digest-2')
  })

  it('shows no reference for an error raised in the browser, which has no digest', () => {
    const html = renderToStaticMarkup(<GlobalError error={failure()} />)
    expect(html).toContain('Something went wrong on our side.')
    expect(html).not.toContain('reference')
    expect(html).not.toContain('<script')
  })
})
