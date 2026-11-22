// @vitest-environment node
import type { PayloadRequest } from 'payload'
import { ValidationError } from 'payload'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const {
  AskForTimeInput,
  BookSlotInput,
  CancelInput,
  ConfirmTimeInput,
  ListSlotsInput,
  RescheduleInput,
  isOffice,
  summarise,
} = await import('@/lib/booking/api')
const { emitterFor, eventKey } = await import('@/lib/booking/emit')
const { isSlotTaken, isUniqueOn, sqlStateOf } = await import('@/lib/booking/guard')
const { REFERENCE, newReference } = await import('@/lib/booking/reference')
const { hashManageToken, isManageToken, manageLinkOpen, newManageToken } =
  await import('@/lib/booking/tokens')
const { preferredDaysOf } = await import('@/lib/booking/timeRequests')

// The booking module's small parts (docs/16 §6, §9): references, manage tokens, the guard's
// reading of database errors, domain events into jobs, and the server functions' input checks
// and the office check. Fake values only.

describe('booking references', () => {
  it('reads IIIC-, the kind’s letter and five digits', () => {
    expect(newReference('session', () => 24117)).toBe('IIIC-S-24117')
    expect(newReference('call', () => 7)).toBe('IIIC-C-00007')
    expect(newReference('info', () => 99_999)).toBe('IIIC-I-99999')
    for (let i = 0; i < 50; i += 1) expect(newReference('session')).toMatch(REFERENCE)
  })
})

describe('manage link tokens (docs/03 F4)', () => {
  it('makes 32 random bytes in base64url and keeps only their SHA-256', () => {
    const { token, hash } = newManageToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(Buffer.from(token, 'base64url')).toHaveLength(32)
    expect(hash).toBe(hashManageToken(token))
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(token)
    expect(newManageToken().token).not.toBe(token)
  })

  it('looks at nothing that is not a token’s shape', () => {
    expect(isManageToken(newManageToken().token)).toBe(true)
    for (const bad of ['', 'short', `${'a'.repeat(43)}=`, 'a'.repeat(44), null, 42]) {
      expect(isManageToken(bad), String(bad)).toBe(false)
    }
  })

  it('keeps a link open until the booking ends, and a time request’s while it waits', () => {
    const now = new Date('2026-12-07T04:30:00.000Z')
    expect(manageLinkOpen({ status: 'confirmed', endsAt: '2026-12-07T05:00:00.000Z' }, now)).toBe(
      true,
    )
    expect(manageLinkOpen({ status: 'confirmed', endsAt: '2026-12-07T04:30:00.000Z' }, now)).toBe(
      false,
    )
    expect(manageLinkOpen({ status: 'requested', endsAt: null }, now)).toBe(true)
    expect(manageLinkOpen({ status: 'cancelledByClient', endsAt: null }, now)).toBe(false)
  })
})

describe('the guard’s reading of database errors (docs/16 §4)', () => {
  it('finds the SQLSTATE through the causes drivers wrap it in', () => {
    const pg = Object.assign(new Error('conflicting key value'), { code: '23P01' })
    const wrapped = new Error('Failed query', { cause: pg })
    expect(sqlStateOf(pg)).toBe('23P01')
    expect(sqlStateOf(wrapped)).toBe('23P01')
    expect(sqlStateOf(new Error('Failed', { cause: wrapped }))).toBe('23P01')
    expect(isSlotTaken(wrapped)).toBe(true)
    expect(isSlotTaken(Object.assign(new Error('x'), { code: '23505' }))).toBe(false)
    expect(sqlStateOf(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }))).toBeUndefined()
    expect(sqlStateOf(null)).toBeUndefined()
  })

  it('reads Payload’s unique-value error by the field it names', () => {
    const taken = new ValidationError({
      collection: 'bookings',
      errors: [{ message: 'Value must be unique', path: 'checkoutKey' }],
    })
    expect(isUniqueOn(taken, 'checkoutKey')).toBe(true)
    expect(isUniqueOn(taken, 'reference')).toBe(false)
    expect(isUniqueOn(new Error('x'), 'reference')).toBe(false)
  })
})

describe('domain events into jobs (docs/16 §9)', () => {
  function fakeReq(waiting = 0) {
    const queue = vi.fn(async () => ({}))
    const count = vi.fn(async () => ({ totalDocs: waiting }))
    return {
      req: { payload: { count, jobs: { queue } } } as unknown as PayloadRequest,
      queue,
      count,
    }
  }

  it('keys an event by its name and the id it is about', () => {
    expect(eventKey({ name: 'booking.held', bookingId: 7 })).toBe('booking.held:7')
    expect(eventKey({ name: 'payment.captured', paymentId: 3, bookingId: 7 })).toBe(
      'payment.captured:3',
    )
    expect(eventKey({ name: 'refund.processed', refundId: 4 })).toBe('refund.processed:4')
    expect(eventKey({ name: 'calendar.changed', practitionerId: 2 })).toBe('calendar.changed:2')
  })

  it('queues nothing while no task listens (until M6)', async () => {
    const { req, queue, count } = fakeReq()
    await emitterFor({})(req, { name: 'booking.held', bookingId: 1 })
    expect(queue).not.toHaveBeenCalled()
    expect(count).not.toHaveBeenCalled()
  })

  it('queues one job per listening task, with ids only and the key, in the request', async () => {
    const { req, queue } = fakeReq()
    await emitterFor({ 'booking.confirmed': ['B5-test-one', 'B6-test-two'] })(req, {
      name: 'booking.confirmed',
      bookingId: 9,
      cause: 'staff',
    })
    expect(queue).toHaveBeenCalledTimes(2)
    expect(queue).toHaveBeenCalledWith({
      task: 'B5-test-one',
      input: {
        name: 'booking.confirmed',
        bookingId: 9,
        cause: 'staff',
        key: 'booking.confirmed:9',
      },
      req,
    })
  })

  it('does not queue a job already waiting with the same key', async () => {
    const { req, queue } = fakeReq(1)
    await emitterFor({ 'booking.held': ['B1-test'] })(req, { name: 'booking.held', bookingId: 1 })
    expect(queue).not.toHaveBeenCalled()
  })
})

describe('the server functions’ inputs (CLAUDE.md: Zod at every boundary)', () => {
  const start = '2026-12-07T10:00:00+05:30'

  it('takes the times a flow sends and nothing more', () => {
    expect(
      ListSlotsInput.safeParse({ serviceId: 1, serviceOption: 'opt', practitionerId: 2 }).success,
    ).toBe(true)
    expect(
      ListSlotsInput.safeParse({ serviceId: 1, serviceOption: 'opt', practitionerId: 2, price: 1 })
        .success,
    ).toBe(false)
    const booked = BookSlotInput.parse({
      checkoutKey: 'fake-checkout-key-0001',
      serviceId: 1,
      serviceOption: 'opt',
      practitionerId: 2,
      startsAt: start,
      format: 'online',
    })
    expect(booked.startsAt.toISOString()).toBe('2026-12-07T04:30:00.000Z')
  })

  it('refuses a price, a person or a status from the browser', () => {
    for (const extra of [{ price: { totalPaise: 1 } }, { personId: 5 }, { status: 'confirmed' }]) {
      expect(
        BookSlotInput.safeParse({
          checkoutKey: 'fake-checkout-key-0001',
          serviceId: 1,
          serviceOption: 'opt',
          practitionerId: 2,
          startsAt: start,
          ...extra,
        }).success,
        JSON.stringify(extra),
      ).toBe(false)
    }
  })

  it('refuses times without an offset, ids that are not whole, short checkout keys', () => {
    const base = {
      checkoutKey: 'fake-checkout-key-0001',
      serviceId: 1,
      serviceOption: 'opt',
      practitionerId: 2,
      startsAt: start,
    }
    expect(BookSlotInput.safeParse({ ...base, startsAt: '2026-12-07T10:00:00' }).success).toBe(
      false,
    )
    expect(BookSlotInput.safeParse({ ...base, serviceId: 1.5 }).success).toBe(false)
    expect(BookSlotInput.safeParse({ ...base, checkoutKey: 'short' }).success).toBe(false)
  })

  it('takes a time request’s real days, at most fourteen, and a note of bounded length', () => {
    const base = { serviceId: 1, serviceOption: 'opt', preferredDays: ['2026-12-08'] }
    expect(AskForTimeInput.safeParse(base).success).toBe(true)
    expect(AskForTimeInput.safeParse({ ...base, preferredDays: [] }).success).toBe(false)
    expect(AskForTimeInput.safeParse({ ...base, preferredDays: ['2026-02-30'] }).success).toBe(
      false,
    )
    expect(
      AskForTimeInput.safeParse({ ...base, preferredDays: Array(15).fill('2026-12-08') }).success,
    ).toBe(false)
    expect(AskForTimeInput.safeParse({ ...base, note: 'x'.repeat(1001) }).success).toBe(false)
    expect(preferredDaysOf(['2026-12-09', '2026-12-08', '2026-12-09', 'nope'])).toEqual([
      '2026-12-08',
      '2026-12-09',
    ])
  })

  it('opens a booking by its token or, for the office, by its id', () => {
    const token = newManageToken().token
    expect(RescheduleInput.safeParse({ token, startsAt: start }).success).toBe(true)
    expect(RescheduleInput.safeParse({ bookingId: 3, startsAt: start }).success).toBe(true)
    expect(RescheduleInput.safeParse({ token: 'guess', startsAt: start }).success).toBe(false)
    expect(CancelInput.safeParse({ token }).success).toBe(true)
    expect(CancelInput.safeParse({ bookingId: 3, by: 'iiic' }).success).toBe(true)
    // A client cannot cancel in IIIC's name.
    expect(CancelInput.safeParse({ token, by: 'iiic' }).success).toBe(false)
    expect(ConfirmTimeInput.safeParse({ bookingId: 3, startsAt: start }).success).toBe(true)
  })
})

describe('who is asking (CLAUDE.md #6)', () => {
  const asUser = (user: unknown) => ({ user }) as unknown as PayloadRequest
  const staff = (roles: string[], extra: Record<string, unknown> = {}) => ({
    id: 1,
    collection: 'users',
    roles,
    active: true,
    _strategy: 'totp',
    ...extra,
  })

  it('counts an owner or operator with the two-factor code as the office', () => {
    expect(isOffice(asUser(staff(['owner'])))).toBe(true)
    expect(isOffice(asUser(staff(['operator'])))).toBe(true)
  })

  it('refuses visitors, other roles, a missing code and a deactivated account', () => {
    expect(isOffice(asUser(null))).toBe(false)
    expect(isOffice(asUser(staff(['practitioner'])))).toBe(false)
    expect(isOffice(asUser(staff(['finance'])))).toBe(false)
    expect(isOffice(asUser(staff(['editor'])))).toBe(false)
    expect(isOffice(asUser(staff(['owner'], { _strategy: 'local-jwt' })))).toBe(false)
    expect(isOffice(asUser(staff(['owner'], { active: false })))).toBe(false)
  })
})

describe('what a booking’s summary shows (D-21, CLAUDE.md #3)', () => {
  it('leaves out the price, the person, the note and the hashes', () => {
    const summary = summarise({
      id: 1,
      reference: 'IIIC-S-00001',
      type: 'session',
      status: 'confirmed',
      paymentStatus: 'unpaid',
      service: 2,
      practitioner: 3,
      person: 4,
      format: 'online',
      startsAt: '2026-12-07T04:30:00.000Z',
      endsAt: '2026-12-07T05:00:00.000Z',
      price: { totalPaise: 100, taxPaise: 15 },
      timeRequest: { note: 'fake note' },
      manageTokenHash: 'fake-hash',
      checkoutKey: 'fake-key',
      updatedAt: '',
      createdAt: '',
    })
    expect(Object.keys(summary).sort()).toEqual(
      [
        'endsAt',
        'format',
        'holdExpiresAt',
        'id',
        'practitionerId',
        'reference',
        'serviceId',
        'startsAt',
        'status',
        'type',
      ].sort(),
    )
  })
})
