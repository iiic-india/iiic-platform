import { headers } from 'next/headers'
import Link from 'next/link'

import { isCounsellingPath } from '@/blocks/pageBlocks'
import { Scope } from '@/components/blocks/PageBlocks'

/**
 * The 404 inside the site's shell. The full page (D-29, docs/11 §5.1) is built in M2; item 8
 * is built now: on a counselling path (/counselling or /book/session and what lies under
 * them, the same test the page rule uses), the page carries the counselling scope statement
 * and the crisis numbers above the footer, since someone who followed a broken counselling
 * link may need them. The path is the one src/proxy.ts sets on every request, which
 * overwrites any value a client sends. Next adds the noindex tag to every 404 response.
 *
 * Item 9, the 404 log, is written by the route that answers with this page
 * (src/lib/redirects/lookup.ts, redirectOrNotFound), never here: Next.js renders this component
 * on every page of the segment, served or not, since it hands it to the layout as the page to
 * show should one be missing. Nothing here may write anything or count anything.
 */
export default async function NotFound() {
  const path = (await headers()).get('x-pathname') ?? ''
  return (
    <section className="iiic-page" style={{ paddingTop: 48, paddingBottom: 80 }}>
      <h1 style={{ margin: '0 0 16px' }}>Page not found</h1>
      <p className="iiic-lede iiic-prose">
        <Link className="iiic-link" href="/">
          Go to the home page
        </Link>
      </p>
      {isCounsellingPath(path) ? <Scope /> : null}
    </section>
  )
}
