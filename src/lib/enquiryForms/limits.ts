import 'server-only'

import type { Payload } from 'payload'

/**
 * The forms' rate limits (docs/17 §6): at most five enquiries an hour from one network address,
 * counted by the submitter hash, and three a day from one email address. Past either the form
 * says IIIC already has their requests and gives the office's email. Counted from the enquiries
 * stored, so a robot's submission, which stores nothing, counts for nothing. Vercel's firewall
 * rule on the forms comes in M7 (docs/12 §5).
 */
export const LIMITS = {
  perAddress: { count: 5, windowMs: 60 * 60 * 1000 },
  perEmail: { count: 3, windowMs: 24 * 60 * 60 * 1000 },
} as const

/** How many enquiries were stored since a moment, by submitter hash or by email address. */
export type RecentEnquiries = {
  fromSubmitter: (hashes: readonly string[], since: Date) => Promise<number>
  fromEmail: (email: string, since: Date) => Promise<number>
}

/** The counts as the database holds them, read past the access rules (the server's own check). */
export function recentEnquiries(payload: Payload): RecentEnquiries {
  const count = async (where: Parameters<Payload['count']>[0]['where']) =>
    (await payload.count({ collection: 'enquiries', where, overrideAccess: true })).totalDocs
  return {
    fromSubmitter: (hashes, since) =>
      count({
        and: [
          { submitterHash: { in: [...hashes] } },
          { receivedAt: { greater_than: since.toISOString() } },
        ],
      }),
    fromEmail: (email, since) =>
      count({
        and: [
          { 'submitted.email': { equals: email } },
          { receivedAt: { greater_than: since.toISOString() } },
        ],
      }),
  }
}

/** For tests: the enquiries already stored, as hash, email and time. */
export function fakeRecentEnquiries(
  stored: readonly { submitterHash: string; email: string; receivedAt: Date }[],
): RecentEnquiries {
  return {
    fromSubmitter: async (hashes, since) =>
      stored.filter((row) => hashes.includes(row.submitterHash) && row.receivedAt > since).length,
    fromEmail: async (email, since) =>
      stored.filter((row) => row.email === email && row.receivedAt > since).length,
  }
}
