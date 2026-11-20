import type { ReactNode } from 'react'

import { Todo } from '@/components/Todo'

/** A placeholder as it is typed into a text field: [[TODO: what is missing, I-xx]]. */
const PLACEHOLDER = /\[\[TODO: (.+?), ([ID]-\d+)\]\]/g

/**
 * Text from the CMS or the starter pages, with its placeholders drawn as the kit's chip
 * (CLAUDE.md, non-negotiable 1). Everything else is shown exactly as written.
 */
export function renderText(text: string | null | undefined): ReactNode {
  if (!text) return null
  const parts: ReactNode[] = []
  let end = 0
  for (const match of text.matchAll(PLACEHOLDER)) {
    const start = match.index ?? 0
    if (start > end) parts.push(text.slice(end, start))
    parts.push(<Todo what={match[1] ?? ''} id={match[2] ?? ''} key={start} />)
    end = start + match[0].length
  }
  if (end === 0) return text
  if (end < text.length) parts.push(text.slice(end))
  return parts
}
