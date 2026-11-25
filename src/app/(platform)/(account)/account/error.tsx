'use client'

import { ServerError } from '@/components/site/ServerError'

/** The site's 500 (../../(default)/error.tsx) for My IIIC, in the default register. */
export default function ServerErrorPage({ error }: { error: Error & { digest?: string } }) {
  return <ServerError reference={error.digest} />
}
