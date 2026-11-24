'use client'

import { Scope } from '@/components/blocks/Scope'
import { ServerError } from '@/components/site/ServerError'

/**
 * The 500 on the manage page (docs/11 §5.2). Its address carries no kind of booking, and a
 * counselling booking's page must carry the scope statement and the crisis numbers (docs/08 §7),
 * so this one always does.
 */
export default function ManageError({ error }: { error: Error & { digest?: string } }) {
  return (
    <ServerError reference={error.digest}>
      <Scope />
    </ServerError>
  )
}
