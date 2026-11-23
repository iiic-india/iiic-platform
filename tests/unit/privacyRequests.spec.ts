// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { clockState, incidentClocks, requestClocks } from '@/lib/privacy/breachClocks'
import { deadlinesFor } from '@/lib/privacy/deadlines'
import { REQUEST_TYPES } from '@/lib/privacy/requests'

// The clocks of a privacy request and of a breach (docs/05, Privacy; docs/08 §3, §4; docs/18 §5):
// acknowledged within 48 hours, resolved within 30 days or, for a complaint, one calendar month in
// India time; CERT-In within 6 hours and the Board within 72 from detection.

/** An instant written in India time (+05:30), so each case reads as the office would. */
const ist = (local: string) => new Date(`${local}+05:30`)

describe('a request’s deadlines (DeadlinesFor)', () => {
  it('acknowledges every kind within 48 hours of receipt', () => {
    const received = ist('2027-02-10T09:15:00')
    for (const { value } of REQUEST_TYPES) {
      expect(deadlinesFor(value, received).acknowledgeBy, value).toEqual(ist('2027-02-12T09:15:00'))
    }
  })

  it('resolves a data request within 30 exact days', () => {
    const received = ist('2027-02-10T09:15:00')
    for (const type of ['access', 'correction', 'erasure', 'withdrawal', 'nomination'] as const) {
      expect(deadlinesFor(type, received).resolveBy, type).toEqual(ist('2027-03-12T09:15:00'))
    }
  })

  it('resolves a complaint within one calendar month in India time', () => {
    expect(deadlinesFor('consumerComplaint', ist('2027-02-10T09:15:00')).resolveBy).toEqual(
      ist('2027-03-10T09:15:00'),
    )
    expect(deadlinesFor('privacyGrievance', ist('2027-04-30T18:00:00')).resolveBy).toEqual(
      ist('2027-05-30T18:00:00'),
    )
  })

  it('ends a month that has no such day on its last day', () => {
    expect(deadlinesFor('consumerComplaint', ist('2027-01-31T10:00:00')).resolveBy).toEqual(
      ist('2027-02-28T10:00:00'),
    )
    expect(deadlinesFor('privacyGrievance', ist('2028-01-31T10:00:00')).resolveBy).toEqual(
      ist('2028-02-29T10:00:00'),
    )
    expect(deadlinesFor('privacyGrievance', ist('2027-03-31T10:00:00')).resolveBy).toEqual(
      ist('2027-04-30T10:00:00'),
    )
  })

  it('counts the month in India, not in UTC, near midnight', () => {
    // 31 January, 00:30 in India is still 30 January in UTC: the month ends on 28 February in
    // India, not on 2 March, nor on 28 February in UTC.
    const received = ist('2027-01-31T00:30:00')
    expect(received.toISOString()).toBe('2027-01-30T19:00:00.000Z')
    expect(deadlinesFor('consumerComplaint', received).resolveBy).toEqual(
      ist('2027-02-28T00:30:00'),
    )
  })

  it('carries a December complaint into the next year', () => {
    expect(deadlinesFor('consumerComplaint', ist('2027-12-31T23:59:00')).resolveBy).toEqual(
      ist('2028-01-31T23:59:00'),
    )
  })
})

describe('a breach’s clocks (IncidentClocks)', () => {
  it('runs CERT-In’s 6 hours and the Board’s 72 from detection', () => {
    const detected = ist('2027-06-01T22:40:00')
    expect(incidentClocks(detected)).toEqual({
      certInBy: ist('2027-06-02T04:40:00'),
      boardBy: ist('2027-06-04T22:40:00'),
    })
  })
})

describe('one clock’s state (ClockState)', () => {
  const due = ist('2027-06-02T04:40:00')

  it('is done once the step has its time, early or late', () => {
    const at = ist('2027-06-02T08:00:00')
    expect(clockState({ dueAt: due, doneAt: at }, ist('2027-06-03T00:00:00'))).toEqual({
      state: 'done',
      at,
    })
  })

  it('counts whole hours left, rounding down, while it runs', () => {
    expect(clockState({ dueAt: due }, ist('2027-06-01T23:10:00'))).toEqual({
      state: 'running',
      dueAt: due,
      hoursLeft: 5,
    })
    expect(clockState({ dueAt: due }, ist('2027-06-02T04:39:00'))).toEqual({
      state: 'running',
      dueAt: due,
      hoursLeft: 0,
    })
  })

  it('counts whole hours late, rounding up, once it has passed', () => {
    expect(clockState({ dueAt: due }, ist('2027-06-02T04:40:00'))).toEqual({
      state: 'overdue',
      dueAt: due,
      hoursLate: 0,
    })
    expect(clockState({ dueAt: due }, ist('2027-06-02T05:41:00'))).toEqual({
      state: 'overdue',
      dueAt: due,
      hoursLate: 2,
    })
  })

  it('does not apply when there is no deadline or the step is not needed', () => {
    expect(clockState({}, new Date())).toEqual({ state: 'not-applicable' })
    expect(clockState({ dueAt: due, applies: false }, new Date())).toEqual({
      state: 'not-applicable',
    })
  })
})

describe('a request’s two clocks as the Privacy view shows them', () => {
  const received = ist('2027-02-10T09:15:00')
  const request = {
    acknowledgeBy: ist('2027-02-12T09:15:00').toISOString(),
    resolveBy: ist('2027-03-12T09:15:00').toISOString(),
  }

  it('runs both until they are met', () => {
    const now = ist('2027-02-11T09:15:00')
    expect(requestClocks(request, now)).toEqual({
      acknowledge: { state: 'running', dueAt: new Date(request.acknowledgeBy), hoursLeft: 24 },
      resolve: { state: 'running', dueAt: new Date(request.resolveBy), hoursLeft: 696 },
    })
    expect(received < now).toBe(true)
  })

  it('stops the acknowledgement clock when acknowledged and both when closed', () => {
    const acknowledgedAt = ist('2027-02-11T10:00:00')
    const closedAt = ist('2027-03-01T10:00:00')
    const clocks = requestClocks(
      {
        ...request,
        acknowledgedAt: acknowledgedAt.toISOString(),
        resolution: { closedAt: closedAt.toISOString() },
      },
      ist('2027-04-01T00:00:00'),
    )
    expect(clocks.acknowledge).toEqual({ state: 'done', at: acknowledgedAt })
    expect(clocks.resolve).toEqual({ state: 'done', at: closedAt })
  })
})
