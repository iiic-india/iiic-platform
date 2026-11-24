'use client'

import { useEffect } from 'react'

/**
 * Moves the keyboard focus to an element when the page arrives (the kit leaves this to JS:
 * src/brand/gallery.html, the error summary), so a screen reader reads the outcome of the form
 * first. The element carries `tabIndex={-1}` and its own role.
 */
export function FocusOnArrival({ id }: { id: string }) {
  useEffect(() => {
    document.getElementById(id)?.focus()
  }, [id])
  return null
}
