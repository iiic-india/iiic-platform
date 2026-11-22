'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

import { isArticlePath, isNarrativePath, READING_BAR_ATTRIBUTE } from '@/lib/experience/narrative'

import styles from './experience.module.css'

/** Whether the browser grows the bar from the scroll position by itself (CSS, §3.1). */
function drawnByCss(): boolean {
  return typeof CSS !== 'undefined' && CSS.supports?.('animation-timeline: scroll()') === true
}

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/**
 * The bar (docs/11 §3.1): the reader's progress down a narrative page or a Journal article, on
 * the header's lower rule. It is decoration, hidden from assistive technology: the page's
 * headings carry its structure. Where the browser has no scroll-driven animations, a passive
 * scroll listener sets the progress once a frame; under reduced motion nothing listens and the
 * bar stands still at full width. On an article's address it is drawn only while the article
 * asks for it (READING_BAR_ATTRIBUTE), which one that leads to counselling never does; its
 * stylesheet hides it otherwise, before and without any script. On any other page, booking and
 * counselling above all, there is no bar.
 */
export function ReadingBar() {
  const pathname = usePathname()
  const narrative = isNarrativePath(pathname)
  const article = isArticlePath(pathname)
  const bar = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const element = bar.current
    if (!element || drawnByCss() || reducedMotion()) return
    // An article that does not ask for the bar gets no listener either.
    if (article && !document.querySelector(`main [${READING_BAR_ATTRIBUTE}]`)) return
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
  }, [narrative, article, pathname])

  if (!narrative && !article) return null
  return (
    <span
      ref={bar}
      className={article ? `${styles.readingBar} ${styles.onRequest}` : styles.readingBar}
      aria-hidden="true"
      data-device="reading-bar"
    />
  )
}
