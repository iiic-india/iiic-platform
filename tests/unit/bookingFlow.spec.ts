// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { hashManageToken } from '@/lib/booking/tokens'
import { cookieOpens, decodeBookingCookie, encodeBookingCookie } from '@/lib/bookingFlow/cookie'
import {
  consentsGiven,
  consentsOffered,
  DETAIL_MESSAGES,
  parseDetails,
  suggestEmail,
} from '@/lib/bookingFlow/details'
import {
  formatCountdown,
  formatRate,
  formatRupees,
  holdSecondsLeft,
  reviewFor,
} from '@/lib/bookingFlow/review'

// The booking flow's own rules (docs/03 F3; docs/16 §8; CLAUDE.md #4, #5, #8, #9; D-21, D-24).
// Every name, number and amount here is a fake test value.

const session = {
  type: 'session',
  fullName: 'Test Person (fake)',
  mobile: '98765 43210',
  email: 'Fake.Person@Example.com',
  whoFor: 'yourself',
  ageBand: 'adult',
  consents: { bookingCommunications: 'on' },
}

describe('step 3, the details', () => {
  it('stores the mobile in E.164 and the email in lower case', () => {
    const parsed = parseDetails(session)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.mobile).toBe('+919876543210')
    expect(parsed.value.email).toBe('fake.person@example.com')
  })

  it('names every field that needs fixing, each with what to do', () => {
    const parsed = parseDetails({ ...session, fullName: ' ', mobile: '123', email: 'a@' })
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.errors.map((error) => error.field).sort()).toEqual([
      'email',
      'fullName',
      'mobile',
    ])
    expect(parsed.errors.find((error) => error.field === 'mobile')?.message).toBe(
      DETAIL_MESSAGES.mobile,
    )
  })

  it('books nothing without the booking-messages box ticked, and never ticks it itself', () => {
    const parsed = parseDetails({ ...session, consents: {} })
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.errors).toContainEqual({
      field: 'consents.bookingCommunications',
      message: DETAIL_MESSAGES.bookingCommunications,
    })
    // Only an explicit tick counts.
    expect(parseDetails({ ...session, consents: { bookingCommunications: 'yes' } }).ok).toBe(false)
  })

  it('asks a parent or guardian to say so when the session is for someone under 18', () => {
    const minor = { ...session, whoFor: 'family', ageBand: 'under18' }
    const refused = parseDetails(minor)
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.errors[0]?.field).toBe('guardian')
    expect(parseDetails({ ...minor, guardian: 'on' }).ok).toBe(true)
  })

  it('refuses someone under 18 booking for themselves, ticked box or not', () => {
    const self = { ...session, whoFor: 'yourself', ageBand: 'under18', guardian: 'on' }
    const refused = parseDetails(self)
    expect(refused.ok).toBe(false)
    if (!refused.ok) {
      expect(refused.errors).toContainEqual({
        field: 'whoFor',
        message: DETAIL_MESSAGES.minorForSelf,
      })
    }
    expect(parseDetails({ ...self, ageBand: 'adult' }).ok).toBe(true)
  })

  it('asks a call for the company, and an info session for no more than name and contact', () => {
    const call = { ...session, type: 'call', company: '' }
    const refused = parseDetails(call)
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.errors.map((error) => error.field)).toContain('company')
    const info = parseDetails({
      type: 'info',
      fullName: 'Fake',
      mobile: '+91 98765 43210',
      email: 'fake@example.com',
      consents: { bookingCommunications: true },
    })
    expect(info.ok).toBe(true)
  })

  it('names the address a common typo probably meant, and leaves others alone', () => {
    expect(suggestEmail('fake@gmial.com')).toBe('fake@gmail.com')
    expect(suggestEmail('fake@example.com')).toBeNull()
    expect(suggestEmail('no-at-sign')).toBeNull()
  })
})

describe('the consents a booking offers', () => {
  it('offers a counselling booking and anyone under 18 no marketing consent', () => {
    expect(consentsOffered('session', 'adult')).toEqual(['bookingCommunications'])
    expect(consentsOffered('call', 'under18')).toEqual(['bookingCommunications'])
  })

  it('offers each marketing consent as a box of its own on a call and an info session', () => {
    expect(consentsOffered('call')).toEqual([
      'bookingCommunications',
      'marketingEmail',
      'marketingWhatsapp',
    ])
  })

  it('records only the boxes ticked, among those offered', () => {
    const parsed = parseDetails({
      ...session,
      consents: { bookingCommunications: 'on', marketingEmail: 'on' },
    })
    expect(parsed.ok && consentsGiven(parsed.value)).toEqual(['bookingCommunications'])
    const call = parseDetails({
      ...session,
      type: 'call',
      company: 'Fake Co',
      consents: { bookingCommunications: 'on', marketingWhatsapp: 'on' },
    })
    expect(call.ok && consentsGiven(call.value)).toEqual([
      'bookingCommunications',
      'marketingWhatsapp',
    ])
  })
})

describe('the review step', () => {
  const quote = { totalPaise: 150_000, taxPaise: 22_881, taxablePaise: 127_119, rate: 1800 }
  const on = { pricesPublic: true, payAtBooking: true }

  it('shows no total and takes no payment while prices are hidden (D-21)', () => {
    expect(
      reviewFor({ type: 'session', flags: { pricesPublic: false, payAtBooking: false }, quote }),
    ).toEqual({ total: null, pay: false })
  })

  it('shows the total and confirms without payment while payment at booking is off (D-24)', () => {
    expect(
      reviewFor({ type: 'session', flags: { pricesPublic: true, payAtBooking: false }, quote }),
    ).toEqual({ total: quote, pay: false })
  })

  it('takes payment for a priced session, never for a call, an info session or a free option', () => {
    expect(reviewFor({ type: 'session', flags: on, quote }).pay).toBe(true)
    expect(reviewFor({ type: 'call', flags: on, quote })).toEqual({ total: null, pay: false })
    expect(reviewFor({ type: 'info', flags: on, quote }).pay).toBe(false)
    expect(reviewFor({ type: 'session', flags: on, quote: null }).pay).toBe(false)
    expect(reviewFor({ type: 'session', flags: on, quote: { ...quote, totalPaise: 0 } }).pay).toBe(
      false,
    )
  })

  it('writes money from whole paise', () => {
    expect(formatRupees(150_000)).toBe('₹1,500')
    expect(formatRupees(12_345_678)).toBe('₹1,23,456.78')
    expect(formatRupees(5)).toBe('₹0.05')
    expect(() => formatRupees(1.5)).toThrow(RangeError)
    expect(formatRate(1800)).toBe('18%')
    expect(formatRate(1250)).toBe('12.5%')
  })
})

describe('the hold timer', () => {
  const now = new Date('2026-12-01T10:00:00.000Z')

  it('counts to the end the server set, and stops at zero', () => {
    expect(holdSecondsLeft('2026-12-01T10:09:30.000Z', now)).toBe(570)
    expect(holdSecondsLeft('2026-12-01T09:59:00.000Z', now)).toBe(0)
    expect(holdSecondsLeft(null, now)).toBe(0)
    expect(formatCountdown(570)).toBe('9:30')
    expect(formatCountdown(5)).toBe('0:05')
  })
})

describe('the booking cookie', () => {
  const token = 'a'.repeat(43)
  const booking = {
    reference: 'IIIC-S-12345',
    checkoutKey: 'fake-checkout-key-0001',
    manageTokenHash: hashManageToken(token),
  }

  it('round-trips, and refuses anything that is not its own shape', () => {
    const value = { ref: 'IIIC-S-12345', key: 'fake-checkout-key-0001', token }
    expect(decodeBookingCookie(encodeBookingCookie(value))).toEqual(value)
    expect(decodeBookingCookie('not-a-cookie')).toBeNull()
    expect(decodeBookingCookie(Buffer.from('{"ref":"x"}').toString('base64url'))).toBeNull()
  })

  it('opens a booking only with its own checkout key or manage token', () => {
    expect(
      cookieOpens(
        { ref: booking.reference, key: booking.checkoutKey, token: null },
        booking,
        hashManageToken,
      ),
    ).toBe(true)
    expect(
      cookieOpens({ ref: booking.reference, key: null, token }, booking, hashManageToken),
    ).toBe(true)
    expect(
      cookieOpens(
        { ref: booking.reference, key: 'another-fake-key-0002', token: null },
        booking,
        hashManageToken,
      ),
    ).toBe(false)
    expect(
      cookieOpens(
        { ref: 'IIIC-S-54321', key: booking.checkoutKey, token },
        booking,
        hashManageToken,
      ),
    ).toBe(false)
    expect(cookieOpens(null, booking, hashManageToken)).toBe(false)
  })
})
