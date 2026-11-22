// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { BOOKING_STATUSES } from '@/lib/booking/states'
import {
  bookingView,
  calendarActionFor,
  calendarEventFor,
  firstName,
  inviteUid,
  placeOf,
} from '@/lib/calendar/bookingEvent'
import type { Booking } from '@/payload-types'

// What a booking puts in its practitioner's calendar (D-22; docs/16 §1, §7; docs/08 §8): the
// time, the service, the client's first name, the reference, and a Meet link or the office
// address. Nothing else: no surname, contact detail, note, company, age band or price.
// Every value below is fake.

const OFFICE = 'Fake office address, Fake Road, Fakeville 000000'

const fullBooking = {
  id: 7,
  reference: 'IIIC-S-00001',
  type: 'session',
  status: 'confirmed',
  paymentStatus: 'paid',
  service: 3,
  person: 4,
  whoFor: 'family',
  ageBand: 'under18',
  format: 'online',
  startsAt: '2099-01-05T04:30:00.000Z',
  endsAt: '2099-01-05T05:15:00.000Z',
  timeRequest: { preferredTimes: 'Fake evenings only', note: 'Fake note about my worries' },
  company: { name: 'Fake Company Pvt', role: 'Fake role', teamSize: '50', sector: 'Fake sector' },
  price: { totalPaise: 123456, taxPaise: 18832, gstRateBasisPoints: 1800, sacCode: '999999' },
  source: 'fake-campaign',
  utm: { source: 'fake-utm' },
  manageTokenHash: 'fake-manage-hash',
  checkoutKey: 'fake-checkout-key',
  updatedAt: '2099-01-01T00:00:00.000Z',
  createdAt: '2099-01-01T00:00:00.000Z',
} as unknown as Booking

const client = {
  fullName: 'Fakeasha Fakesurname',
  email: 'fake@example.invalid',
  mobile: '+910000000000',
}

const view = (
  booking: Partial<Booking> = {},
  service: { name: string; format: 'online' | 'office' | 'both' } = {
    name: 'Fake one-to-one session',
    format: 'both',
  },
) =>
  bookingView({
    booking: { ...fullBooking, ...booking },
    service,
    client,
    officeAddress: OFFICE,
  })

describe('firstName', () => {
  it('takes the first word of the name the client gave', () => {
    expect(firstName('Fakeasha Fakesurname')).toBe('Fakeasha')
    expect(firstName('  Fakeasha   Fake Fakesurname ')).toBe('Fakeasha')
    expect(firstName('Fakeasha')).toBe('Fakeasha')
  })

  it('is missing when there is no name', () => {
    expect(firstName('')).toBeNull()
    expect(firstName('   ')).toBeNull()
    expect(firstName(null)).toBeNull()
    expect(firstName(undefined)).toBeNull()
  })
})

describe('the calendar event for each kind of booking', () => {
  it('an online session: a Meet link and no address', () => {
    expect(calendarEventFor(view())).toEqual({
      reference: 'IIIC-S-00001',
      start: new Date('2099-01-05T04:30:00.000Z'),
      end: new Date('2099-01-05T05:15:00.000Z'),
      title: 'Fake one-to-one session · Fakeasha · IIIC-S-00001',
      location: null,
      meet: true,
    })
  })

  it('a session at the office: the office address and no Meet link', () => {
    const event = calendarEventFor(view({ format: 'office' }))
    expect(event?.meet).toBe(false)
    expect(event?.location).toBe(OFFICE)
  })

  it('a session at the office while the address is not yet set: no location (I-33)', () => {
    const event = calendarEventFor(
      bookingView({
        booking: { ...fullBooking, format: 'office' },
        service: { name: 'Fake session', format: 'office' },
        client,
        officeAddress: null,
      }),
    )
    expect(event).toMatchObject({ meet: false, location: null })
  })

  it('a proposal call online: the same shape, with the call’s reference', () => {
    const event = calendarEventFor(
      view(
        { reference: 'IIIC-C-00002', type: 'call', format: 'online' },
        { name: 'Fake proposal call', format: 'online' },
      ),
    )
    expect(event).toMatchObject({
      reference: 'IIIC-C-00002',
      title: 'Fake proposal call · Fakeasha · IIIC-C-00002',
      meet: true,
      location: null,
    })
  })

  it('takes the place from the service when the booking does not name one', () => {
    expect(placeOf(view({ format: null }, { name: 'Fake', format: 'online' }))).toBe('online')
    expect(placeOf(view({ format: null }, { name: 'Fake', format: 'office' }))).toBe('office')
    expect(placeOf(view({ format: null }, { name: 'Fake', format: 'both' }))).toBeNull()
    const neither = calendarEventFor(view({ format: null }, { name: 'Fake', format: 'both' }))
    expect(neither).toMatchObject({ meet: false, location: null })
  })

  it('leaves out the name when the client gave none', () => {
    const event = calendarEventFor(
      bookingView({
        booking: fullBooking,
        service: { name: 'Fake session', format: 'online' },
        client: { fullName: ' ' },
        officeAddress: OFFICE,
      }),
    )
    expect(event?.title).toBe('Fake session · IIIC-S-00001')
  })

  it('has no event for a booking without a time (a time request)', () => {
    expect(calendarEventFor(view({ startsAt: null, endsAt: null }))).toBeNull()
    expect(calendarEventFor(view({ endsAt: '2099-01-05T04:00:00.000Z' }))).toBeNull()
  })

  it('carries nothing else about the client or the booking', () => {
    const written = JSON.stringify(calendarEventFor(view()))
    for (const secret of [
      'Fakesurname',
      'fake@example.invalid',
      '+910000000000',
      'Fake note',
      'Fake evenings',
      'Fake Company',
      'Fake role',
      'Fake sector',
      'under18',
      'family',
      '123456',
      '18832',
      '999999',
      'fake-campaign',
      'fake-utm',
      'fake-manage-hash',
      'fake-checkout-key',
    ]) {
      expect(written, secret).not.toContain(secret)
    }
  })
})

describe('what the calendar does for each booking state', () => {
  it('writes a confirmed booking, removes a cancelled or lapsed one, and leaves the rest', () => {
    const actions = Object.fromEntries(
      BOOKING_STATUSES.map(({ value }) => [value, calendarActionFor(value)]),
    )
    expect(actions).toEqual({
      requested: 'none',
      held: 'none',
      pendingPayment: 'none',
      confirmed: 'write',
      completed: 'none',
      noShow: 'none',
      cancelledByClient: 'remove',
      cancelledByIiic: 'remove',
      // The booking that replaces it moves the event (docs/16 §7).
      rescheduled: 'none',
      expired: 'remove',
    })
  })
})

describe('inviteUid', () => {
  it('is the reference at the platform’s host, the same across changes', () => {
    expect(inviteUid('IIIC-S-00001', 'https://fake.example.invalid')).toBe(
      'IIIC-S-00001@fake.example.invalid',
    )
    expect(inviteUid('IIIC-S-00001', 'http://localhost:3000')).toBe('IIIC-S-00001@localhost')
  })
})
