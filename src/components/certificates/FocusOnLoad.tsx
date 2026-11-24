'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Moves focus to its content once, when the page loads: the error summary after a check that
 * failed, so a keyboard or screen-reader user hears what to fix at once (CLAUDE.md, accessibility).
 * The kit's `.iiic-error-summary` takes the focus ring.
 */
export function FocusOnLoad({ className, children }: { className: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    box.current?.focus()
  }, [])
  return (
    <div className={className} ref={box} role="alert" tabIndex={-1}>
      {children}
    </div>
  )
}
