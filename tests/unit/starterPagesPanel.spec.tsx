import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { STARTER_PAGES_COPY as COPY } from '@/components/admin/starterPagesCopy'
import { StarterPagesPanel } from '@/components/admin/StarterPagesPanel'

const push = vi.fn()
const toastError = vi.fn()

// Payload's admin UI loads styles only the Next.js build can handle: a plain button stands in.
vi.mock('@payloadcms/ui', () => ({
  Button: ({
    children,
    disabled,
    onClick,
    'aria-label': label,
  }: {
    children: ReactNode
    disabled?: boolean
    onClick?: () => void
    'aria-label'?: string
  }) => (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  toast: { error: (message: string) => toastError(message) },
  useConfig: () => ({ config: { routes: { admin: '/admin', api: '/api' }, serverURL: '' } }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const PAGES = [
  { slug: 'home', title: 'Home', path: '/' },
  { slug: 'about', title: 'About', path: '/about' },
]

const answer = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }))

beforeEach(() => {
  push.mockClear()
  toastError.mockClear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the starter pages panel', () => {
  it('names each page with its address and a button of its own', () => {
    render(<StarterPagesPanel pages={PAGES} />)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(COPY.heading)
    expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      `Home /${COPY.start}`,
      `About /about${COPY.start}`,
    ])
    // Each button says which page it starts, for someone who hears the buttons out of order.
    expect(
      screen.getAllByRole('button').map((button) => button.getAttribute('aria-label')),
    ).toEqual([`${COPY.start}: Home`, `${COPY.start}: About`])
  })

  it('copies the page in and opens it', async () => {
    const fetch = answer(201, { id: 41 })
    vi.stubGlobal('fetch', fetch)
    render(<StarterPagesPanel pages={PAGES} />)
    fireEvent.click(screen.getByRole('button', { name: `${COPY.start}: About` }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/collections/pages/41'))
    expect(fetch).toHaveBeenCalledWith('/api/pages/from-starter', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'about' }),
    })
    // While the page opens, no second copy can be started.
    for (const button of screen.getAllByRole('button')) {
      expect((button as HTMLButtonElement).disabled).toBe(true)
    }
    expect(toastError).not.toHaveBeenCalled()
  })

  it('opens the page that is already here when someone else was quicker', async () => {
    vi.stubGlobal('fetch', answer(409, { message: 'That page is already here.', id: 12 }))
    render(<StarterPagesPanel pages={PAGES} />)
    fireEvent.click(screen.getByRole('button', { name: `${COPY.start}: Home` }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/collections/pages/12'))
    expect(toastError).not.toHaveBeenCalled()
  })

  it('says why a copy was refused, and lets the person try again', async () => {
    vi.stubGlobal('fetch', answer(403, { message: 'Only an owner can.' }))
    render(<StarterPagesPanel pages={PAGES} />)
    fireEvent.click(screen.getByRole('button', { name: `${COPY.start}: About` }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Only an owner can.'))
    expect(push).not.toHaveBeenCalled()
    await waitFor(() => {
      for (const button of screen.getAllByRole('button')) {
        expect((button as HTMLButtonElement).disabled).toBe(false)
      }
    })
  })

  it('has words of its own when the answer has none, or never arrives', async () => {
    vi.stubGlobal('fetch', answer(500, {}))
    render(<StarterPagesPanel pages={PAGES} />)
    fireEvent.click(screen.getByRole('button', { name: `${COPY.start}: About` }))
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(COPY.failed))
    const home = screen.getByRole('button', { name: `${COPY.start}: Home` }) as HTMLButtonElement
    await waitFor(() => expect(home.disabled).toBe(false))

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    fireEvent.click(home)
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(COPY.offline))
    expect(push).not.toHaveBeenCalled()
  })
})
