'use client'

import { type ReactNode, useEffect, useState } from 'react'

import styles from './experience.module.css'

/** Where a card counts as the one in view: from below the sticky header to 40% down the window. */
const IN_VIEW = '-96px 0px -60% 0px'

/**
 * The six insights' titles beside their text on wide screens (docs/11 §3.5): links to the
 * cards, with the bar marking the card in view (aria-current). The topmost card in the upper
 * part of the window is the one in view, so a title followed from here marks its own card.
 * Without JavaScript the titles are plain links and nothing is marked; under reduced motion
 * the bar moves without sliding (experience.module.css).
 */
export function InsightNav({
  labelledBy,
  ids,
  titles,
}: {
  /** The id of the section's heading, which names this list. */
  labelledBy: string
  /** The ids of the cards, in order. */
  ids: string[]
  titles: ReactNode[]
}) {
  const [current, setCurrent] = useState<string | null>(null)
  const watched = ids.join(' ')

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const order = watched.split(' ')
    const inView = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) inView.add(entry.target.id)
          else inView.delete(entry.target.id)
        }
        const first = order.find((id) => inView.has(id))
        if (first) setCurrent(first)
      },
      { rootMargin: IN_VIEW },
    )
    for (const id of order) {
      const card = document.getElementById(id)
      if (card) observer.observe(card)
    }
    return () => observer.disconnect()
  }, [watched])

  return (
    <nav className={styles.insightNav} aria-labelledby={labelledBy}>
      <ol>
        {ids.map((id, index) => (
          <li key={id}>
            <a
              className={styles.insightLink}
              href={`#${id}`}
              aria-current={current === id ? 'true' : undefined}
            >
              {titles[index]}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
