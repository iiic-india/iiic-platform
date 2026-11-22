import type { PageConfig } from 'next'

import { ServerError } from '@/components/site/ServerError'

/**
 * The static 500 (docs/11 §5.2; docs/10 M2): the page Next.js serves, built once at build time,
 * when it cannot render the app at all, in place of its own page, which has its own words and
 * a dark-mode stylesheet (CLAUDE.md #2). It is a page of the pages router only because that is
 * the one way Next.js 16 lets an app replace that file; nothing else here uses that router.
 *
 * The words are the 500's own without the reference, since there is no error to name: the
 * heading, then "Try again in a minute; if it keeps happening, write to" the published address.
 * Light only, in the kit's classes (src/pages/_app.tsx brings the kit's stylesheet), and no
 * script at all: `unstable_runtimeJS: false` (beside the default runtime, which Next.js's own
 * type check needs to see named) leaves out Next.js's runtime and the page's data,
 * so the file needs no nonce (D-42) and works where nothing else does. The proxy answers a
 * request for /500 itself with the site's 404 (src/proxy.ts), as it does /_app, /_document and
 * /_error.
 */
export const config: PageConfig = { runtime: 'nodejs', unstable_runtimeJS: false }

export default function StaticServerError() {
  return (
    <main id="main">
      <ServerError />
    </main>
  )
}
