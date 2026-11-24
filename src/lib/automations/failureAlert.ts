import 'server-only'

import type { PayloadRequest } from 'payload'

import { deliverWith } from '@/lib/messaging/deliver'
import { defaultMessagingDeps, type MessagingDeps } from '@/lib/messaging/deps'

/**
 * O3 · message or job failure (docs/06; docs/19 §9). Failures show on Today from the log and the
 * jobs list (M5 reads them); this task, run on each `message.failed` and `automation.failed`,
 * emails the active owners when three or more have failed within the last hour, at most once an
 * hour: the message's key carries the UTC hour, so a fourth or fifth failure that hour finds the
 * row already there and sends nothing more. The alert holds counts only: no name, no address, no
 * message body, nothing from counselling.
 */

export const ALERT_THRESHOLD = 3
const HOUR_MS = 3_600_000

export type FailureCounts = { messages: number; unanswered: number; jobs: number }

export const totalFailures = (counts: FailureCounts): number =>
  counts.messages + counts.unanswered + counts.jobs

/** The hour's tag in the alert's key, in UTC: `h2099010105` for 05:00 to 06:00 on 1 January 2099. */
export function alertHour(now: Date): string {
  return `h${now.toISOString().slice(0, 13).replace(/[-T]/g, '')}`
}

/** What failed in the hour before `now`: messages that failed, sends never answered, jobs. */
export async function failuresInLastHour(req: PayloadRequest, now: Date): Promise<FailureCounts> {
  const since = new Date(now.getTime() - HOUR_MS).toISOString()
  const count = async (status: 'failed' | 'unknown') =>
    (
      await req.payload.count({
        collection: 'messages',
        where: {
          and: [{ status: { equals: status } }, { updatedAt: { greater_than_equal: since } }],
        },
        overrideAccess: true,
        req,
      })
    ).totalDocs
  const jobs = await req.payload.count({
    collection: 'payload-jobs',
    where: {
      and: [{ hasError: { equals: true } }, { updatedAt: { greater_than_equal: since } }],
    },
    overrideAccess: true,
    req,
  })
  return {
    messages: await count('failed'),
    unanswered: await count('unknown'),
    jobs: jobs.totalDocs,
  }
}

/** The owners who receive it: active staff accounts with the owner role. */
async function activeOwners(req: PayloadRequest): Promise<number[]> {
  const { docs } = await req.payload.find({
    collection: 'users',
    where: { and: [{ roles: { contains: 'owner' } }, { active: { not_equals: false } }] },
    pagination: false,
    depth: 0,
    select: { active: true },
    overrideAccess: true,
    req,
  })
  return docs.map((doc) => doc.id)
}

export async function raiseFailureAlert(
  req: PayloadRequest,
  deps: MessagingDeps = defaultMessagingDeps(),
): Promise<{ failures: number; alerted: number }> {
  const now = deps.now()
  const failures = totalFailures(await failuresInLastHour(req, now))
  if (failures < ALERT_THRESHOLD) return { failures, alerted: 0 }
  const deliver = deliverWith(deps)
  let alerted = 0
  for (const ownerId of await activeOwners(req)) {
    const planned = await deliver(req, {
      automation: 'O3',
      template: 'failure-alert',
      channel: 'email',
      recipient: { kind: 'staff', id: ownerId },
      subject: { collection: 'users', id: ownerId },
      variant: alertHour(now),
      sendAt: now,
    })
    if (planned.ok && planned.value.created) alerted += 1
  }
  return { failures, alerted }
}
