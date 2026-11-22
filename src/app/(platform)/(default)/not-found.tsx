import { headers } from 'next/headers'

import { NotFoundPage } from '@/components/notFound/NotFoundPage'

/**
 * The 404 inside the site's shell (docs/11 §5.1; D-29; src/components/notFound/NotFoundPage.tsx):
 * the reflective page, or on a counselling path (/counselling or /book/session and what lies
 * under them, the same test the page rule uses) the plain one with the counselling scope
 * statement and the crisis numbers. The path is the one src/proxy.ts sets on every request,
 * which overwrites any value a client sends. The other route groups re-export this page in their
 * own register (docs/02). Next adds the noindex tag to every 404 response.
 *
 * Item 9, the 404 log, is written by the route that answers with this page
 * (src/lib/redirects/lookup.ts, redirectOrNotFound), never here: Next.js renders this component
 * on every page of the segment, served or not, since it hands it to the layout as the page to
 * show should one be missing. Nothing here may write anything or count anything.
 */
export default async function NotFound() {
  const path = (await headers()).get('x-pathname') ?? ''
  return <NotFoundPage path={path} />
}
