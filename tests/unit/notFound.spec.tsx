import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import OrganisationsSubPage, {
  generateMetadata as organisationsMetadata,
} from '@/app/(platform)/(consultancy)/organisations/[...slug]/page'
import CounsellingSubPage, {
  generateMetadata as counsellingMetadata,
} from '@/app/(platform)/(counselling)/counselling/[...slug]/page'
import NotFound from '@/app/(platform)/(default)/not-found'
import InstituteSubPage, {
  generateMetadata as instituteMetadata,
} from '@/app/(platform)/(education)/institute/[...slug]/page'
import { MAIN_LINKS } from '@/components/site/MainLinks'
import { FIXED_PLACEHOLDERS, NOT_FOUND_QUESTION_PLACEHOLDERS } from '@/lib/content/placeholders'
import { CRISIS_LINES, SCOPE_HEADING } from '@/lib/counselling/scope'
import { NOT_FOUND_COPY, notFoundVariant, poolFor, questionFor } from '@/lib/notFound/copy'
import { logMissingPage } from '@/lib/redirects/log'
import { redirectOrNotFound } from '@/lib/redirects/lookup'

// The requested path, as src/proxy.ts sets it on every request.
const state = vi.hoisted(() => ({ path: '' }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-pathname': state.path }),
}))

// The page at an address is read from the CMS; here only the address asked for matters.
vi.mock('@/components/blocks/PageAt', () => ({
  PageAt: () => null,
  metadataAt: async (slug: string) => ({ title: `Fake ${slug}` }),
}))
// No redirect leads from any address here, so every address without a page is the 404.
vi.mock('@/lib/redirects/lookup', () => ({
  redirectOrNotFound: vi.fn(async () => {
    throw new Error('not found')
  }),
}))
// The 404 log (src/lib/redirects/log.ts): here, only whether anything calls it.
vi.mock('@/lib/redirects/log', () => ({ logMissingPage: vi.fn(async () => undefined) }))

beforeEach(() => {
  vi.mocked(redirectOrNotFound).mockClear()
  vi.mocked(logMissingPage).mockClear()
})
afterEach(cleanup)

const draw = async (path: string) => {
  state.path = path
  return render(await NotFound())
}

describe('the 404', () => {
  it.each(['/book/session', '/book/session/x', '/counselling/x', '/Counselling/x'])(
    'on the counselling path %s, carries the scope statement and the crisis numbers',
    async (path) => {
      const { container } = await draw(path)
      const scope = container.querySelector('#scope') as HTMLElement
      expect(scope).not.toBeNull()
      expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(SCOPE_HEADING)
      // Each link begins with its number; the line it calls follows for a screen reader.
      const numbers = [...scope.querySelectorAll('a[href^="tel:"]')].map(
        (link) => link.firstChild?.textContent,
      )
      expect(numbers).toEqual(['14416', '1-800-891-4416', '112', '1098'])
      expect(numbers).toEqual(CRISIS_LINES.flatMap((line) => line.numbers))
      // docs/11 §5.1, item 8: after the way back, above the footer.
      expect(container.querySelector('section > section:last-child')).toBe(scope)
    },
  )

  it.each(['/book/info', '/no-such-page', '/counselling-x', '/institute/no-such-page', ''])(
    'on "%s", which is not a counselling path, is the page alone',
    async (path) => {
      const { container } = await draw(path)
      expect(container.querySelector('#scope')).toBeNull()
      expect(container.querySelector('a[href^="tel:"]')).toBeNull()
    },
  )

  it('says "404 · Page not found" before its headline and leads home, whatever the path', async () => {
    for (const path of ['/no-such-page', '/book/session']) {
      const { container } = await draw(path)
      const kicker = container.querySelector('.iiic-kicker')
      expect(kicker?.textContent).toBe(NOT_FOUND_COPY.kicker)
      // The kicker comes first, then the headline: a proposal, so its placeholder (I-41).
      expect(kicker?.nextElementSibling?.tagName).toBe('H1')
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
        `[[TODO: ${FIXED_PLACEHOLDERS.notFoundHeadline.what}, I-41]]`,
      )
      expect(screen.getByRole('link', { name: 'Home' }).getAttribute('href')).toBe('/')
      cleanup()
    }
  })

  it.each([
    ['/no-such-page', 'general'],
    ['/organisations/x', 'founders'],
    ['/founders/x', 'founders'],
    ['/Organisations', 'founders'],
    ['/learn/x', 'learners'],
    ['/learning', 'general'],
    ['/institute/x', 'general'],
    ['/journal/x', 'general'],
  ] as const)(
    'on %s asks the %s question, then offers the line, the way on, search and the links',
    async (path, pool) => {
      const { container } = await draw(path)
      // The question of the pool for where the visitor was headed: none is approved yet.
      expect(poolFor(path)).toBe(pool)
      const question = container.querySelector('[data-nosnippet]')
      expect(question?.textContent).toBe(
        `[[TODO: ${NOT_FOUND_QUESTION_PLACEHOLDERS[pool].what}, I-41]]`,
      )
      expect(screen.getByRole('link', { name: 'Why a question?' }).getAttribute('href')).toBe(
        '/framework',
      )
      // The line: a plain field in no form, with no name, and the promise under it.
      const field = screen.getByLabelText('Your line (optional)')
      expect(field.tagName).toBe('TEXTAREA')
      expect(field.getAttribute('name')).toBeNull()
      expect(field.closest('form')).toBeNull()
      expect(field.hasAttribute('autofocus')).toBe(false)
      expect(screen.getByText('Nothing you write here is stored or sent.').id).toBe(
        field.getAttribute('aria-describedby'),
      )
      expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull()
      expect(screen.getByRole('link', { name: 'Find your path' }).getAttribute('href')).toBe('/map')
      // Then search, by GET to /search, and the eight main links, in that order.
      const search = screen.getByRole('search')
      expect(search.getAttribute('action')).toBe('/search')
      expect(search.getAttribute('method')).toBe('get')
      expect(screen.getByLabelText('Where were you headed?').getAttribute('name')).toBe('q')
      const links = within(screen.getByRole('navigation', { name: 'Pages to start from' }))
        .getAllByRole('link')
        .map((link) => link.getAttribute('href'))
      expect(links).toEqual(MAIN_LINKS.map((link) => link.href))
      const order = [field, screen.getByRole('link', { name: 'Find your path' }), search]
      for (let index = 1; index < order.length; index += 1) {
        expect(
          order[index - 1]!.compareDocumentPosition(order[index]!) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy()
      }
    },
  )

  it('on a counselling path is the plain page: no question, no line, no device', async () => {
    for (const path of ['/counselling/x', '/book/session']) {
      const { container } = await draw(path)
      expect(notFoundVariant(path)).toBe('plain')
      expect(container.querySelector('[data-nosnippet]')).toBeNull()
      expect(container.querySelector('textarea')).toBeNull()
      expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
      expect(screen.queryByRole('link', { name: 'Why a question?' })).toBeNull()
      expect(screen.queryByRole('link', { name: 'Find your path' })).toBeNull()
      // Still the headline, the line, search and the links, then the scope statement.
      expect(screen.getByRole('search')).not.toBeNull()
      expect(screen.getByRole('navigation', { name: 'Pages to start from' })).not.toBeNull()
      cleanup()
    }
  })

  it('shows an approved question, the same one for the same address, and marks a candidate', () => {
    const pools = {
      founders: [{ text: 'Fake founders question?' }],
      learners: [],
      general: [{ text: 'Fake first question?' }, { text: 'Fake second question?' }],
    }
    expect(questionFor('/learn/x', pools)).toBeNull()
    expect(questionFor('/organisations/x', pools)).toEqual({ text: 'Fake founders question?' })
    const asked = new Set(
      ['/a', '/b', '/c', '/d', '/e', '/f'].map((path) => questionFor(path, pools)?.text),
    )
    expect(asked).toEqual(new Set(['Fake first question?', 'Fake second question?']))
    expect(questionFor('/Same-Address', pools)).toEqual(questionFor('/same-address', pools))
  })

  it('writes nothing to the 404 log: Next.js draws it on every page view, served or not', async () => {
    // Next.js hands this component to each layout as the page to show should one be missing,
    // and renders it then, on a page that is served too. The route that answers with the 404
    // writes the log (src/lib/redirects/lookup.ts; tests/unit/redirectLookup.spec.ts).
    for (const path of ['/no-such-page', '/counselling/x', '/about', '/']) await draw(path)
    expect(logMissingPage).not.toHaveBeenCalled()
  })
})

// docs/02: the pages under /institute/, /organisations/ and /counselling/ are drawn in their
// section's register, by routes in its route group, and so is the 404 for an address there.
const SECTIONS = [
  { section: 'institute', Page: InstituteSubPage, metadata: instituteMetadata },
  { section: 'organisations', Page: OrganisationsSubPage, metadata: organisationsMetadata },
  { section: 'counselling', Page: CounsellingSubPage, metadata: counsellingMetadata },
]

const params = (...slug: string[]) => ({ params: Promise.resolve({ slug }) })

for (const { section, Page, metadata } of SECTIONS) {
  describe(`an address under /${section}/`, () => {
    it('shows the page at that address, with its title', async () => {
      const page = await Page(params('fake-page'))
      expect(page.props).toEqual({ slug: `${section}/fake-page` })
      const deeper = await Page(params('fake', 'deeper-page'))
      expect(deeper.props).toEqual({ slug: `${section}/fake/deeper-page` })
      expect(await metadata(params('fake-page'))).toEqual({ title: `Fake ${section}/fake-page` })
    })

    it('gets the 404, before the CMS is asked, where no page could have the address', async () => {
      for (const slug of ['Fake', 'fake page', 'fake.php', '-fake']) {
        await expect(Page(params(slug)), slug).rejects.toThrow('not found')
        expect(await metadata(params(slug)), slug).toEqual({})
      }
    })

    it('asks for the redirect from such an address first, by its whole path', async () => {
      await expect(Page(params('Old', 'Page.html'))).rejects.toThrow('not found')
      expect(redirectOrNotFound).toHaveBeenCalledWith(`/${section}/Old/Page.html`)
    })
  })
}
