// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { atIst, generateSlots, istDayOf, nextIstDay, weekdayOf } from '@/lib/booking/slots'
import type { SlotQuery, WeeklyHours } from '@/lib/booking/types'

// The slot engine (docs/16 §6; docs/03 F3, "Free times"): pure, UTC inside, India time at the
// edges. Every rule below is a fake test value, not IIIC's: hours, notice, horizon and buffer are
// set in the admin (CLAUDE.md #1).

/** An instant from India time, written the way the admin writes it. */
const ist = (day: string, clock: string) => atIst(day, clock)
const iso = (dates: readonly Date[]) => dates.map((date) => date.toISOString())

/** 2026-12-07 is a Monday. */
const MONDAY = '2026-12-07'

const allWeek = (start: string, end: string): WeeklyHours[] =>
  (['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const).map(
    (weekday) => ({ weekday, spans: [{ start, end }], validFrom: '2026-01-01' }),
  )

function query(overrides: Partial<SlotQuery> = {}): SlotQuery {
  return {
    now: ist(MONDAY, '06:00'),
    durationMinutes: 30,
    rules: { noticeHours: 0, horizonDays: 0, bufferMinutes: 15 },
    hours: [{ weekday: 'monday', spans: [{ start: '10:00', end: '12:00' }], validFrom: MONDAY }],
    exceptions: [],
    taken: [],
    ...overrides,
  }
}

describe('India time at the edges', () => {
  it('turns a day and a time of day in India into the instant, and back', () => {
    expect(ist(MONDAY, '10:00').toISOString()).toBe('2026-12-07T04:30:00.000Z')
    // Just after midnight in India is still the day before in UTC.
    expect(ist('2026-12-08', '00:30').toISOString()).toBe('2026-12-07T19:00:00.000Z')
    expect(istDayOf(new Date('2026-12-07T19:00:00.000Z'))).toBe('2026-12-08')
    expect(istDayOf(new Date('2026-12-07T18:29:59.000Z'))).toBe('2026-12-07')
  })

  it('names the day of the week and the next day, across a month and a year', () => {
    expect(weekdayOf(MONDAY)).toBe('monday')
    expect(weekdayOf('2026-12-13')).toBe('sunday')
    expect(nextIstDay('2026-12-31')).toBe('2027-01-01')
    expect(nextIstDay('2028-02-28')).toBe('2028-02-29')
  })
})

describe('the slot engine (docs/16 §6)', () => {
  it('runs starts from the span’s start every length plus buffer, while the buffer fits', () => {
    // 10:00–12:00, 30 minutes and a 15-minute buffer: 10:00, 10:45; 11:30 + 45 is past noon.
    const days = generateSlots(query())
    expect(days).toEqual([{ day: MONDAY, starts: [ist(MONDAY, '10:00'), ist(MONDAY, '10:45')] }])
  })

  it('offers a start whose session and buffer end exactly at the span’s end', () => {
    const days = generateSlots(
      query({ rules: { noticeHours: 0, horizonDays: 0, bufferMinutes: 30 }, durationMinutes: 30 }),
    )
    // 10:00 + 60 = 11:00, 11:00 + 60 = 12:00: both fit.
    expect(iso(days[0]?.starts ?? [])).toEqual(iso([ist(MONDAY, '10:00'), ist(MONDAY, '11:00')]))
  })

  it('takes each span of a day on its own, earliest first, with no repeats', () => {
    const days = generateSlots(
      query({
        hours: [
          {
            weekday: 'monday',
            spans: [
              { start: '15:00', end: '16:00' },
              { start: '10:00', end: '11:00' },
              { start: '10:00', end: '11:00' },
            ],
            validFrom: MONDAY,
          },
        ],
      }),
    )
    expect(iso(days[0]?.starts ?? [])).toEqual(iso([ist(MONDAY, '10:00'), ist(MONDAY, '15:00')]))
  })

  it('groups starts by the day in India, not in UTC', () => {
    // A span just after midnight in India: its instants fall on the UTC day before.
    const days = generateSlots(
      query({
        now: ist(MONDAY, '20:00'),
        rules: { noticeHours: 0, horizonDays: 1, bufferMinutes: 0 },
        hours: [
          { weekday: 'tuesday', spans: [{ start: '00:00', end: '01:00' }], validFrom: MONDAY },
        ],
      }),
    )
    expect(days).toEqual([
      { day: '2026-12-08', starts: [ist('2026-12-08', '00:00'), ist('2026-12-08', '00:30')] },
    ])
    expect(days[0]?.starts[0]?.toISOString()).toBe('2026-12-07T18:30:00.000Z')
  })

  it('reads today as the day in India when UTC is still on yesterday', () => {
    // 01:30 on Tuesday in India is 20:00 on Monday in UTC: Monday's hours are over.
    const days = generateSlots(
      query({
        now: new Date('2026-12-07T20:00:00.000Z'),
        rules: { noticeHours: 0, horizonDays: 0, bufferMinutes: 0 },
        hours: allWeek('10:00', '11:00'),
      }),
    )
    expect(days.map((day) => day.day)).toEqual(['2026-12-08'])
  })

  it('keeps the notice: nothing starts before now plus the notice hours', () => {
    const days = generateSlots(
      query({
        now: ist(MONDAY, '08:00'),
        rules: { noticeHours: 2, horizonDays: 0, bufferMinutes: 15 },
      }),
    )
    // Earliest is 10:00 exactly: offered. A minute later, it is not.
    expect(iso(days[0]?.starts ?? [])).toEqual(iso([ist(MONDAY, '10:00'), ist(MONDAY, '10:45')]))
    const later = generateSlots(
      query({
        now: ist(MONDAY, '08:01'),
        rules: { noticeHours: 2, horizonDays: 0, bufferMinutes: 15 },
      }),
    )
    expect(iso(later[0]?.starts ?? [])).toEqual(iso([ist(MONDAY, '10:45')]))
  })

  it('never offers a time already past, even with no notice', () => {
    const days = generateSlots(query({ now: ist(MONDAY, '10:20') }))
    expect(iso(days[0]?.starts ?? [])).toEqual(iso([ist(MONDAY, '10:45')]))
  })

  it('keeps the horizon: the last day is today plus the horizon, in India', () => {
    const days = generateSlots(
      query({
        now: ist(MONDAY, '23:00'),
        rules: { noticeHours: 0, horizonDays: 2, bufferMinutes: 0 },
        hours: allWeek('10:00', '10:30'),
      }),
    )
    expect(days.map((day) => day.day)).toEqual(['2026-12-08', '2026-12-09'])
  })

  it('lets the notice carry starts past the first days of the horizon', () => {
    const days = generateSlots(
      query({
        now: ist(MONDAY, '09:00'),
        rules: { noticeHours: 48, horizonDays: 3, bufferMinutes: 0 },
        hours: allWeek('10:00', '10:30'),
      }),
    )
    expect(days.map((day) => day.day)).toEqual(['2026-12-09', '2026-12-10'])
  })

  it('closes a day an exception closes', () => {
    const days = generateSlots(
      query({
        rules: { noticeHours: 0, horizonDays: 1, bufferMinutes: 0 },
        hours: allWeek('10:00', '10:30'),
        exceptions: [{ day: MONDAY, kind: 'closed' }],
      }),
    )
    expect(days.map((day) => day.day)).toEqual(['2026-12-08'])
  })

  it('replaces the day’s hours with an exception’s, inside the usual hours', () => {
    const days = generateSlots(
      query({
        rules: { noticeHours: 0, horizonDays: 0, bufferMinutes: 0 },
        hours: [
          { weekday: 'monday', spans: [{ start: '09:00', end: '18:00' }], validFrom: MONDAY },
        ],
        exceptions: [
          { day: MONDAY, kind: 'customHours', spans: [{ start: '14:00', end: '15:00' }] },
        ],
      }),
    )
    expect(days).toEqual([{ day: MONDAY, starts: [ist(MONDAY, '14:00'), ist(MONDAY, '14:30')] }])
  })

  it('treats an exception with other hours but no spans as closed', () => {
    const days = generateSlots(
      query({ exceptions: [{ day: MONDAY, kind: 'customHours', spans: [] }] }),
    )
    expect(days).toEqual([])
  })

  it('uses only hours valid on the day, and the newest when two are', () => {
    const hours: WeeklyHours[] = [
      { weekday: 'monday', spans: [{ start: '09:00', end: '09:30' }], validFrom: '2026-01-01' },
      { weekday: 'monday', spans: [{ start: '16:00', end: '16:30' }], validFrom: MONDAY },
      {
        weekday: 'monday',
        spans: [{ start: '20:00', end: '20:30' }],
        validFrom: '2026-01-01',
        validTo: '2026-11-30',
      },
    ]
    const days = generateSlots(
      query({ rules: { noticeHours: 0, horizonDays: 0, bufferMinutes: 0 }, hours }),
    )
    expect(iso(days[0]?.starts ?? [])).toEqual(iso([ist(MONDAY, '16:00')]))
    // Hours that start later, or ended before, offer nothing.
    expect(
      generateSlots(
        query({
          hours: [
            {
              weekday: 'monday',
              spans: [{ start: '10:00', end: '12:00' }],
              validFrom: '2026-12-08',
            },
            {
              weekday: 'monday',
              spans: [{ start: '10:00', end: '12:00' }],
              validFrom: '2026-01-01',
              validTo: '2026-12-06',
            },
          ],
        }),
      ),
    ).toEqual([])
  })

  it('removes the one start a busy block falls in, and keeps the grid', () => {
    // Grid 10:00, 10:45, 11:30, 12:15 on 10:00–13:00; busy 11:00–11:15 (plus the 15-minute gap
    // after it) takes 10:45 only.
    const days = generateSlots(
      query({
        hours: [
          { weekday: 'monday', spans: [{ start: '10:00', end: '13:00' }], validFrom: MONDAY },
        ],
        taken: [{ start: ist(MONDAY, '11:00'), end: ist(MONDAY, '11:15') }],
      }),
    )
    expect(iso(days[0]?.starts ?? [])).toEqual(
      iso([ist(MONDAY, '10:00'), ist(MONDAY, '11:30'), ist(MONDAY, '12:15')]),
    )
  })

  it('keeps the buffer free after something taken off the grid', () => {
    // A 15-minute option steps every 30 minutes; a booking 10:00–10:30 keeps 10:30–10:45 free.
    const days = generateSlots(
      query({
        durationMinutes: 15,
        taken: [{ start: ist(MONDAY, '10:00'), end: ist(MONDAY, '10:30') }],
      }),
    )
    expect(iso(days[0]?.starts ?? [])).toEqual(iso([ist(MONDAY, '11:00'), ist(MONDAY, '11:30')]))
  })

  it('keeps the buffer before something taken: a session and its gap end by its start', () => {
    // 10:45 + 30 minutes ends at 11:15, but its 15-minute gap would run into 11:20.
    const close = generateSlots(
      query({ taken: [{ start: ist(MONDAY, '11:20'), end: ist(MONDAY, '11:50') }] }),
    )
    expect(iso(close[0]?.starts ?? [])).toEqual(iso([ist(MONDAY, '10:00')]))
    // Session and gap end at 11:30 exactly, where the taken time starts: offered.
    const exact = generateSlots(
      query({ taken: [{ start: ist(MONDAY, '11:30'), end: ist(MONDAY, '12:00') }] }),
    )
    expect(iso(exact[0]?.starts ?? [])).toEqual(iso([ist(MONDAY, '10:00'), ist(MONDAY, '10:45')]))
  })

  it('carries a buffer across midnight into the next day', () => {
    // Monday ends with a booking until 23:50; the 30-minute gap after it runs to 00:20 on
    // Tuesday, so Tuesday's 00:00 start is not offered and the next on the grid, 01:00, is.
    const days = generateSlots(
      query({
        now: ist(MONDAY, '20:00'),
        durationMinutes: 30,
        rules: { noticeHours: 0, horizonDays: 1, bufferMinutes: 30 },
        hours: [
          { weekday: 'tuesday', spans: [{ start: '00:00', end: '02:00' }], validFrom: MONDAY },
        ],
        taken: [{ start: ist(MONDAY, '23:00'), end: ist(MONDAY, '23:50') }],
      }),
    )
    expect(days).toEqual([{ day: '2026-12-08', starts: [ist('2026-12-08', '01:00')] }])
  })

  it('never lets a session and its buffer run past the end of the day’s span', () => {
    // 23:00–23:59 with 45 minutes and a 30-minute buffer: the buffer would cross midnight.
    const days = generateSlots(
      query({
        durationMinutes: 45,
        rules: { noticeHours: 0, horizonDays: 0, bufferMinutes: 30 },
        hours: [
          { weekday: 'monday', spans: [{ start: '23:00', end: '23:59' }], validFrom: MONDAY },
        ],
      }),
    )
    expect(days).toEqual([])
  })

  it('leaves out days with no start, and offers nothing without hours', () => {
    expect(generateSlots(query({ hours: [] }))).toEqual([])
    const days = generateSlots(
      query({
        rules: { noticeHours: 0, horizonDays: 6, bufferMinutes: 0 },
        hours: [
          { weekday: 'wednesday', spans: [{ start: '10:00', end: '10:30' }], validFrom: MONDAY },
        ],
      }),
    )
    expect(days.map((day) => day.day)).toEqual(['2026-12-09'])
  })

  it('offers nothing for a length that is not a whole positive number of minutes', () => {
    for (const durationMinutes of [0, -30, 12.5, Number.NaN]) {
      expect(generateSlots(query({ durationMinutes })), String(durationMinutes)).toEqual([])
    }
  })

  it('treats ranges as half-open: a taken time ending at a start leaves it free', () => {
    const days = generateSlots(
      query({
        rules: { noticeHours: 0, horizonDays: 0, bufferMinutes: 0 },
        taken: [{ start: ist(MONDAY, '09:00'), end: ist(MONDAY, '10:00') }],
      }),
    )
    expect(days[0]?.starts[0]?.toISOString()).toBe(ist(MONDAY, '10:00').toISOString())
  })
})
