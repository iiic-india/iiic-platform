import type { TaskConfig } from 'payload'

import { recordAudit } from '@/lib/audit/record'
import { KEPT_FOR_DAYS } from '@/lib/redirects/missingPages'
import { purgeCutoff, purgeMissingPages } from '@/lib/redirects/store'

/**
 * O5 · Retention, for the 404 log (docs/06 O5; docs/04 `missing_pages`: purged after 180 days).
 * Removes every entry nobody has asked for in 180 days, resolved or not; a redirect made from one
 * stays. Idempotent: run twice, the second run finds nothing to remove. One audit entry records a
 * run that removed something (docs/08 §9), not one per entry: the entries are the log of visits,
 * which the 404 page writes without one (src/lib/redirects/store.ts).
 *
 * Nothing runs it on its own yet: Payload's autoRun is never used on Vercel (CLAUDE.md), and the
 * cron runner that queues O5 nightly arrives with the other automations in M6 (docs/07, Jobs).
 */
export const purgeMissingPagesTask: TaskConfig<{ input: object; output: { removed: number } }> = {
  slug: 'O5-purge-missing-pages',
  label: `O5 · Remove broken links not asked for in ${KEPT_FOR_DAYS} days`,
  // docs/06, Engine rules: three attempts, then the job fails where the team sees it.
  retries: 3,
  outputSchema: [{ name: 'removed', type: 'number', required: true }],
  handler: async ({ req }) => {
    const removed = await purgeMissingPages(req.payload, purgeCutoff())
    if (removed > 0) {
      await recordAudit(req, { action: 'purge-expired', entity: 'missing-pages' }, null)
    }
    return { output: { removed } }
  },
}
