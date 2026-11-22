// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bookingView } from '@/lib/calendar/bookingEvent'
import { buildFeed, buildInvite, clientInvite, feedEvent } from '@/lib/calendar/ics'
import type { InviteInput } from '@/lib/calendar/invites'
import type { Booking } from '@/payload-types'

// The client's invite and the practitioners' feeds (D-22; docs/16 §7), written by the `ics`
// library: times in UTC, one UID per booking for its whole life, SEQUENCE raised on each change
// and METHOD:CANCEL on cancellation, so Google, Apple and Outlook replace or remove the event
// they already hold. No price and nothing said in a session (D-21, CLAUDE.md #3). Fake values.

const SITE = 'https://fake.example.invalid'
const ORGANIZER = { name: 'IIIC', email: 'bookings@fake.example.invalid' }
const ATTENDEE = { name: 'Fakeasha Fakesurname', email: 'client@example.invalid' }

const base: InviteInput = {
  uid: 'IIIC-S-00001@fake.example.invalid',
  sequence: 0,
  method: 'REQUEST',
  start: new Date('2099-01-05T04:30:00.000Z'),
  end: new Date('2099-01-05T05:15:00.000Z'),
  title: 'Fake one-to-one session',
  description: 'Fake description',
  location: null,
  url: 'https://meet.example.invalid/fake-event-1',
}

/** The invite's lines, unfolded as a calendar reads them (RFC 5545 §3.1). */
const lines = (text: string) => text.replace(/\r\n[ \t]/g, '').split('\r\n')

const built = (input: Parameters<typeof buildInvite>[0]) => {
  const result = buildInvite(input)
  if (!result.ok) throw new Error(`invite refused: ${result.error.code}`)
  return result.value
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2098-12-20T06:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('buildInvite', () => {
  it('writes a new booking as a request the client’s calendar adds', () => {
    const text = built({ ...base, organizer: ORGANIZER, attendee: ATTENDEE })
    expect(text.endsWith('\r\n')).toBe(true)
    expect(text.split('\r\n').every((line) => !line.includes('\n'))).toBe(true)
    const all = lines(text)
    expect(all).toContain('BEGIN:VCALENDAR')
    expect(all).toContain('VERSION:2.0')
    expect(all).toContain('PRODID:-//Indian Institute of Image Catalysts//Bookings//EN')
    expect(all).toContain('METHOD:REQUEST')
    expect(all).toContain('UID:IIIC-S-00001@fake.example.invalid')
    expect(all).toContain('SEQUENCE:0')
    expect(all).toContain('STATUS:CONFIRMED')
    // Instants in UTC: 10 AM in India is 04:30 UTC.
    expect(all).toContain('DTSTART:20990105T043000Z')
    expect(all).toContain('DTEND:20990105T051500Z')
    expect(all).toContain('DTSTAMP:20981220T060000Z')
    expect(all).toContain('SUMMARY:Fake one-to-one session')
    expect(all).toContain('URL:https://meet.example.invalid/fake-event-1')
    expect(all).toContain('ORGANIZER;CN="IIIC":MAILTO:bookings@fake.example.invalid')
    expect(all.some((line) => line.startsWith('ATTENDEE;RSVP=FALSE;'))).toBe(true)
    expect(all.some((line) => line.endsWith(':mailto:client@example.invalid'))).toBe(true)
    expect(all.filter((line) => line === 'BEGIN:VEVENT')).toHaveLength(1)
  })

  it('writes a change with the same UID and a higher SEQUENCE, so the event moves', () => {
    const all = lines(
      built({
        ...base,
        sequence: 1,
        start: new Date('2099-01-06T08:30:00.000Z'),
        end: new Date('2099-01-06T09:15:00.000Z'),
      }),
    )
    expect(all).toContain('METHOD:REQUEST')
    expect(all).toContain('UID:IIIC-S-00001@fake.example.invalid')
    expect(all).toContain('SEQUENCE:1')
    expect(all).toContain('DTSTART:20990106T083000Z')
  })

  it('writes a cancellation the client’s calendar removes', () => {
    const all = lines(built({ ...base, method: 'CANCEL', sequence: 2 }))
    expect(all).toContain('METHOD:CANCEL')
    expect(all).toContain('STATUS:CANCELLED')
    expect(all).toContain('UID:IIIC-S-00001@fake.example.invalid')
    expect(all).toContain('SEQUENCE:2')
  })

  it('escapes text the way calendars read it', () => {
    const all = lines(
      built({ ...base, location: 'Fake 408, Fake Road; Fakeville', description: 'One\nTwo' }),
    )
    expect(all).toContain('LOCATION:Fake 408\\, Fake Road\\; Fakeville')
    expect(all).toContain('DESCRIPTION:One\\nTwo')
  })

  it('refuses an invite the library cannot write, as a typed failure', () => {
    expect(buildInvite({ ...base, url: 'not a link' })).toEqual({
      ok: false,
      error: { code: 'invalid-invite' },
    })
    expect(buildInvite({ ...base, start: new Date('not a date') })).toEqual({
      ok: false,
      error: { code: 'invalid-invite' },
    })
  })
})

describe('clientInvite', () => {
  const booking = {
    reference: 'IIIC-S-00002',
    type: 'session',
    format: 'online',
    startsAt: '2099-01-05T04:30:00.000Z',
    endsAt: '2099-01-05T05:15:00.000Z',
  } as Booking
  const view = bookingView({
    booking,
    service: { name: 'Fake one-to-one session', format: 'online' },
    client: { fullName: 'Fakeasha Fakesurname' },
    officeAddress: 'Fake office address',
  })

  it('names the service, the reference and the Meet link, never a price or the manage link', () => {
    const invite = clientInvite({
      view,
      rootReference: 'IIIC-S-00001',
      changes: 1,
      cancelled: false,
      meetingUrl: 'https://meet.example.invalid/fake',
      practitionerName: 'Fake Practitioner',
      siteUrl: SITE,
    })
    expect(invite).toMatchObject({
      uid: 'IIIC-S-00001@fake.example.invalid',
      sequence: 1,
      method: 'REQUEST',
      title: 'Fake one-to-one session',
      location: null,
      url: 'https://meet.example.invalid/fake',
    })
    expect(invite?.description).toContain('IIIC-S-00002')
    expect(invite?.description).toContain('https://meet.example.invalid/fake')
    expect(invite?.description).toContain('Fake Practitioner')
    expect(invite?.description).not.toMatch(/₹|paise|price|\/b\//i)
  })

  it('puts the office address in the location for a session there', () => {
    const invite = clientInvite({
      view: { ...view, format: 'office' },
      rootReference: 'IIIC-S-00002',
      changes: 0,
      cancelled: false,
      meetingUrl: null,
      practitionerName: null,
      siteUrl: SITE,
    })
    expect(invite).toMatchObject({ location: 'Fake office address', url: null, sequence: 0 })
  })

  it('cancels with the next SEQUENCE after the last change', () => {
    const invite = clientInvite({
      view,
      rootReference: 'IIIC-S-00001',
      changes: 1,
      cancelled: true,
      meetingUrl: null,
      practitionerName: null,
      siteUrl: SITE,
    })
    expect(invite).toMatchObject({ method: 'CANCEL', sequence: 2 })
  })
})

describe('buildFeed', () => {
  it('lists a practitioner’s bookings as a feed calendars subscribe to', () => {
    const result = buildFeed([
      {
        uid: 'IIIC-S-00001@fake.example.invalid',
        start: base.start,
        end: base.end,
        title: 'Fake session · Fakeasha · IIIC-S-00001',
        description: '',
        location: null,
        url: 'https://meet.example.invalid/fake-event-1',
      },
      {
        uid: 'IIIC-S-00003@fake.example.invalid',
        start: new Date('2099-01-07T04:30:00.000Z'),
        end: new Date('2099-01-07T05:00:00.000Z'),
        title: 'Fake session · Fakeravi · IIIC-S-00003',
        description: '',
        location: 'Fake office address',
        url: null,
      },
    ])
    if (!result.ok) throw new Error('feed refused')
    const all = lines(result.value)
    expect(all).toContain('METHOD:PUBLISH')
    expect(all).toContain('X-WR-CALNAME:IIIC bookings')
    expect(all.filter((line) => line === 'BEGIN:VEVENT')).toHaveLength(2)
    expect(all.filter((line) => line === 'CLASS:PRIVATE')).toHaveLength(2)
    expect(all).toContain('UID:IIIC-S-00003@fake.example.invalid')
    expect(all).toContain('LOCATION:Fake office address')
  })

  it('is a valid, empty calendar when there is nothing booked', () => {
    const result = buildFeed([])
    if (!result.ok) throw new Error('feed refused')
    expect(lines(result.value)).toEqual(
      expect.arrayContaining(['BEGIN:VCALENDAR', 'END:VCALENDAR', 'METHOD:PUBLISH']),
    )
    expect(result.value).not.toContain('BEGIN:VEVENT')
  })

  it('shapes each booking with the practitioner’s own calendar rule (first name only)', () => {
    const event = feedEvent(
      bookingView({
        booking: {
          reference: 'IIIC-S-00004',
          type: 'session',
          format: 'online',
          startsAt: '2099-01-05T04:30:00.000Z',
          endsAt: '2099-01-05T05:15:00.000Z',
        } as Booking,
        service: { name: 'Fake session', format: 'online' },
        client: { fullName: 'Fakeasha Fakesurname' },
        officeAddress: null,
      }),
      'https://meet.example.invalid/fake',
      SITE,
    )
    expect(event).toMatchObject({
      uid: 'IIIC-S-00004@fake.example.invalid',
      title: 'Fake session · Fakeasha · IIIC-S-00004',
      location: null,
      url: 'https://meet.example.invalid/fake',
    })
    expect(JSON.stringify(event)).not.toContain('Fakesurname')
  })
})
