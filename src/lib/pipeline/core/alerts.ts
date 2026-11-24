import 'server-only'

import { inTransaction } from '@/lib/booking/guard'
import type { Lead } from '@/payload-types'

import type { RaiseLeadAlerts } from '../staleness'
import { emitPipelineEvent } from './emit'
import { heatOf, staleWhere, untouchedWhere } from './heat'

/**
 * The alerts job's work (P3, P4; docs/17 §7; src/lib/pipeline/staleness.ts, RaiseLeadAlerts):
 * `lead.untouched` once at amber and once at red, and `lead.stale` once per quiet spell, each
 * recorded in the lead's `alerts` in the same transaction as its event, so a second run raises
 * nothing. A lead first seen past 48 hours is raised at red only. The board reads heat from the
 * lead itself (heatOf); this only tells M5's Today and M6's digest, once.
 */

type Alerts = NonNullable<Lead['alerts']>

const sameInstant = (a: string | null | undefined, b: Date) =>
  typeof a === 'string' && new Date(a).getTime() === b.getTime()

export const raiseLeadAlerts: RaiseLeadAlerts = async (req, now) => {
  let untouched = 0
  let stale = 0

  const record = (lead: Lead, alerts: Alerts, raise: () => Promise<void>) =>
    inTransaction(req, async () => {
      await req.payload.update({
        collection: 'leads',
        id: lead.id,
        data: { alerts: { untouched: alerts.untouched, staleFor: alerts.staleFor } },
        depth: 0,
        overrideAccess: true,
        req,
      })
      await raise()
    })

  const waiting = await req.payload.find({
    collection: 'leads',
    where: untouchedWhere(now),
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  })
  for (const lead of waiting.docs as Lead[]) {
    const heat = heatOf(lead, now)
    if (heat.state !== 'untouched') continue
    const raised = lead.alerts?.untouched
    if (raised === heat.level || raised === 'red') continue
    await record(lead, { untouched: heat.level, staleFor: lead.alerts?.staleFor ?? null }, () =>
      emitPipelineEvent(req, { name: 'lead.untouched', leadId: lead.id, level: heat.level }),
    )
    untouched += 1
  }

  const quiet = await req.payload.find({
    collection: 'leads',
    where: staleWhere(now),
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  })
  for (const lead of quiet.docs as Lead[]) {
    const heat = heatOf(lead, now)
    if (heat.state !== 'stale' || sameInstant(lead.alerts?.staleFor, heat.since)) continue
    const since = heat.since.toISOString()
    await record(lead, { untouched: lead.alerts?.untouched ?? null, staleFor: since }, () =>
      emitPipelineEvent(req, { name: 'lead.stale', leadId: lead.id, since }),
    )
    stale += 1
  }

  return { untouched, stale }
}
