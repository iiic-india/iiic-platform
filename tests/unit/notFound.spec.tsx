import { cleanup, render, screen } from '@testing-library/react'
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
import { CRISIS_LINES, SCOPE_HEADING } from '@/lib/counselling/scope'
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
// The 404 log writes after the response (src/lib/redirects/log.ts): here, only the call.
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

  it('is headed "Page not found" and leads home, whatever the path', async () => {
    for (const path of ['/no-such-page', '/book/session']) {
      await draw(path)
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Page not found')
      expect(screen.getByRole('link', { name: 'Go to the home page' }).getAttribute('href')).toBe(
        '/',
      )
      cleanup()
    }
  })

  it('puts the address in the 404 log, on every path (docs/11 §5.1, item 9)', async () => {
    for (const path of ['/no-such-page', '/counselling/x']) await draw(path)
    // What it keeps, and when it writes, is the log's own business (tests/unit/missingPages.spec.ts).
    expect(logMissingPage).toHaveBeenCalledTimes(2)
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
