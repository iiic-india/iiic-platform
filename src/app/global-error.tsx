'use client'

import '@/brand/dist/iiic.min.css'

import { ServerError } from '@/components/site/ServerError'

import { fraunces, manrope } from './fonts'

/**
 * The 500 when a root layout itself fails (docs/11 §5.2): it replaces the layout, so it brings
 * its own <html> and <body>, the kit's styles and its two typefaces, and no header or footer,
 * which belong to the layout that failed. Next.js renders it in the browser with the page's own
 * scripts, which carry the request's nonce (src/proxy.ts, D-42). An error raised in the browser
 * has no digest, so the page then shows no reference.
 *
 * Not the static 500.html: Next.js 16 builds that file from its own page
 * (next/dist/client/components/builtin/app-error.js) and serves it only when it cannot render
 * this app at all; a page router's pages/500 would be the one way to replace it.
 */
export default function GlobalError({ error }: { error?: Error & { digest?: string } }) {
  return (
    <html lang="en-IN" className={`${manrope.variable} ${fraunces.variable}`}>
      <body>
        <main id="main">
          <ServerError reference={error?.digest} />
        </main>
      </body>
    </html>
  )
}
