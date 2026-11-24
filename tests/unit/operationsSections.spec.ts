import { describe, expect, it } from 'vitest'

import { retentionCutoffs } from '@/lib/automations/operations/retention'
import {
  dayVariant,
  digestSections,
  REPORT_PLACEHOLDERS,
  reportSections,
  subdomainOf,
  weekOnWeek,
  type DigestFacts,
} from '@/lib/automations/operations/sections'

// The digest's and the report's sections (docs/06 O1, O2, O10; docs/19 §9), O5's periods and the
// day key that makes O1 and O2 fire once a day. Fake references only.
const QUIET: DigestFacts = {
  sessions: [],
  timeRequests: [],
  refundsAwaitingApproval: 0,
  reconciliationFlagged: 0,
  failedMessages: 0,
  unknownMessages: 0,
  failedJobs: 0,
  suppressed: 0,
  reviewsAwaitingConsent: 0,
  leads: { amber: 0, red: 0, stale: 0 },
  proposalsExpired: [],
}

/** A section's lines by its title. */
const linesOf = (sections: ReturnType<typeof digestSections>, title: string) =>
  sections.find((section) => section.title === title)?.lines

describe('the daily digest (O1)', () => {
  it('reads as quiet on a quiet morning: every section, each with its nothing line', () => {
    expect(digestSections(QUIET)).toEqual([
      { title: 'Today’s sessions', lines: ['No sessions today.'] },
      { title: 'Time requests', lines: ['No time requests waiting.'] },
      { title: 'Leads and proposals', lines: ['No lead waiting, none stale.'] },
      { title: 'Payments', lines: ['Nothing waiting.'] },
      { title: 'Messages and jobs, last 24 hours', lines: ['Nothing failed.'] },
      { title: 'Reviews', lines: ['No reviews awaiting consent.'] },
    ])
  })

  it('lists sessions by practitioner and time in India, with references only', () => {
    const [sessions] = digestSections({
      ...QUIET,
      sessions: [
        {
          startsAt: '2026-12-01T09:30:00.000Z',
          practitioner: 'Fake A',
          reference: 'FAKE-2',
          format: 'office',
        },
        {
          startsAt: '2026-12-01T04:30:00.000Z',
          practitioner: 'Fake A',
          reference: 'FAKE-1',
          format: 'online',
        },
      ],
    })
    expect(sessions?.lines[0]).toBe('Fake A: 2 sessions')
    expect(sessions?.lines[1]).toContain('FAKE-1 · online')
    // 04:30 UTC is 10 AM in India (CLAUDE.md #8).
    expect(sessions?.lines[1]).toMatch(/^ {2}10 AM/)
    expect(sessions?.lines[2]).toContain('FAKE-2 · office')
  })

  it('flags time requests waiting over a day, and counts what failed', () => {
    const sections = digestSections({
      ...QUIET,
      timeRequests: [
        { reference: 'FAKE-R1', waitingHours: 30 },
        { reference: 'FAKE-R2', waitingHours: 2 },
      ],
      failedMessages: 1,
      failedJobs: 2,
      suppressed: 1,
    })
    expect(linesOf(sections, 'Time requests')).toEqual([
      '2 requests waiting',
      'Waiting over a day: FAKE-R1',
    ])
    expect(linesOf(sections, 'Messages and jobs, last 24 hours')).toEqual([
      '1 message failed',
      '2 jobs failed',
      '1 address stopped (bounce, spam or stop)',
    ])
  })

  it('counts the leads that need someone and names expired proposals by reference only (M4)', () => {
    const sections = digestSections({
      ...QUIET,
      leads: { amber: 2, red: 1, stale: 3 },
      proposalsExpired: ['IIIC-P-99901', 'IIIC-P-99902'],
    })
    expect(linesOf(sections, 'Leads and proposals')).toEqual([
      '1 lead untouched for over 48 hours',
      '2 leads untouched for over 24 hours',
      '3 leads with no activity for 7 days',
      'Proposals past their last valid day: IIIC-P-99901, IIIC-P-99902',
    ])
  })
})

describe('the weekly report (O2, O10)', () => {
  it('reads the funnel week on week, the top ten missing pages, and placeholders for what has no source', () => {
    const sections = reportSections({
      thisWeek: { door: 12 },
      lastWeek: { door: 9, step0: 4 },
      missingPages: Array.from({ length: 12 }, (_, i) => ({ path: `/fake-${i}`, hits: 12 - i })),
      emptySearches: 1,
      delivery: [{ subdomain: 'notify', sent: 5, delivered: 4, bounced: 1, complained: 0 }],
    })
    expect(sections[0]?.lines[0]).toBe('Door chosen: 12 (last week 9, +3)')
    expect(sections[0]?.lines[1]).toBe('Find your path answered: 0 (last week 4, -4)')
    expect(sections[1]?.lines).toHaveLength(10)
    expect(sections[2]?.lines).toEqual(['1 search found nothing'])
    expect(sections[3]?.lines[0]).toBe('notify: 5 sent, 4 delivered, 1 bounced, 0 marked as spam')
    expect(sections[4]?.lines).toEqual([REPORT_PLACEHOLDERS.whatsappQuality])
    expect(sections[5]?.lines).toEqual([REPORT_PLACEHOLDERS.costs])
  })

  it('says when nothing changed', () => {
    expect(weekOnWeek(3, 3)).toBe('3 (last week 3, no change)')
  })

  it('names the sending subdomain: the Journal from news, the rest from notify', () => {
    expect(subdomainOf('journal')).toBe('news')
    expect(subdomainOf('platform')).toBe('notify')
    expect(subdomainOf(null)).toBe('notify')
  })
})

describe('once a day, by the day in India', () => {
  it('keys a digest by the Indian date, so 23:00 UTC is already the next day', () => {
    expect(dayVariant(new Date('2026-12-01T03:00:00.000Z'))).toBe('d20261201')
    expect(dayVariant(new Date('2026-12-01T19:00:00.000Z'))).toBe('d20261202')
  })
})

describe('O5’s periods', () => {
  it('keeps a lapsed signup a day, the message log a year', () => {
    const now = new Date('2026-12-01T00:00:00.000Z')
    const cutoffs = retentionCutoffs(now)
    expect(cutoffs.pendingSignups.toISOString()).toBe('2026-11-30T00:00:00.000Z')
    expect(cutoffs.messages.toISOString()).toBe('2025-12-01T00:00:00.000Z')
  })
})
