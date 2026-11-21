import { headers } from 'next/headers'

import { type JsonLdGraph, serializeJsonLd } from '@/lib/seo/schema'

/** The nonce in a Content-Security-Policy, as Next.js reads it for its own scripts. */
export function nonceFromCsp(csp: string | null | undefined): string | undefined {
  return csp?.match(/'nonce-([^']+)'/)?.[1]
}

/**
 * A page's structured data, as one <script type="application/ld+json"> (plan A5; D-62). A data
 * block never runs, but it carries the request's nonce (D-42) so that no policy report names
 * it: the nonce is read from the policy src/proxy.ts sets on the request, which is where
 * Next.js reads it to put the nonce on its own scripts. Not next/script, which would load it as
 * a script.
 */
export async function JsonLd({ graph }: { graph: JsonLdGraph }) {
  const nonce = nonceFromCsp((await headers()).get('content-security-policy'))
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      // Browsers hide a nonce from the DOM once the page has loaded, so hydration sees "".
      suppressHydrationWarning
      // The graph is built from the site's own facts and escaped for a script element.
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(graph) }}
    />
  )
}
