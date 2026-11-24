import 'server-only'

import type { PayloadRequest } from 'payload'
import { z } from 'zod'

import type { Role } from '@/access/roles'
import { DIGEST_ROLES, REPORT_ROLES } from '@/emails/other/internal'
import type { TemplateKey } from '@/emails/registry'
import { purgeSignIns } from '@/lib/accounts/purge'
import { recordAudit } from '@/lib/audit/record'
import type { AutomationId } from '@/lib/automations/catalogue'

import { plan } from './core'
import { done, RecordId, type Outcome } from './outcome'
import { retentionCutoffs } from './retention'
import { dayVariant } from './sections'

/**
 * The operations automations of builder C (docs/06 O1, O2, O5, O6, O9, O10; docs/19 §9).
 * O1 and O2 plan one email per recipient per day, keyed by the day in India, so a second run the
 * same day plans nothing; their counts are read when each is sent.
 */

async function staffWith(req: PayloadRequest, roles: Role[]): Promise<number[]> {
  const { docs } = await req.payload.find({
    collection: 'users',
    where: { and: [{ roles: { in: roles } }, { active: { not_equals: false } }] },
    pagination: false,
    depth: 0,
    select: { roles: true },
    overrideAccess: true,
    req,
  })
  return docs.map((user) => user.id)
}

async function planStaffEmail(
  req: PayloadRequest,
  now: Date,
  automation: AutomationId,
  template: TemplateKey,
  roles: Role[],
): Promise<Outcome> {
  const recipients = await staffWith(req, roles)
  let planned = 0
  for (const id of recipients) {
    const result = await plan(req, {
      automation,
      template,
      channel: 'email',
      recipient: { kind: 'staff', id },
      subject: { collection: 'users', id },
      variant: dayVariant(now),
      sendAt: now,
    })
    if (!result.ok) return done(planned, result.error.code)
    if (result.value.created) planned += 1
  }
  return recipients.length ? done(planned) : done(0, 'no-recipients')
}

/** O1 · 08:30 IST: the digest to every active owner and operator. */
export const runO1 = (req: PayloadRequest, now: Date) =>
  planStaffEmail(req, now, 'O1', 'daily-digest', DIGEST_ROLES)

/** O2 with O10 · Monday 09:00 IST: the report to every active owner. */
export const runO2 = (req: PayloadRequest, now: Date) =>
  planStaffEmail(req, now, 'O2', 'weekly-report', REPORT_ROLES)

/**
 * O5 · nightly retention, for M6's records (docs/04; docs/19 §8, §3): pending newsletter signups
 * whose link has lapsed (the address was kept only to send it) and message log entries past a
 * year. M2's 404 log has its own purge (`O5-purge-missing-pages`); M5 adds its records' periods;
 * Release 2's accounts add what sign-in leaves behind (`purgeSignIns`, docs/20 §4.8). One audit
 * entry for a run that removed something, not one per entry.
 */
export async function runO5(req: PayloadRequest, now: Date): Promise<Outcome> {
  const cutoffs = retentionCutoffs(now)
  const pending = await req.payload.delete({
    collection: 'subscribers',
    where: {
      and: [
        { status: { equals: 'pending' } },
        { confirmExpiresAt: { less_than: cutoffs.pendingSignups.toISOString() } },
        { person: { exists: false } },
      ],
    },
    overrideAccess: true,
    req,
  })
  const messages = await req.payload.delete({
    collection: 'messages',
    where: { createdAt: { less_than: cutoffs.messages.toISOString() } },
    overrideAccess: true,
    req,
  })
  // What sign-in leaves behind: old sign-in requests, Better Auth's expired sessions and codes
  // (Release 2; docs/20 §4.8, §12 H9). It writes its own audit entry when it removes anything.
  await purgeSignIns(req, now)
  const removed = pending.docs.length + messages.docs.length
  if (removed > 0) {
    await recordAudit(req, { action: 'purge-expired', entity: 'subscribers' }, null)
  }
  return done(0, `removed:${pending.docs.length}:${messages.docs.length}`)
}

/**
 * O6 · the daily backup check. It needs a read-only Supabase management token, which nobody has
 * supplied yet (docs/19 §10); until then it answers `not-set-up`, which Today shows (M5).
 */
export async function runO6(): Promise<Outcome> {
  return done(0, 'not-set-up')
}

const SuppressionEvent = z.object({ suppressionId: RecordId })

/**
 * O9 · on `message.suppressed`: the suppression list is what stops the sends (the core reads it
 * before every message); O9 records that the address was marked, once, in the audit log without
 * the address, for Today and the digest. N3 takes a suppressed address off the newsletter.
 */
export async function runO9(req: PayloadRequest, input: unknown): Promise<Outcome> {
  const { suppressionId } = SuppressionEvent.parse(input)
  const suppression = await req.payload.findByID({
    collection: 'suppressions',
    id: suppressionId,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
  if (!suppression) return done(0, 'not-found')
  await recordAudit(
    req,
    { action: 'address-suppressed', entity: 'suppressions', entityId: String(suppression.id) },
    null,
  )
  return done(0, `${suppression.channel}:${suppression.reason}`)
}
