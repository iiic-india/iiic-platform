import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

/**
 * Removes the jobs a test's writes queued for its own records: bookings and practitioners (the
 * calendar's B2, B7 and B14 take only ids as input, src/lib/calendar/queue.ts; B8 and B9 on
 * attendance marking), and since the M5 join, privacy requests (O4, O7) and incidents (O8),
 * whose creation queues M6's jobs. Left behind, they would be picked up by the next file that
 * runs the job queue, outside this file's module mocks.
 */
export async function removeQueuedJobs(
  payload: Payload,
  ids: {
    bookingIds?: readonly number[]
    practitionerIds?: readonly number[]
    dataRequestIds?: readonly number[]
    incidentIds?: readonly number[]
    suppressionIds?: readonly number[]
  },
): Promise<void> {
  const keys = [
    ...(ids.bookingIds ?? []).map((id) => ['bookingId', id] as const),
    ...(ids.practitionerIds ?? []).map((id) => ['practitionerId', id] as const),
    ...(ids.dataRequestIds ?? []).map((id) => ['dataRequestId', id] as const),
    ...(ids.incidentIds ?? []).map((id) => ['incidentId', id] as const),
    // A suppressed address queues O9 and N3 (src/collections/Suppressions.ts).
    ...(ids.suppressionIds ?? []).map((id) => ['suppressionId', id] as const),
  ]
  for (const [key, id] of keys) {
    await payload.db.drizzle.execute(
      sql`DELETE FROM "payload_jobs" WHERE "input"->>${key} = ${String(id)}`,
    )
  }
}
