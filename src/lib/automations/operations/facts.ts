import type { PayloadRequest, Where } from 'payload'

import { heatOf, staleWhere, untouchedWhere } from '@/lib/pipeline/core/heat'
import { istDay } from '@/lib/time/ist'

import type { DeliveryCounts, DigestFacts, FunnelCounts, ReportFacts } from './sections'
import { FUNNEL, subdomainOf } from './sections'

/**
 * What the digest (O1) and the report (O2 with O10) read, at send time (docs/19 §9): counts and
 * references from each module's own collections, read with the server's access and never
 * written anywhere but into the staff email. M4's lead ages and expired proposals are read from
 * its leads and proposals; M5's privacy deadlines and incidents join as sections when it lands.
 */

const HOUR = 3_600_000
const DAY = 24 * HOUR

async function count(req: PayloadRequest, collection: string, where: Where): Promise<number> {
  const { totalDocs } = await req.payload.count({
    collection: collection as 'bookings',
    where,
    overrideAccess: true,
    req,
  })
  return totalDocs
}

/** The start and end of today in India, as instants. */
export function istToday(now: Date): { from: Date; to: Date } {
  const from = new Date(`${istDay(now)}T00:00:00+05:30`)
  return { from, to: new Date(from.getTime() + DAY) }
}

export async function readDigestFacts(req: PayloadRequest, now: Date): Promise<DigestFacts> {
  const { from, to } = istToday(now)
  const since = new Date(now.getTime() - DAY).toISOString()

  const { docs: today } = await req.payload.find({
    collection: 'bookings',
    where: {
      and: [
        { status: { equals: 'confirmed' } },
        { startsAt: { greater_than_equal: from.toISOString() } },
        { startsAt: { less_than: to.toISOString() } },
      ],
    },
    sort: 'startsAt',
    pagination: false,
    depth: 1,
    select: { reference: true, startsAt: true, format: true, practitioner: true },
    overrideAccess: true,
    req,
  })
  const { docs: requested } = await req.payload.find({
    collection: 'bookings',
    where: { status: { equals: 'requested' } },
    sort: 'createdAt',
    pagination: false,
    depth: 0,
    select: { reference: true, createdAt: true },
    overrideAccess: true,
    req,
  })

  return {
    sessions: today.map((booking) => ({
      startsAt: String(booking.startsAt),
      practitioner:
        booking.practitioner && typeof booking.practitioner === 'object'
          ? booking.practitioner.publicName
          : 'No practitioner',
      reference: booking.reference,
      format: booking.format ?? null,
    })),
    timeRequests: requested.map((booking) => ({
      reference: booking.reference,
      waitingHours: Math.floor((now.getTime() - Date.parse(booking.createdAt)) / HOUR),
    })),
    refundsAwaitingApproval: await count(req, 'refunds', {
      status: { equals: 'awaitingApproval' },
    }),
    reconciliationFlagged: await count(req, 'gateway-events', {
      and: [
        { source: { equals: 'reconciliation' } },
        { outcome: { equals: 'flagged' } },
        { receivedAt: { greater_than_equal: since } },
      ],
    }),
    failedMessages: await count(req, 'messages', {
      and: [{ status: { equals: 'failed' } }, { updatedAt: { greater_than_equal: since } }],
    }),
    unknownMessages: await count(req, 'messages', { status: { equals: 'unknown' } }),
    failedJobs: await count(req, 'payload-jobs', {
      and: [{ hasError: { equals: true } }, { updatedAt: { greater_than_equal: since } }],
    }),
    suppressed: await count(req, 'suppressions', { at: { greater_than_equal: since } }),
    reviewsAwaitingConsent: await count(req, 'testimonials', {
      status: { equals: 'consentRequested' },
    }),
    leads: await leadAges(req, now),
    proposalsExpired: await expiredProposals(req, since),
  }
}

/**
 * The leads that need someone (P3, P4), read as M4's board reads them (src/lib/pipeline/core/
 * heat.ts), so the digest and the board agree: untouched ones split by level, stale ones counted.
 */
async function leadAges(
  req: PayloadRequest,
  now: Date,
): Promise<{ amber: number; red: number; stale: number }> {
  const { docs } = await req.payload.find({
    collection: 'leads',
    where: untouchedWhere(now),
    pagination: false,
    depth: 0,
    select: { kind: true, stage: true, createdAt: true, touchedAt: true },
    overrideAccess: true,
    req,
  })
  let amber = 0
  let red = 0
  for (const lead of docs) {
    const heat = heatOf(lead as Parameters<typeof heatOf>[0], now)
    if (heat.state !== 'untouched') continue
    if (heat.level === 'red') red += 1
    else amber += 1
  }
  return { amber, red, stale: await count(req, 'leads', staleWhere(now)) }
}

/** Proposals that passed their last valid day since `since` (P8), by reference. */
async function expiredProposals(req: PayloadRequest, since: string): Promise<string[]> {
  const { docs } = await req.payload.find({
    collection: 'proposals',
    where: {
      and: [{ status: { equals: 'expired' } }, { expiredAt: { greater_than_equal: since } }],
    },
    sort: 'expiredAt',
    pagination: false,
    depth: 0,
    select: { reference: true },
    overrideAccess: true,
    req,
  })
  return docs.map((proposal) => proposal.reference).filter((ref): ref is string => Boolean(ref))
}

async function funnel(req: PayloadRequest, from: Date, to: Date): Promise<FunnelCounts> {
  const counts: FunnelCounts = {}
  for (const step of FUNNEL) {
    counts[step.name] = await count(req, 'analytics-events', {
      and: [
        { name: { equals: step.name } },
        { at: { greater_than_equal: from.toISOString() } },
        { at: { less_than: to.toISOString() } },
      ],
    })
  }
  return counts
}

const DELIVERY_STATUSES = ['sent', 'delivered', 'read', 'bounced', 'complained'] as const

export async function readReportFacts(req: PayloadRequest, now: Date): Promise<ReportFacts> {
  const weekAgo = new Date(now.getTime() - 7 * DAY)
  const twoWeeksAgo = new Date(now.getTime() - 14 * DAY)

  const { docs: missing } = await req.payload.find({
    collection: 'missing-pages',
    where: {
      and: [
        { lastSeen: { greater_than_equal: weekAgo.toISOString() } },
        { resolved: { exists: false } },
      ],
    },
    sort: '-hits',
    limit: 10,
    depth: 0,
    select: { path: true, hits: true },
    overrideAccess: true,
    req,
  })

  const { docs: sent } = await req.payload.find({
    collection: 'messages',
    where: {
      and: [
        { channel: { equals: 'email' } },
        { sentAt: { greater_than_equal: weekAgo.toISOString() } },
        { status: { in: [...DELIVERY_STATUSES] } },
      ],
    },
    pagination: false,
    depth: 0,
    select: { sender: true, status: true },
    overrideAccess: true,
    req,
  })
  const bySubdomain = new Map<string, DeliveryCounts>()
  for (const message of sent) {
    const subdomain = subdomainOf(message.sender)
    const row = bySubdomain.get(subdomain) ?? {
      subdomain,
      sent: 0,
      delivered: 0,
      bounced: 0,
      complained: 0,
    }
    row.sent += 1
    if (message.status === 'delivered' || message.status === 'read') row.delivered += 1
    if (message.status === 'bounced') row.bounced += 1
    if (message.status === 'complained') row.complained += 1
    bySubdomain.set(subdomain, row)
  }

  return {
    thisWeek: await funnel(req, weekAgo, now),
    lastWeek: await funnel(req, twoWeeksAgo, weekAgo),
    missingPages: missing.map((page) => ({ path: page.path, hits: page.hits })),
    emptySearches: await count(req, 'analytics-events', {
      and: [
        { name: { equals: 'search_no_results' } },
        { at: { greater_than_equal: weekAgo.toISOString() } },
      ],
    }),
    delivery: [...bySubdomain.values()].sort((a, b) => a.subdomain.localeCompare(b.subdomain)),
  }
}
