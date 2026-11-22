'use client'

import { ServerError } from '@/components/site/ServerError'

/** The site's 500 (../(default)/error.tsx), in the education register this route group sets. */
export default function ServerErrorPage({ error }: { error: Error & { digest?: string } }) {
  return <ServerError reference={error.digest} />
}
