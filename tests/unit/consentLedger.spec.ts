// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  activeGrants,
  consentState,
  idOf,
  inForceAt,
  isBefore,
  isFuture,
  isWithdrawal,
  needsEvidence,
  type LedgerEntry,
} from '@/lib/privacy/consentLedger'

// The consent ledger's rules (docs/04 `consents`; docs/08 §3; docs/12 §11): a withdrawal is an
// entry of its own that names the consent it ends, so the history is never lost, and a person's
// standing on a purpose is read from the whole ledger. Obviously fake entries.
const grant = (id: number, purpose: string, grantedAt: string): LedgerEntry => ({
  id,
  purpose,
  grantedAt,
})
const withdrawal = (id: number, of: LedgerEntry, withdrawnAt: string): LedgerEntry => ({
  id,
  purpose: of.purpose,
  grantedAt: of.grantedAt,
  withdrawnAt,
  withdraws: of.id,
})

const newsletter = grant(1, 'marketingEmail', '2026-12-01T06:00:00Z')
const bookings = grant(2, 'bookingCommunications', '2026-12-01T06:00:00Z')

describe('where a person stands on a purpose', () => {
  it('is nowhere until they consent', () => {
    expect(consentState([], 'marketingEmail')).toBe('none')
    expect(consentState([bookings], 'marketingEmail')).toBe('none')
  })

  it('is granted once they consent, and withdrawn once an entry ends that consent', () => {
    expect(consentState([newsletter, bookings], 'marketingEmail')).toBe('granted')
    const ended = withdrawal(3, newsletter, '2026-12-05T06:00:00Z')
    expect(consentState([newsletter, bookings, ended], 'marketingEmail')).toBe('withdrawn')
    // Each purpose stands on its own.
    expect(consentState([newsletter, bookings, ended], 'bookingCommunications')).toBe('granted')
  })

  it('follows the consent given last: given again after a withdrawal, it is granted again', () => {
    const ended = withdrawal(3, newsletter, '2026-12-05T06:00:00Z')
    const again = grant(4, 'marketingEmail', '2026-12-10T06:00:00Z')
    expect(consentState([newsletter, ended, again], 'marketingEmail')).toBe('granted')
    // And a later consent under a newer notice replaces the earlier one: ending the newer one
    // ends the purpose, even though the older one was never withdrawn itself.
    const endedAgain = withdrawal(5, again, '2026-12-12T06:00:00Z')
    expect(consentState([newsletter, again, endedAgain], 'marketingEmail')).toBe('withdrawn')
  })

  it('reads the ids of populated entries as well as bare ones', () => {
    const populated = { ...withdrawal(3, newsletter, '2026-12-05T06:00:00Z'), withdraws: { id: 1 } }
    expect(consentState([newsletter, populated], 'marketingEmail')).toBe('withdrawn')
    const asText = { ...withdrawal(3, newsletter, '2026-12-05T06:00:00Z'), withdraws: '1' }
    expect(consentState([newsletter, asText], 'marketingEmail')).toBe('withdrawn')
  })

  it('is withdrawn by a withdrawal that names an older consent, whichever consent came last', () => {
    // Two consents at the same time: withdrawing the first ends the purpose.
    const second = grant(10, 'marketingEmail', newsletter.grantedAt)
    const endedFirst = withdrawal(11, newsletter, '2026-12-05T06:00:00Z')
    expect(consentState([newsletter, second, endedFirst], 'marketingEmail')).toBe('withdrawn')
    // Given twice, at different times; the withdrawal names the older one and came after both.
    const later = grant(12, 'marketingEmail', '2026-12-03T06:00:00Z')
    expect(consentState([newsletter, later, endedFirst], 'marketingEmail')).toBe('withdrawn')
    // A withdrawal for another purpose ends nothing here.
    const endedBookings = withdrawal(13, bookings, '2026-12-05T06:00:00Z')
    expect(consentState([newsletter, later, endedBookings], 'marketingEmail')).toBe('granted')
  })

  it('is not brought back by a consent staff record from a reply older than a withdrawal', () => {
    const ended = withdrawal(3, newsletter, '2026-12-05T06:00:00Z')
    const olderReply = grant(14, 'marketingEmail', '2026-12-03T06:00:00Z')
    expect(consentState([newsletter, ended, olderReply], 'marketingEmail')).toBe('withdrawn')
    // A consent given after the withdrawal is in force again.
    const newer = grant(15, 'marketingEmail', '2026-12-06T06:00:00Z')
    expect(consentState([newsletter, ended, olderReply, newer], 'marketingEmail')).toBe('granted')
  })
})

describe('the consents still in force', () => {
  it('are the consents no entry withdraws', () => {
    const ended = withdrawal(3, newsletter, '2026-12-05T06:00:00Z')
    expect(activeGrants([newsletter, bookings, ended]).map((entry) => entry.id)).toEqual([2])
    expect(activeGrants([])).toEqual([])
  })
})

describe('the ledger’s checks', () => {
  const now = new Date('2026-12-01T06:00:00Z')

  it('tells a withdrawal from a consent', () => {
    expect(isWithdrawal({ withdraws: 7 })).toBe(true)
    expect(isWithdrawal({ withdraws: { id: 7 } })).toBe(true)
    expect(isWithdrawal({ withdraws: null })).toBe(false)
    expect(isWithdrawal({})).toBe(false)
    expect(idOf({ fake: true })).toBeNull()
  })

  it('takes no time from the future, beyond five minutes for a clock or a picker', () => {
    expect(isFuture('2026-12-01T06:04:59Z', now)).toBe(false)
    expect(isFuture('2026-12-01T06:05:01Z', now)).toBe(true)
    expect(isFuture('2026-11-30T06:00:00Z', now)).toBe(false)
    expect(isFuture('not a date', now)).toBe(false)
  })

  it('takes a notice as in force from its time on', () => {
    expect(inForceAt('2026-12-01T06:00:00Z', '2026-12-01T06:00:00Z')).toBe(true)
    expect(inForceAt('2026-12-01T06:00:00Z', '2026-12-01T05:59:59Z')).toBe(false)
    expect(inForceAt(undefined, now)).toBe(false)
    expect(isBefore('2026-11-30T06:00:00Z', '2026-12-01T06:00:00Z')).toBe(true)
    expect(isBefore('2026-12-01T06:00:00Z', '2026-12-01T06:00:00Z')).toBe(false)
  })

  it('asks for evidence of a consent recorded by staff, and of none given through a form', () => {
    expect(needsEvidence({ channel: 'web' })).toBe(false)
    for (const channel of ['email', 'whatsapp', 'phone', 'inPerson']) {
      expect(needsEvidence({ channel }), channel).toBe(true)
    }
    // A withdrawal is taken however it comes (docs/08 §3: as easy as giving consent).
    expect(needsEvidence({ channel: 'phone', withdraws: 7 })).toBe(false)
  })
})
