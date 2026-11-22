'use client'

import { ServerError } from '@/components/site/ServerError'

/**
 * The 500 inside the site's shell, in the register of the route group it sits in (docs/02; the
 * 404 beside it does the same): plain, with the reference and the address to write to
 * (docs/11 §5.2). Next.js hands it the error after a page below it fails; a failure in the root
 * layout itself reaches src/app/global-error.tsx instead.
 */
export default function ServerErrorPage({ error }: { error: Error & { digest?: string } }) {
  return <ServerError reference={error.digest} />
}
