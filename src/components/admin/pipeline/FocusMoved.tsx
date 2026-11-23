'use client'

import { useEffect, useState } from 'react'

import styles from './Pipeline.module.css'

type Props = { cardId: string | null; message: string | null }

/**
 * After a move, the focus goes back to the moved lead's card in its new column and the move is
 * announced (docs/17 §12 C). The live region is drawn empty first and filled a moment later, so
 * screen readers read it out.
 */
export function FocusMoved({ cardId, message }: Props) {
  const [said, setSaid] = useState('')

  useEffect(() => {
    if (!cardId) return
    const card = document.getElementById(cardId)
    card?.focus()
    card?.scrollIntoView({ block: 'nearest' })
    const timer = window.setTimeout(() => setSaid(message ?? ''), 150)
    return () => window.clearTimeout(timer)
  }, [cardId, message])

  return (
    <p aria-live="polite" className={styles.visuallyHidden} role="status">
      {said}
    </p>
  )
}
