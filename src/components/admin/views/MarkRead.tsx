'use client'

import { Button, toast, useConfig } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * Marks one feedback as read (docs/05, Proof) through Payload's own API, which checks the user,
 * the code and the role again (POLICY.feedback: the office), and lets staff change the status and
 * nothing else on it. The page is read again after, so the queue shows where it stands.
 */
export function MarkRead({
  id,
  label,
  done,
  failed,
}: {
  id: number
  label: string
  done: string
  failed: string
}) {
  const {
    config: {
      routes: { api },
      serverURL,
    },
  } = useConfig()
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function mark() {
    if (pending) return
    setPending(true)
    try {
      const response = await fetch(`${serverURL}${api}/feedback/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'read' }),
      })
      if (response.ok) {
        toast.success(done)
        router.refresh()
      } else {
        toast.error(failed)
      }
    } catch {
      toast.error(failed)
    }
    setPending(false)
  }

  return (
    <Button buttonStyle="secondary" disabled={pending} onClick={() => void mark()} size="medium">
      {label}
    </Button>
  )
}
