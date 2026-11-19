'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

/**
 * The menu button on narrow screens. The kit shows the nav when the button that
 * precedes it has aria-expanded="true" (src/brand/css/04-patterns.css). Escape closes
 * the menu and returns focus to the button (src/brand/README.md); following a link in
 * the menu closes it, and so does any navigation, because the menu belongs to the
 * page it was opened on and forgets it once the path changes.
 */
export function NavToggle({ controls }: { controls: string }) {
  const pathname = usePathname()
  const [openOn, setOpenOn] = useState<string | null>(null)
  if (openOn !== null && openOn !== pathname) setOpenOn(null)
  const open = openOn === pathname
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const nav = document.getElementById(controls)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpenOn(null)
      button.current?.focus()
    }
    const closeOnLink = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('a')) setOpenOn(null)
    }
    document.addEventListener('keydown', closeOnEscape)
    nav?.addEventListener('click', closeOnLink)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      nav?.removeEventListener('click', closeOnLink)
    }
  }, [open, controls])

  return (
    <button
      ref={button}
      type="button"
      className="iiic-btn iiic-btn-outline iiic-nav-toggle"
      aria-expanded={open}
      aria-controls={controls}
      onClick={() => setOpenOn(open ? null : pathname)}
    >
      Menu
    </button>
  )
}
