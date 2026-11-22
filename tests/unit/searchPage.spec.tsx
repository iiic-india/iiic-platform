import { cleanup, render, screen, within } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import SearchPage, { metadata } from '@/app/(platform)/(default)/search/page'
import { MAIN_LINKS } from '@/components/site/MainLinks'
import { SiteHeader } from '@/components/site/SiteHeader'
import { SEARCH_COPY } from '@/lib/search/copy'
import { countNoResults, searchSite, type SearchOutcome } from '@/lib/search/query'
import { groupResults } from '@/lib/search/results'
import { MAX_QUERY_LENGTH } from '@/lib/search/text'

// /search (docs/02; docs/11 §5.3): the field, the results grouped by kind, the honest empty
// state, and nothing about the query kept. The search itself is faked here
// (tests/unit/searchQuery.spec.ts tests it).
const headerValues = vi.hoisted(() => new Headers({ 'user-agent': 'fake' }))
vi.mock('next/headers', () => ({ headers: async () => headerValues }))
vi.mock('next/navigation', () => ({ usePathname: () => '/search' }))
vi.mock('@/lib/search/query', () => ({ searchSite: vi.fn(), countNoResults: vi.fn() }))

const draw = async (q: string | undefined, outcome: SearchOutcome) => {
  vi.mocked(searchSite).mockResolvedValue(outcome)
  return render(await SearchPage({ searchParams: Promise.resolve(q === undefined ? {} : { q }) }))
}

const found = (query: string): SearchOutcome => {
  const groups = groupResults(
    [
      {
        kind: 'pages',
        title: 'Fake framework page',
        url: '/framework',
        excerpt: null,
        content: 'Fake framework page\nThe self, seen as a subject.',
        priority: 40,
      },
      {
        kind: 'faqs',
        title: 'A fake question about the self?',
        url: '/counselling',
        excerpt: null,
        content: 'A fake question about the self?\nA fake answer about the self.',
        priority: 10,
      },
    ],
    ['self'],
  )
  return { state: 'done', query, groups, total: 2, partial: false }
}

beforeEach(() => {
  vi.mocked(searchSite).mockReset()
  vi.mocked(countNoResults).mockClear()
})
afterEach(cleanup)

describe('/search', () => {
  it('is never indexed and has no canonical address or share image of its own', () => {
    expect(metadata).toEqual({ title: 'Search', robots: { index: false, follow: true } })
  })

  it('is a plain GET form with one labelled field, which takes no more than is searched', async () => {
    await draw(undefined, { state: 'empty' })
    const form = screen.getByRole('search')
    expect(form.getAttribute('action')).toBe('/search')
    expect(form.getAttribute('method')).toBe('get')
    const field = screen.getByLabelText(SEARCH_COPY.label)
    expect(field.getAttribute('name')).toBe('q')
    expect(field.getAttribute('type')).toBe('search')
    expect(field.getAttribute('maxlength')).toBe(String(MAX_QUERY_LENGTH))
    expect(field.getAttribute('autocomplete')).toBe('off')
    expect(form.querySelectorAll('input, textarea, select')).toHaveLength(1)
    expect(screen.getByText(SEARCH_COPY.help).id).toBe(field.getAttribute('aria-describedby'))
    expect(screen.getByRole('button', { name: 'Search' }).getAttribute('type')).toBe('submit')
    expect(screen.getByText(SEARCH_COPY.covers)).not.toBeNull()
    expect(countNoResults).not.toHaveBeenCalled()
  })

  it('sends no script of its own: it works without JavaScript', async () => {
    vi.mocked(searchSite).mockResolvedValue(found('self'))
    const html = renderToStaticMarkup(
      await SearchPage({ searchParams: Promise.resolve({ q: 'self' }) }),
    )
    expect(html).not.toMatch(/<script\b/)
    expect(html).not.toMatch(/ on[a-z]+=/i)
  })

  it('shows the results grouped by kind, with the matching sentence and the words marked', async () => {
    await draw('self', found('self'))
    expect(searchSite).toHaveBeenCalledWith('self')
    expect(screen.getByLabelText(SEARCH_COPY.label).getAttribute('value')).toBe('self')
    expect(screen.getByText(/results for/).textContent).toBe('Two results for “self”')
    // One to nine in words, 10 and up in figures (VOICE.md).
    expect([1, 9, 10, 12].map(SEARCH_COPY.found)).toEqual([
      'One result for',
      'Nine results for',
      '10 results for',
      '12 results for',
    ])
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(['Pages', 'Questions and answers'])
    const pages = screen.getByRole('region', { name: 'Pages' })
    const link = within(pages).getByRole('link', { name: 'Fake framework page' })
    expect(link.getAttribute('href')).toBe('/framework')
    expect(link.closest('li')?.querySelector('p')?.textContent).toBe('The self, seen as a subject.')
    expect([...pages.querySelectorAll('mark')].map((mark) => mark.textContent)).toEqual(['self'])
    expect(countNoResults).not.toHaveBeenCalled()
  })

  it('says plainly when nothing matches, offers the main pages and counts it', async () => {
    await draw('zz', { state: 'done', query: 'zz', groups: [], total: 0, partial: false })
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(
      `${SEARCH_COPY.nothing} “zz”`,
    )
    const links = within(screen.getByRole('navigation', { name: SEARCH_COPY.doors }))
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'))
    expect(links).toEqual(MAIN_LINKS.map((link) => link.href))
    expect(countNoResults).toHaveBeenCalledTimes(1)
    expect(countNoResults).toHaveBeenCalledWith(headerValues)
  })

  it('does not count a search the index could not answer, and says part was not searched', async () => {
    await draw('zz', { state: 'done', query: 'zz', groups: [], total: 0, partial: true })
    expect(screen.getByText(SEARCH_COPY.partial)).not.toBeNull()
    expect(countNoResults).not.toHaveBeenCalled()
  })

  it('asks for a minute when this server has answered its share', async () => {
    await draw('self', { state: 'busy', query: 'self' })
    expect(screen.getByText(SEARCH_COPY.busy)).not.toBeNull()
    expect(screen.getByRole('navigation', { name: SEARCH_COPY.doors })).not.toBeNull()
    expect(countNoResults).not.toHaveBeenCalled()
  })

  it('shows the query back only as text', async () => {
    const query = '<script>alert(1)</script>'
    const { container } = await draw(query, {
      state: 'done',
      query,
      groups: [],
      total: 0,
      partial: false,
    })
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain(query)
  })
})

describe('the header’s search', () => {
  it('links to /search, drawn on wide screens only', () => {
    render(<SiteHeader />)
    const link = within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', {
      name: 'Search',
    })
    expect(link.getAttribute('href')).toBe('/search')
    expect(link.className).not.toBe('')
  })
})
