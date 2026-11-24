'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/** Whether a key press belongs to a field the user is typing in. */
function typing(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element) return false
  const tag = element.tagName
  return element.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/**
 * `/` and Ctrl K (⌘ K on a Mac) open the admin's search from any page (docs/18 §6), unless the
 * user is typing in a field. Drawn only for staff who may search; the search page checks again.
 */
export function SearchShortcut({ href }: { href: string }) {
  const router = useRouter()
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const command = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k'
      const slash = event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey
      if (!command && !(slash && !typing(event.target))) return
      event.preventDefault()
      router.push(href)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [href, router])
  return null
}
