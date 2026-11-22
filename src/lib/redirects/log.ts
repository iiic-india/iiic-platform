import 'server-only'

import { headers } from 'next/headers'
import { after } from 'next/server'
import { getPayload } from 'payload'
import { cache } from 'react'

import { env } from '@/lib/env'
import { reportError } from '@/lib/monitoring/sentry'
import config from '@payload-config'

import { missingPageOf, WriteBudget, WRITES_PER_MINUTE } from './missingPages'
import { recordMissingPage } from './store'

/** This server's writes to the log in the current minute (src/lib/redirects/missingPages.ts). */
const budget = new WriteBudget(WRITES_PER_MINUTE)

/**
 * Called by a route as it answers an address with the 404, and by nothing else
 * (src/lib/redirects/lookup.ts, redirectOrNotFound): logs the address the visitor asked for
 * (docs/11 §5.1, item 9) after the response has gone, so the 404 waits for nothing. Never from
 * the 404 page's component, which Next.js renders on every page view. Once per request however
 * often it is called (React's cache), never for a prefetch, and never on a preview deployment,
 * which shares the production database and whose visitors are the team. A failed write is
 * reported, never shown: the visitor already has their page.
 */
export const logMissingPage = cache(async (): Promise<void> => {
  if (env().VERCEL_ENV === 'preview') return
  const entry = missingPageOf(await headers())
  if (!entry || !budget.take()) return
  after(async () => {
    try {
      await recordMissingPage(await getPayload({ config }), entry)
    } catch (error) {
      await reportError(error, { area: '404-log' })
    }
  })
})
