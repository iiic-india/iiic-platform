'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'

/**
 * "Take it with you" (docs/11 §3.6, Q3): copies an article's question to the clipboard and
 * reads "Copied" for two seconds. No account and no storage: the question goes only to the
 * reader's own clipboard. The button exists only where it can work: without JavaScript, or in a
 * browser that offers no clipboard (one over plain http among them), the server's HTML has no
 * button and the question stays on the page to read and select. Nothing moves, so reduced
 * motion has nothing to stop; the change of words is announced politely to a screen reader.
 */

export const LABEL = 'Take it with you'
export const COPIED = 'Copied'
/** How long the button reads "Copied" (docs/11 §3.6). */
export const COPIED_FOR_MS = 2000

/** Nothing to subscribe to: the clipboard does not come and go while the page is open. */
const subscribe = () => () => {}
const canCopy = () => typeof navigator.clipboard?.writeText === 'function'
/** The server renders no button: it cannot know what the reader's browser offers. */
const onServer = () => false

export function TakeItWithYou({ question, className }: { question: string; className?: string }) {
  const available = useSyncExternalStore(subscribe, canCopy, onServer)
  // Each copy has its own moment, so a second press restarts the two seconds.
  const [copiedAt, setCopiedAt] = useState<number | null>(null)

  useEffect(() => {
    if (copiedAt === null) return
    const timer = setTimeout(() => setCopiedAt(null), COPIED_FOR_MS)
    return () => clearTimeout(timer)
  }, [copiedAt])

  if (!available) return null

  async function copy() {
    try {
      await navigator.clipboard.writeText(question)
      setCopiedAt(Date.now())
    } catch {
      // The browser refused (no permission, or the page lost focus): the question stays on the
      // page, and the button keeps its words.
    }
  }

  const copied = copiedAt !== null
  return (
    <>
      <button
        type="button"
        className={`iiic-btn iiic-btn-outline${className ? ` ${className}` : ''}`}
        onClick={copy}
      >
        {copied ? COPIED : LABEL}
      </button>
      <span className="iiic-sr-only" role="status">
        {copied ? COPIED : ''}
      </span>
    </>
  )
}
