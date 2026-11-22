'use client'

import { useEffect } from 'react'

/** The attribute a chapter carries: "" as drawn, "waiting" below the window, "in" once seen. */
const REVEAL = 'data-reveal'

/**
 * Chapters reveal once as they come into view (docs/11 §3.5, §7), and so do the home page's
 * doors' cards and steps (§4), each item marked the same way: one IntersectionObserver, no
 * library. Only a chapter wholly below the window when the script runs is held back, so a
 * reader never sees a chapter vanish, and a page without JavaScript shows every chapter as it
 * is. A chapter is shown as soon as its top passes the window's lowest tenth (a chapter can be
 * taller than the window, so no share of its own height is asked for). Under reduced motion
 * nothing is held back.
 */
export function RevealChapters() {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const chapters = [...document.querySelectorAll<HTMLElement>(`main [${REVEAL}]`)]
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const chapter = entry.target as HTMLElement
          const state = chapter.getAttribute(REVEAL)
          if (entry.isIntersecting) {
            if (state === 'waiting') chapter.setAttribute(REVEAL, 'in')
            observer.unobserve(chapter)
          } else if (state === '' && entry.boundingClientRect.top >= window.innerHeight) {
            chapter.setAttribute(REVEAL, 'waiting')
          } else if (state === '') {
            // Above the window, or just entering its lowest tenth: the reader may see it already.
            observer.unobserve(chapter)
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    )
    for (const chapter of chapters) observer.observe(chapter)
    return () => {
      observer.disconnect()
      for (const chapter of chapters) {
        if (chapter.getAttribute(REVEAL) === 'waiting') chapter.setAttribute(REVEAL, '')
      }
    }
  }, [])

  return null
}
