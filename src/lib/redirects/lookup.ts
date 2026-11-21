import 'server-only'

import { unstable_cache } from 'next/cache'
import { notFound, permanentRedirect, redirect } from 'next/navigation'
import { getPayload } from 'payload'
import { cache } from 'react'

import { PAGES_TAG } from '@/lib/content/revalidate'
import config from '@payload-config'

import { logMissingPage } from './log'
import type { RedirectStatus } from './paths'
import { REDIRECTS_TAG } from './revalidate'
import { finalTarget, readRedirects } from './table'

export type Redirect = { from: string; to: string; status: RedirectStatus }

/**
 * Every redirect, resolved to addresses, read once and cached until a redirect or a page
 * changes (docs/12 §1, §4): an address with no page is answered without the database being
 * asked. A redirect that leads to a page follows the page, so a page's change marks the table
 * stale too; every ten minutes it is read again whatever happened, the safety net docs/12 §4
 * sets for indexes. Read past the access rules, on the server only: it answers where an old
 * address leads, which a visitor learns by following it anyway.
 */
export const redirectTable = unstable_cache(
  async (): Promise<Redirect[]> => {
    const rules = await readRedirects(await getPayload({ config }))
    return rules.map(({ from, to, status }) => ({ from, to, status: status ?? '308' }))
  },
  ['redirect-table'],
  { tags: [REDIRECTS_TAG, PAGES_TAG], revalidate: 600 },
)

/**
 * The redirect from an address (src/lib/redirects/paths.ts), if there is one, straight to where
 * it leads in the end (src/lib/redirects/table.ts, finalTarget); once per request.
 */
export const redirectFor = cache(async (path: string | null): Promise<Redirect | null> => {
  if (!path) return null
  const table = new Map((await redirectTable()).map((rule) => [rule.from, rule]))
  const found = finalTarget(path, table)
  return found ? { from: path, to: found.to, status: found.status ?? '308' } : null
})

/**
 * Sends the visitor on when a redirect leads from the address (308 for a permanent move, 307
 * for a temporary one: what Next.js sends from a page); otherwise returns, and the caller
 * answers as it would have.
 */
export async function followRedirect(path: string | null): Promise<void> {
  const found = await redirectFor(path)
  if (!found) return
  if (found.status === '307') redirect(found.to)
  permanentRedirect(found.to)
}

/**
 * What a route answers for an address it has no page for (docs/02): the redirect from it, when
 * there is one, before the 404. A redirect from a page's old address also goes before a starter
 * page there (D-57; src/lib/content/pages.ts). Only here, where the answer is a 404, does the
 * address go into the 404 log (docs/11 §5.1, item 9; src/lib/redirects/log.ts): the 404 page
 * itself is rendered on every page view, so it cannot be what writes.
 */
export async function redirectOrNotFound(path: string | null): Promise<never> {
  await followRedirect(path)
  await logMissingPage()
  notFound()
}
