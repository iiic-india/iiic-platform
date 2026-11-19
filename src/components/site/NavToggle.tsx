'use client'

import { useState } from 'react'

/**
 * The menu button on narrow screens. The kit shows the nav when the button that
 * precedes it has aria-expanded="true" (src/brand/css/04-patterns.css).
 */
export function NavToggle({ controls }: { controls: string }) {
  const [open, setOpen] = useState(false)
  return (
    <button
      type="button"
      className="iiic-btn iiic-btn-outline iiic-nav-toggle"
      aria-expanded={open}
      aria-controls={controls}
      onClick={() => setOpen((value) => !value)}
    >
      Menu
    </button>
  )
}
