'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Reloads the confirmation's data every few seconds while a payment is still being confirmed
 * (docs/16 §5: the webhook or the order-status check decides), for up to five minutes.
 */
export function RefreshWhilePending() {
  const router = useRouter()
  useEffect(() => {
    let count = 0
    const timer = window.setInterval(() => {
      count += 1
      if (count > 100) window.clearInterval(timer)
      else router.refresh()
    }, 3000)
    return () => window.clearInterval(timer)
  }, [router])
  return null
}
