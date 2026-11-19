'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

/**
 * The menu button on narrow screens. The kit shows the nav when the button that
 * precedes it has aria-expanded="true" (src/brand/css/04-patterns.css). Escape closes
 * the menu and returns focus to the button (src/brand/README.md); the menu also
 * closes after a navigation, because it remembers the page it was opened on.
 */
export function NavToggle({ controls }: { controls: string }) {
  const pathname = usePathname()
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === pathname
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpenOn(null)
      button.current?.focus()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [open])

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
