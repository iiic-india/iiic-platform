import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { NavToggle } from '@/components/site/NavToggle'

const nav = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }))

const shell = () => (
  <>
    <NavToggle controls="site-nav" />
    <nav id="site-nav">
      <a href="#framework">Framework</a>
    </nav>
  </>
)

const expanded = () => screen.getByRole('button', { name: 'Menu' }).getAttribute('aria-expanded')

describe('NavToggle', () => {
  afterEach(() => {
    cleanup()
    nav.pathname = '/'
  })

  it('opens and closes on click', () => {
    render(shell())
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(expanded()).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(expanded()).toBe('false')
  })

  it('closes after a navigation and stays closed on coming back', () => {
    const { rerender } = render(shell())
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    nav.pathname = '/framework'
    rerender(shell())
    expect(expanded()).toBe('false')
    nav.pathname = '/'
    rerender(shell())
    expect(expanded()).toBe('false')
  })

  it('closes on Escape and returns focus to the button', () => {
    render(shell())
    const button = screen.getByRole('button', { name: 'Menu' })
    fireEvent.click(button)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(expanded()).toBe('false')
    expect(document.activeElement).toBe(button)
  })

  it('closes when a link in the menu is followed', () => {
    render(shell())
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    fireEvent.click(screen.getByRole('link', { name: 'Framework' }))
    expect(expanded()).toBe('false')
  })
})
