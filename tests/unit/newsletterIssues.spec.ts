import { describe, expect, it } from 'vitest'

import {
  ISSUE_MESSAGES,
  issueChangeProblem,
  issueNeedsSend,
  type IssueState,
} from '@/lib/newsletter/issueRules'

// What an editor may do to a newsletter issue, and when N4 is asked to plan its send
// (docs/19 §8; docs/06 N4).
const NOW = new Date('2026-12-01T04:30:00.000Z')
const LATER = '2026-12-03T03:30:00.000Z'
const EARLIER = '2026-11-30T03:30:00.000Z'
const draft: IssueState = { status: 'draft', scheduledFor: null }
const scheduled = (at = LATER): IssueState => ({ status: 'scheduled', scheduledFor: at })

describe('an editor’s change to an issue', () => {
  it('lets a draft be saved and scheduled for a time to come', () => {
    expect(issueChangeProblem(null, draft, NOW)).toBeNull()
    expect(issueChangeProblem(draft, scheduled(), NOW)).toBeNull()
  })

  it('asks for a time when an issue is scheduled without one', () => {
    expect(issueChangeProblem(draft, { status: 'scheduled', scheduledFor: null }, NOW)).toEqual({
      path: 'scheduledFor',
      message: ISSUE_MESSAGES.needsTime,
    })
  })

  it('refuses a time already past, with a minute’s grace', () => {
    expect(issueChangeProblem(draft, scheduled(EARLIER), NOW)?.message).toBe(ISSUE_MESSAGES.past)
    const justNow = new Date(NOW.getTime() - 30_000).toISOString()
    expect(issueChangeProblem(draft, scheduled(justNow), NOW)).toBeNull()
  })

  it('keeps an unchanged time on a scheduled issue whose time has come (N4 is sending it)', () => {
    expect(issueChangeProblem(scheduled(EARLIER), scheduled(EARLIER), NOW)).toBeNull()
  })

  it('never lets an editor mark an issue sending or sent', () => {
    for (const status of ['sending', 'sent'] as const) {
      expect(issueChangeProblem(scheduled(), { status, scheduledFor: LATER }, NOW)?.message).toBe(
        ISSUE_MESSAGES.sendOnly,
      )
    }
  })

  it('freezes an issue once it is being sent or has gone out', () => {
    const sending: IssueState = { status: 'sending', scheduledFor: EARLIER }
    const sent: IssueState = { status: 'sent', scheduledFor: EARLIER }
    expect(issueChangeProblem(sending, { ...sending, status: 'cancelled' }, NOW)?.message).toBe(
      ISSUE_MESSAGES.sending,
    )
    expect(issueChangeProblem(sent, sent, NOW)?.message).toBe(ISSUE_MESSAGES.sent)
  })

  it('lets a scheduled issue be cancelled before it sends', () => {
    expect(
      issueChangeProblem(scheduled(), { status: 'cancelled', scheduledFor: LATER }, NOW),
    ).toBeNull()
  })
})

describe('when N4 is asked to plan the send', () => {
  it('on scheduling, and when the time moves', () => {
    expect(issueNeedsSend(draft, scheduled())).toBe(true)
    expect(issueNeedsSend(null, scheduled())).toBe(true)
    expect(issueNeedsSend(scheduled(), scheduled('2026-12-04T03:30:00.000Z'))).toBe(true)
  })

  it('not for an edit that keeps the time, the same instant written differently, or a draft', () => {
    expect(issueNeedsSend(scheduled(), scheduled())).toBe(false)
    expect(issueNeedsSend(scheduled(), scheduled('2026-12-03T09:00:00.000+05:30'))).toBe(false)
    expect(issueNeedsSend(draft, draft)).toBe(false)
    expect(issueNeedsSend(scheduled(), { status: 'cancelled', scheduledFor: LATER })).toBe(false)
  })
})
