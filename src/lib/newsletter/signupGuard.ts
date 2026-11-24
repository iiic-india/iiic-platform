import type { Payload } from 'payload'

/**
 * The newsletter signup's limit kept in the database (docs/19 §8; docs/12 §5), beside the
 * per-instance first line (src/lib/newsletter/limit.ts), which each function instance keeps on its
 * own. A pending entry stores no network address, so the database counts the signups waiting for
 * confirmation across the site: past this many in the window, the form answers that it is busy
 * and nothing is stored or sent. Each pending signup sends one confirmation email, so this bounds
 * the mail a burst of signups can make the platform send. A monthly Journal from one institute
 * sees nowhere near it.
 */
export const RECENT_SIGNUPS = { max: 30, windowMs: 10 * 60 * 1000 } as const

/** Whether the site has taken as many new signups as it allows in the window. */
export async function signupsBusy(payload: Payload, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - RECENT_SIGNUPS.windowMs).toISOString()
  const { totalDocs } = await payload.count({
    collection: 'subscribers',
    where: { and: [{ status: { equals: 'pending' } }, { createdAt: { greater_than: since } }] },
    overrideAccess: true,
  })
  return totalDocs >= RECENT_SIGNUPS.max
}
