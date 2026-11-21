'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

import { isNarrativePath } from '@/lib/experience/narrative'

import styles from './experience.module.css'

/** Whether the browser grows the bar from the scroll position by itself (CSS, §3.1). */
function drawnByCss(): boolean {
  return typeof CSS !== 'undefined' && CSS.supports?.('animation-timeline: scroll()') === true
}

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/**
 * The bar (docs/11 §3.1): the reader's progress down a narrative page, on the header's lower
 * rule. It is decoration, hidden from assistive technology: the page's headings carry its
 * structure. Where the browser has no scroll-driven animations, a passive scroll listener sets
 * the progress once a frame; under reduced motion nothing listens and the bar stands still at
 * full width. On any other page, booking and counselling above all, there is no bar.
 */
export function ReadingBar() {
  const narrative = isNarrativePath(usePathname())
  const bar = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const element = bar.current
    if (!element || drawnByCss() || reducedMotion()) return
    let frame = 0
    const draw = () => {
      frame = 0
      const range = document.documentElement.scrollHeight - window.innerHeight
      const progress = range > 0 ? Math.min(1, Math.max(0, window.scrollY / range)) : 0
      element.style.setProperty('--progress', String(progress))
    }
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(draw)
    }
    schedule()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      cancelAnimationFrame(frame)
    }
  }, [narrative])

  return narrative ? <span ref={bar} className={styles.readingBar} aria-hidden="true" /> : null
}
