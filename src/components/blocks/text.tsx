import type { ReactNode } from 'react'

import { Todo } from '@/components/Todo'
import { PLACEHOLDER } from '@/lib/content/placeholders'

import styles from './blocks.module.css'

/**
 * A rupee figure as IIIC writes one, such as "₹100 crore" or "₹1,23,900": the sign, the digits
 * with their Indian grouping, and "crore" or "lakh" after them. It is set in Fraunces and never
 * animated (docs/11 §3.5): a figure that counts up is a tell, and these are not counted facts.
 */
const RUPEE_FIGURE = /₹\s?\d(?:[\d,]*\d)?(?:\.\d+)?(?:\s(?:crore|lakh)s?\b)?/gi

/** Plain words, with each rupee figure in them set in Fraunces. */
function withFigures(text: string, key: number): ReactNode[] {
  const parts: ReactNode[] = []
  let end = 0
  for (const match of text.matchAll(RUPEE_FIGURE)) {
    const start = match.index ?? 0
    if (start > end) parts.push(text.slice(end, start))
    parts.push(
      <span className={styles.figure} key={`${key}-${start}`}>
        {match[0]}
      </span>,
    )
    end = start + match[0].length
  }
  if (end < text.length) parts.push(text.slice(end))
  return parts
}

/**
 * Text from the CMS or the starter pages, with its placeholders drawn as the kit's chip
 * (CLAUDE.md, non-negotiable 1) and its rupee figures set in Fraunces. Everything else is shown
 * exactly as written.
 */
export function renderText(text: string | null | undefined): ReactNode {
  if (!text) return null
  const parts: ReactNode[] = []
  let end = 0
  for (const match of text.matchAll(PLACEHOLDER)) {
    const start = match.index ?? 0
    if (start > end) parts.push(...withFigures(text.slice(end, start), end))
    parts.push(<Todo what={match[1] ?? ''} id={match[2] ?? ''} key={start} />)
    end = start + match[0].length
  }
  if (end < text.length) parts.push(...withFigures(text.slice(end), end))
  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : parts
}
