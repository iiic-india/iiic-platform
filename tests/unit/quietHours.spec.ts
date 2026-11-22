// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { DEFAULT_QUIET_HOURS, inQuietHours, minutesOf } from '@/lib/settings/quietHours'
import { formatIstDate, formatIstTime, istDay, istMinutes } from '@/lib/time/ist'

// Quiet hours (docs/06, Engine rules; docs/04 `settings`): 21:00 to 08:00 India time by default,
// read in India whatever the server's own zone (CLAUDE.md #8). India is UTC+05:30 all year.

/** A moment given as a time of day in India on a fake day, 1 December 2026. */
const ist = (time: string) => new Date(`2026-12-01T${time}:00+05:30`)

describe('India time', () => {
  it('reads the day and the time of day in India, not in the server’s zone', () => {
    // 18:29 UTC is 23:59 in India; 18:30 UTC is midnight, the next day.
    expect(istDay(new Date('2026-12-01T18:29:00Z'))).toBe('2026-12-01')
    expect(istDay(new Date('2026-12-01T18:30:00Z'))).toBe('2026-12-02')
    expect(istMinutes(new Date('2026-12-01T18:29:00Z'))).toBe(23 * 60 + 59)
    expect(istMinutes(new Date('2026-12-01T18:30:00Z'))).toBe(0)
    expect(istMinutes(ist('08:00'))).toBe(480)
  })

  it('writes a date as VOICE.md does', () => {
    expect(formatIstDate(new Date('2027-01-04T20:00:00Z'))).toBe('5 January 2027')
    expect(formatIstTime(new Date('2027-01-04T04:30:00Z'))).toBe('10 AM')
    expect(formatIstTime(new Date('2027-01-04T10:00:00Z'))).toBe('3:30 PM')
    expect(formatIstTime(new Date('2027-01-04T18:30:00Z'))).toBe('12 AM')
  })
})

describe('quiet hours', () => {
  it('are 21:00 to 08:00 by default', () => {
    expect(DEFAULT_QUIET_HOURS).toEqual({ start: '21:00', end: '08:00' })
  })

  it('begin at their start and end at their end, across midnight', () => {
    expect(inQuietHours(ist('20:59'))).toBe(false)
    expect(inQuietHours(ist('21:00'))).toBe(true)
    expect(inQuietHours(ist('23:59'))).toBe(true)
    expect(inQuietHours(ist('00:00'))).toBe(true)
    expect(inQuietHours(ist('07:59'))).toBe(true)
    expect(inQuietHours(ist('08:00'))).toBe(false)
    expect(inQuietHours(ist('12:00'))).toBe(false)
  })

  it('take the owner’s window, within one day or across midnight', () => {
    const afternoon = { start: '13:00', end: '14:30' }
    expect(inQuietHours(ist('12:59'), afternoon)).toBe(false)
    expect(inQuietHours(ist('13:00'), afternoon)).toBe(true)
    expect(inQuietHours(ist('14:29'), afternoon)).toBe(true)
    expect(inQuietHours(ist('14:30'), afternoon)).toBe(false)
    const late = { start: '22:30', end: '06:00' }
    expect(inQuietHours(ist('22:00'), late)).toBe(false)
    expect(inQuietHours(ist('05:59'), late)).toBe(true)
  })

  it('are no window at all when they start and end at the same minute', () => {
    for (const time of ['00:00', '09:00', '21:00']) {
      expect(inQuietHours(ist(time), { start: '09:00', end: '09:00' })).toBe(false)
    }
  })

  it('fall back to the defaults for a time that is not one', () => {
    expect(minutesOf('21:00')).toBe(1260)
    for (const bad of ['9 PM', '24:00', '21:60', '', null, 2100]) {
      expect(minutesOf(bad), String(bad)).toBeNull()
    }
    expect(inQuietHours(ist('22:00'), { start: 'fake', end: 'fake' })).toBe(true)
  })
})
