'use client'

import { useEffect, useRef } from 'react'

/**
 * A sign-in step's heading, which takes focus when the step opens (docs/20 §4.1), so a keyboard
 * or screen reader starts at the new step rather than at the top of the page. The kit leaves
 * this to JavaScript; without it the page simply opens at the top.
 */
export function StepHeading({ children, focus = true }: { children: string; focus?: boolean }) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (focus) ref.current?.focus()
  }, [focus])
  return (
    <h1 ref={ref} tabIndex={-1}>
      {children}
    </h1>
  )
}
