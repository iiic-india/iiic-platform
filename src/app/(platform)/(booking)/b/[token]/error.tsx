'use client'

import { ServerError } from '@/components/site/ServerError'

/** The 500 on the manage page (docs/11 §5.2). */
export default function ManageError({ error }: { error: Error & { digest?: string } }) {
  return <ServerError reference={error.digest} />
}
