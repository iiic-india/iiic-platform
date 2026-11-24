import { TZDate } from '@date-fns/tz'
import { addHours, addMilliseconds, addMonths } from 'date-fns'

import { IST } from '@/lib/time/ist'

import { ACKNOWLEDGE_WITHIN_HOURS, type DeadlinesFor, RESOLVE_WITHIN } from './requests'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The two clocks of a privacy request, from when it reached IIIC (docs/05, Privacy; docs/08 §3,
 * §4; docs/18 §5). Pure: set once, when the request is recorded, and never moved.
 * - Every kind is acknowledged within 48 hours.
 * - A data request is resolved within an exact number of days (30).
 * - A consumer complaint or a privacy grievance within one calendar month in India time: the
 *   same day and time next month, or that month's last day when it has no such day (31 January
 *   ends on 28 or 29 February). The month is counted on India's calendar through @date-fns/tz, so
 *   a request received just after midnight in India is not counted from the UTC day before.
 */
export const deadlinesFor: DeadlinesFor = (type, receivedAt) => {
  const rule = RESOLVE_WITHIN[type]
  const resolveBy =
    'months' in rule
      ? new Date(addMonths(new TZDate(receivedAt.getTime(), IST), rule.months).getTime())
      : addMilliseconds(receivedAt, rule.days * DAY_MS)
  return { acknowledgeBy: addHours(receivedAt, ACKNOWLEDGE_WITHIN_HOURS), resolveBy }
}
