'use client'

import { Scope } from '@/components/blocks/PageBlocks'
import { ServerError } from '@/components/site/ServerError'

/**
 * The site's 500 (../(default)/error.tsx), in the counselling register this route group sets.
 * Every page here is a counselling page, so the 500 that stands in for one carries the scope
 * statement and the crisis numbers above the footer, as the 404 here does (CLAUDE.md #9; docs/11
 * §5.1, item 8): someone whose counselling page failed may need them most.
 */
export default function ServerErrorPage({ error }: { error: Error & { digest?: string } }) {
  return (
    <ServerError reference={error.digest}>
      <Scope />
    </ServerError>
  )
}
