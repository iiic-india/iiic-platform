import { type PostgresAdapter, sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { KEPT_FOR_DAYS, MISSING_PAGES_CAP, type MissingPage } from './missingPages'

/**
 * The 404 log's writes, straight to its table (docs/04 `missing_pages`). A visit is one
 * statement: it adds the address, or counts one more visit to it, in a single write that two
 * visits at once cannot split. These writes come from visitors, not from anyone's decision, so
 * they pass by the collection's hooks and the audit log, as Payload's own bookkeeping does;
 * what staff do to an entry in the admin is audited as usual (src/plugins/auditLog.ts).
 */

const drizzleOf = (payload: Payload) => (payload.db as unknown as PostgresAdapter).drizzle

/**
 * Logs one visit to an address the site has no page at. A new address is added only while the
 * log holds fewer than MISSING_PAGES_CAP; an address already there counts the visit, moves its
 * last-seen time and keeps the latest referring host the browser sent.
 */
export async function recordMissingPage(
  payload: Payload,
  { path, referrerHost }: MissingPage,
): Promise<void> {
  await drizzleOf(payload).execute(sql`
    INSERT INTO "missing_pages" ("path", "referrer_host", "first_seen", "last_seen", "hits")
    SELECT ${path}, ${referrerHost}, now(), now(), 1
    WHERE (SELECT count(*) FROM "missing_pages") < ${MISSING_PAGES_CAP}
      OR EXISTS (SELECT 1 FROM "missing_pages" WHERE "path" = ${path})
    ON CONFLICT ("path") DO UPDATE SET
      "hits" = "missing_pages"."hits" + 1,
      "last_seen" = excluded."last_seen",
      "referrer_host" = coalesce(excluded."referrer_host", "missing_pages"."referrer_host"),
      "updated_at" = now()
  `)
}

/** The moment before which an entry nobody has asked for again is removed. */
export function purgeCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - KEPT_FOR_DAYS * 24 * 60 * 60 * 1000)
}

/**
 * Removes the entries last asked for before the cutoff (docs/04: purged after 180 days) and
 * answers how many went. A resolved entry goes too: its redirect stays.
 */
export async function purgeMissingPages(payload: Payload, cutoff: Date): Promise<number> {
  const result = await drizzleOf(payload).execute(sql`
    DELETE FROM "missing_pages" WHERE "last_seen" < ${cutoff.toISOString()}
  `)
  return result.rowCount ?? 0
}
