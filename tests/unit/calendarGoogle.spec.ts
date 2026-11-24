// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { calendarSubject, googleCalendarConfig, webhookAddress } from '@/lib/calendar/config'
import {
  busyFromFreeBusy,
  calendarErrorOf,
  freeBusyChunks,
  googleEventId,
  meetUrlOf,
  toGoogleEvent,
  watchFrom,
} from '@/lib/calendar/googleEvent'
import type { CalendarEventInput } from '@/lib/calendar/provider'

// Google Calendar as the platform reaches it (D-22, D-23; docs/16 §7): the settings that switch
// it on, the event it writes (no guests, no description, private), and Google's answers read
// with Zod. No network: the client itself is in google.ts. Every value is fake; the key below
// is not a key.

const FAKE_KEY = ['-----BEGIN ', 'PRIVATE KEY-----\nFAKE\n-----END ', 'PRIVATE KEY-----\n'].join('')
const keyFile = JSON.stringify({ type: 'service_account', private_key: FAKE_KEY })

const settings = {
  GOOGLE_WORKSPACE_DOMAIN: 'Fake.Example.Invalid',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: 'calendar@fake-project.iam.gserviceaccount.com',
  GOOGLE_SERVICE_ACCOUNT_KEY: Buffer.from(keyFile).toString('base64'),
  GOOGLE_CALENDAR_WEBHOOK_TOKEN: 'fake-webhook-token-fake-webhook-token-0000',
  VERCEL_ENV: undefined,
} as const

describe('googleCalendarConfig', () => {
  it('switches the calendar on with all three settings, reading the base64 key file', () => {
    const config = googleCalendarConfig(settings)
    expect(config).toEqual({
      ok: true,
      value: {
        serviceAccountEmail: 'calendar@fake-project.iam.gserviceaccount.com',
        privateKey: FAKE_KEY,
        workspaceDomain: 'fake.example.invalid',
        webhooksOn: true,
      },
    })
  })

  it('also takes the key file as plain JSON', () => {
    const config = googleCalendarConfig({ ...settings, GOOGLE_SERVICE_ACCOUNT_KEY: keyFile })
    expect(config.ok).toBe(true)
  })

  it('watches for changes only once the webhook token is set', () => {
    const config = googleCalendarConfig({ ...settings, GOOGLE_CALENDAR_WEBHOOK_TOKEN: undefined })
    expect(config.ok && config.value.webhooksOn).toBe(false)
  })

  it('stays off without its settings, and the booking goes on without it', () => {
    for (const missing of [
      'GOOGLE_WORKSPACE_DOMAIN',
      'GOOGLE_SERVICE_ACCOUNT_EMAIL',
      'GOOGLE_SERVICE_ACCOUNT_KEY',
    ] as const) {
      expect(googleCalendarConfig({ ...settings, [missing]: undefined }), missing).toEqual({
        ok: false,
        error: { code: 'not-configured', reason: 'missing' },
      })
    }
  })

  it('stays off with a key it cannot read or a domain that is not one', () => {
    expect(
      googleCalendarConfig({ ...settings, GOOGLE_SERVICE_ACCOUNT_KEY: 'bm90IGpzb24=' }),
    ).toEqual({ ok: false, error: { code: 'not-configured', reason: 'invalid-key' } })
    expect(googleCalendarConfig({ ...settings, GOOGLE_WORKSPACE_DOMAIN: 'not a domain' })).toEqual({
      ok: false,
      error: { code: 'not-configured', reason: 'invalid-domain' },
    })
  })

  it('never writes to real calendars from a preview, which shares production’s database', () => {
    expect(googleCalendarConfig({ ...settings, VERCEL_ENV: 'preview' })).toEqual({
      ok: false,
      error: { code: 'not-configured', reason: 'not-production' },
    })
    expect(googleCalendarConfig({ ...settings, VERCEL_ENV: 'production' }).ok).toBe(true)
  })
})

describe('calendarSubject', () => {
  it('acts only as a practitioner’s own address on the Workspace domain', () => {
    expect(calendarSubject(' Fakeasha@Fake.Example.Invalid ', 'fake.example.invalid')).toBe(
      'fakeasha@fake.example.invalid',
    )
    expect(calendarSubject('fakeasha@gmail.example', 'fake.example.invalid')).toBeNull()
    expect(calendarSubject('fakeasha@evil-fake.example.invalid', 'fake.example.invalid')).toBeNull()
    expect(calendarSubject('abc123@group.calendar.google.com', 'fake.example.invalid')).toBeNull()
    expect(calendarSubject('not an address', 'fake.example.invalid')).toBeNull()
  })
})

describe('webhookAddress', () => {
  it('is the platform’s own https address, or none on a plain http one', () => {
    expect(webhookAddress('https://fake.example.invalid')).toBe(
      'https://fake.example.invalid/api/webhooks/google-calendar',
    )
    expect(webhookAddress('http://localhost:3000')).toBeNull()
  })
})

const event: CalendarEventInput = {
  reference: 'IIIC-S-00001',
  start: new Date('2099-01-05T04:30:00.000Z'),
  end: new Date('2099-01-05T05:15:00.000Z'),
  title: 'Fake session · Fakeasha · IIIC-S-00001',
  location: null,
  meet: true,
}

describe('googleEventId', () => {
  it('is stable, distinct per booking and in Google’s alphabet', () => {
    const id = googleEventId('IIIC-S-00001@fake.example.invalid')
    expect(id).toBe(googleEventId('IIIC-S-00001@fake.example.invalid'))
    expect(id).not.toBe(googleEventId('IIIC-S-00002@fake.example.invalid'))
    expect(id).toMatch(/^[0-9a-v]{5,1024}$/)
  })
})

describe('toGoogleEvent', () => {
  it('writes an online booking with a Meet request, private, busy and without guests', () => {
    const body = toGoogleEvent(event, 'abc123', 'insert')
    expect(body).toEqual({
      id: 'abc123',
      summary: 'Fake session · Fakeasha · IIIC-S-00001',
      start: { dateTime: '2099-01-05T04:30:00.000Z', timeZone: 'Asia/Kolkata' },
      end: { dateTime: '2099-01-05T05:15:00.000Z', timeZone: 'Asia/Kolkata' },
      status: 'confirmed',
      visibility: 'private',
      transparency: 'opaque',
      guestsCanInviteOthers: false,
      guestsCanSeeOtherGuests: false,
      extendedProperties: { private: { iiicReference: 'IIIC-S-00001' } },
      conferenceData: {
        createRequest: { requestId: 'abc123', conferenceSolutionKey: { type: 'hangoutsMeet' } },
      },
    })
    expect(body).not.toHaveProperty('attendees')
    expect(body).not.toHaveProperty('description')
  })

  it('writes a booking at the office with its address and no Meet link', () => {
    const body = toGoogleEvent({ ...event, meet: false, location: 'Fake office' }, 'abc', 'insert')
    expect(body.location).toBe('Fake office')
    expect(body).not.toHaveProperty('conferenceData')
  })

  it('clears the address a patch no longer has, and asks for no new Meet link', () => {
    const body = toGoogleEvent({ ...event, meet: false }, 'abc123', 'patch')
    expect(body).not.toHaveProperty('id')
    expect(body).not.toHaveProperty('conferenceData')
    expect(body.location).toBeNull()
  })

  it('keeps the same Meet request on a patch, so no second conference is made', () => {
    const body = toGoogleEvent(event, 'abc123', 'patch')
    expect(body.conferenceData?.createRequest?.requestId).toBe('abc123')
  })
})

describe('meetUrlOf', () => {
  it('reads the Meet link Google made', () => {
    expect(meetUrlOf({ hangoutLink: 'https://meet.example.invalid/a' })).toBe(
      'https://meet.example.invalid/a',
    )
    expect(
      meetUrlOf({
        conferenceData: {
          entryPoints: [
            { entryPointType: 'phone', uri: 'tel:+0' },
            { entryPointType: 'video', uri: 'https://meet.example.invalid/b' },
          ],
        },
      }),
    ).toBe('https://meet.example.invalid/b')
    expect(meetUrlOf({})).toBeNull()
    expect(meetUrlOf(null)).toBeNull()
  })
})

describe('calendarErrorOf', () => {
  const failure = (status: number, error?: unknown) => ({
    message: 'Fake message naming fakeasha@fake.example.invalid',
    response: { status, data: { error } },
  })

  it('reads missing delegation as forbidden', () => {
    expect(calendarErrorOf(failure(403, { errors: [{ reason: 'forbidden' }] }))).toEqual({
      code: 'forbidden',
    })
    expect(calendarErrorOf(failure(401))).toEqual({ code: 'forbidden' })
    expect(calendarErrorOf(failure(400, 'unauthorized_client'))).toEqual({ code: 'forbidden' })
    expect(calendarErrorOf(failure(400, 'invalid_grant'))).toEqual({ code: 'forbidden' })
  })

  it('reads a rate limit as a passing outage, to be retried', () => {
    expect(calendarErrorOf(failure(403, { errors: [{ reason: 'rateLimitExceeded' }] }))).toEqual({
      code: 'unavailable',
    })
    expect(calendarErrorOf(failure(429))).toEqual({ code: 'unavailable' })
  })

  it('reads a missing or deleted event, a clash and an outage', () => {
    expect(calendarErrorOf(failure(404))).toEqual({ code: 'not-found' })
    expect(calendarErrorOf(failure(410))).toEqual({ code: 'not-found' })
    expect(calendarErrorOf(failure(409))).toEqual({ code: 'conflict' })
    expect(calendarErrorOf(failure(503))).toEqual({ code: 'unavailable' })
    expect(calendarErrorOf(new Error('socket hang up'))).toEqual({ code: 'unavailable' })
    expect(calendarErrorOf(undefined)).toEqual({ code: 'unavailable' })
  })

  it('never carries Google’s message on', () => {
    expect(JSON.stringify(calendarErrorOf(failure(403)))).not.toContain('fakeasha')
  })
})

describe('busyFromFreeBusy', () => {
  const id = 'fakeasha@fake.example.invalid'

  it('reads start and end only', () => {
    const answer = {
      calendars: {
        [id]: {
          busy: [{ start: '2099-01-05T04:30:00Z', end: '2099-01-05T05:00:00Z' }],
        },
      },
    }
    expect(busyFromFreeBusy(answer, id)).toEqual({
      ok: true,
      value: [{ start: new Date('2099-01-05T04:30:00Z'), end: new Date('2099-01-05T05:00:00Z') }],
    })
    expect(busyFromFreeBusy({ calendars: { [id]: {} } }, id)).toEqual({ ok: true, value: [] })
  })

  it('finds the calendar whatever the case of its address', () => {
    const answer = { calendars: { [id]: { busy: [] } } }
    expect(busyFromFreeBusy(answer, 'FakeAsha@Fake.Example.Invalid').ok).toBe(true)
  })

  it('reads the calendar’s own errors, and refuses an answer it does not recognise', () => {
    expect(
      busyFromFreeBusy({ calendars: { [id]: { errors: [{ reason: 'notFound' }] } } }, id),
    ).toEqual({ ok: false, error: { code: 'not-found' } })
    expect(
      busyFromFreeBusy({ calendars: { [id]: { errors: [{ reason: 'internalError' }] } } }, id),
    ).toEqual({ ok: false, error: { code: 'unavailable' } })
    expect(busyFromFreeBusy({ calendars: {} }, id)).toEqual({
      ok: false,
      error: { code: 'unavailable' },
    })
    expect(busyFromFreeBusy('nonsense', id)).toEqual({ ok: false, error: { code: 'unavailable' } })
  })
})

describe('watchFrom', () => {
  it('reads the channel and when it ends', () => {
    expect(watchFrom({ id: 'chan', resourceId: 'res', expiration: '4070908800000' })).toEqual({
      ok: true,
      value: { channelId: 'chan', resourceId: 'res', expiresAt: new Date(4070908800000) },
    })
    expect(watchFrom({ id: 'chan' })).toEqual({ ok: false, error: { code: 'unavailable' } })
  })
})

describe('freeBusyChunks', () => {
  it('reads a long window in pieces and a short one at once', () => {
    const start = new Date('2099-01-01T00:00:00Z')
    expect(freeBusyChunks({ start, end: new Date('2099-01-15T00:00:00Z') })).toHaveLength(1)
    const chunks = freeBusyChunks({ start, end: new Date('2099-05-01T00:00:00Z') }, 60)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]?.end).toEqual(chunks[1]?.start)
    expect(chunks[1]?.end).toEqual(new Date('2099-05-01T00:00:00Z'))
  })
})
