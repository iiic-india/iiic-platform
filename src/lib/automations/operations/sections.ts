import { formatIstTime, istDay } from '@/lib/time/ist'

/**
 * The daily digest's and the weekly report's sections (docs/06 O1, O2, O10; docs/19 §9), as pure
 * functions of the counts each module supplies. Counts and booking references only, never a
 * client's name, an address or anything said in counselling (CLAUDE.md #3; proposed, docs/19
 * §10). A section with nothing in it still shows, with its "nothing" line, so a quiet morning
 * reads as quiet rather than broken.
 */

export type Section = { title: string; lines: string[] }

/** One session today, as the digest lists it. */
export type SessionLine = {
  startsAt: string
  practitioner: string
  reference: string
  format: 'online' | 'office' | null
}

/** What O1 reads each morning (src/lib/automations/operations/facts.ts). */
export type DigestFacts = {
  sessions: SessionLine[]
  timeRequests: { reference: string; waitingHours: number }[]
  refundsAwaitingApproval: number
  reconciliationFlagged: number
  failedMessages: number
  unknownMessages: number
  failedJobs: number
  suppressed: number
  reviewsAwaitingConsent: number
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`

/** Time requests flagged on Today after a day without an answer (docs/06 B12). */
export const TIME_REQUEST_FLAG_HOURS = 24

export function digestSections(facts: DigestFacts): Section[] {
  const sessions = [...facts.sessions].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const byPractitioner = new Map<string, SessionLine[]>()
  for (const session of sessions) {
    const list = byPractitioner.get(session.practitioner) ?? []
    list.push(session)
    byPractitioner.set(session.practitioner, list)
  }
  const sessionLines = [...byPractitioner.entries()].flatMap(([practitioner, list]) => [
    `${practitioner}: ${plural(list.length, 'session', 'sessions')}`,
    ...list.map(
      (session) =>
        `  ${formatIstTime(new Date(session.startsAt))} · ${session.reference}${
          session.format === 'online' ? ' · online' : session.format === 'office' ? ' · office' : ''
        }`,
    ),
  ])

  const flagged = facts.timeRequests.filter((r) => r.waitingHours >= TIME_REQUEST_FLAG_HOURS)
  const requestLines = facts.timeRequests.length
    ? [
        plural(facts.timeRequests.length, 'request waiting', 'requests waiting'),
        ...(flagged.length
          ? [`Waiting over a day: ${flagged.map((r) => r.reference).join(', ')}`]
          : []),
      ]
    : ['No time requests waiting.']

  const money: string[] = []
  if (facts.refundsAwaitingApproval) {
    money.push(`${plural(facts.refundsAwaitingApproval, 'refund', 'refunds')} awaiting approval`)
  }
  if (facts.reconciliationFlagged) {
    money.push(
      `${plural(facts.reconciliationFlagged, 'payment', 'payments')} flagged by last night’s reconciliation`,
    )
  }

  const delivery: string[] = []
  if (facts.failedMessages) {
    delivery.push(`${plural(facts.failedMessages, 'message', 'messages')} failed`)
  }
  if (facts.unknownMessages) {
    delivery.push(
      `${plural(facts.unknownMessages, 'message', 'messages')} with no answer from the provider`,
    )
  }
  if (facts.failedJobs) delivery.push(`${plural(facts.failedJobs, 'job', 'jobs')} failed`)
  if (facts.suppressed) {
    delivery.push(`${plural(facts.suppressed, 'address', 'addresses')} stopped (bounce, spam or stop)`)
  }

  return [
    { title: 'Today’s sessions', lines: sessionLines.length ? sessionLines : ['No sessions today.'] },
    { title: 'Time requests', lines: requestLines },
    { title: 'Payments', lines: money.length ? money : ['Nothing waiting.'] },
    {
      title: 'Messages and jobs, last 24 hours',
      lines: delivery.length ? delivery : ['Nothing failed.'],
    },
    {
      title: 'Reviews',
      lines: [
        facts.reviewsAwaitingConsent
          ? `${plural(facts.reviewsAwaitingConsent, 'review', 'reviews')} awaiting the writer’s consent`
          : 'No reviews awaiting consent.',
      ],
    },
  ]
}

// ---- The weekly report (O2, with O10) ----

export type FunnelCounts = Record<string, number>

export type DeliveryCounts = {
  /** `notify` or `news`: the sending subdomain (docs/13 §2). */
  subdomain: string
  sent: number
  delivered: number
  bounced: number
  complained: number
}

export type ReportFacts = {
  thisWeek: FunnelCounts
  lastWeek: FunnelCounts
  missingPages: { path: string; hits: number }[]
  emptySearches: number
  delivery: DeliveryCounts[]
}

/** The funnel's steps in the order docs/00 reads them, with the labels of the analytics events. */
export const FUNNEL = [
  { name: 'door', label: 'Door chosen' },
  { name: 'step0', label: 'Find your path answered' },
  { name: 'booking_started', label: 'Booking started' },
  { name: 'time_chosen', label: 'Time chosen' },
  { name: 'booking_confirmed', label: 'Booking confirmed' },
  { name: 'request_submitted', label: 'Request sent' },
  { name: 'newsletter_confirmed', label: 'Newsletter confirmed' },
] as const

/** "12 (last week 9, +3)". */
export function weekOnWeek(now: number, before: number): string {
  const change = now - before
  const sign = change > 0 ? `+${change}` : change < 0 ? `${change}` : 'no change'
  return `${now} (last week ${before}, ${sign})`
}

/** Placeholders for what has no source yet (docs/19 §10): an owner's input until one exists. */
export const REPORT_PLACEHOLDERS = {
  whatsappQuality: '[[TODO: the WhatsApp quality rating, from the provider’s dashboard, I-03]]',
  costs: '[[TODO: the month’s cost lines (hosting, email, WhatsApp), an owner’s input]]',
} as const

export function reportSections(facts: ReportFacts): Section[] {
  const funnel = FUNNEL.map(
    (step) =>
      `${step.label}: ${weekOnWeek(facts.thisWeek[step.name] ?? 0, facts.lastWeek[step.name] ?? 0)}`,
  )
  const missing = facts.missingPages.length
    ? facts.missingPages.slice(0, 10).map((page) => `${page.path} · ${page.hits}`)
    : ['No missing pages asked for.']
  const delivery = facts.delivery.length
    ? facts.delivery.map(
        (row) =>
          `${row.subdomain}: ${row.sent} sent, ${row.delivered} delivered, ${row.bounced} bounced, ${row.complained} marked as spam`,
      )
    : ['Nothing sent this week.']
  return [
    { title: 'The funnel, this week', lines: funnel },
    { title: 'Pages asked for that do not exist (top ten)', lines: missing },
    {
      title: 'Searches',
      lines: [`${plural(facts.emptySearches, 'search', 'searches')} found nothing`],
    },
    { title: 'Email delivery by sending domain', lines: delivery },
    { title: 'WhatsApp quality', lines: [REPORT_PLACEHOLDERS.whatsappQuality] },
    { title: 'Costs', lines: [REPORT_PLACEHOLDERS.costs] },
  ]
}

/** The message variant for a day's digest or a week's report: one per day (or Monday) in India. */
export function dayVariant(now: Date): string {
  return `d${istDay(now).replace(/-/g, '')}`
}

/** The sending subdomain of a sender key (src/lib/messaging/senders.ts). */
export function subdomainOf(sender: string | null | undefined): string {
  return sender === 'journal' ? 'news' : 'notify'
}
