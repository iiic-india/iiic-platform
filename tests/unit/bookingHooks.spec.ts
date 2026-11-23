// @vitest-environment node
import { ValidationError, type Field, type FieldAccess } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { Bookings } from '@/collections/Bookings'
import { bookingTasks, expireHoldsTask } from '@/jobs/booking'
import {
  assignReference,
  CAPTURE_CONFIRMATION,
  fillEnd,
  keepMoves,
  validatePaymentStatus,
} from '@/lib/booking/bookingHooks'
import { BOOKING_PAYMENT_STATUSES } from '@/lib/booking/states'

// The bookings collection's own rules (docs/16 §3, §6) and the B4 task's shape. The hooks run on
// every write, the admin form's included; a staff edit moves a booking only along the table of
// moves. Fake values only.

type HookArgs = Parameters<typeof keepMoves>[0]

const staff = { id: 1, collection: 'users', roles: ['operator'], active: true }

function args(overrides: Partial<HookArgs> & { data: Record<string, unknown> }): HookArgs {
  const count = vi.fn(async () => ({ totalDocs: 0 }))
  return {
    collection: Bookings as never,
    context: {},
    operation: 'update',
    req: { user: staff, payload: { count } } as never,
    ...overrides,
  } as HookArgs
}

describe('the bookings collection’s hooks', () => {
  it('runs the reference, the end and the moves before every change', () => {
    expect(Bookings.hooks?.beforeChange).toEqual([assignReference, fillEnd, keepMoves])
  })

  it('gives a new booking a reference of its kind when it has none', async () => {
    const data = (await assignReference(
      args({ operation: 'create', data: { type: 'call' } }),
    )) as Record<string, unknown>
    expect(data.reference).toMatch(/^IIIC-C-\d{5}$/)
    const kept = (await assignReference(
      args({ operation: 'create', data: { type: 'call', reference: 'IIIC-C-00001' } }),
    )) as Record<string, unknown>
    expect(kept.reference).toBe('IIIC-C-00001')
  })

  it('works out the end from the start and the length', async () => {
    const data = (await fillEnd(
      args({
        operation: 'create',
        data: { startsAt: '2026-12-07T04:30:00.000Z', durationMinutes: 45 },
      }),
    )) as Record<string, unknown>
    expect(data.endsAt).toBe('2026-12-07T05:15:00.000Z')
    const given = (await fillEnd(
      args({
        operation: 'create',
        data: {
          startsAt: '2026-12-07T04:30:00.000Z',
          durationMinutes: 45,
          endsAt: '2026-12-07T06:00:00.000Z',
        },
      }),
    )) as Record<string, unknown>
    expect(given.endsAt).toBe('2026-12-07T06:00:00.000Z')
  })

  it('lets a staff edit make the table’s moves only', async () => {
    const original = { status: 'held', type: 'session' }
    await expect(
      Promise.resolve(
        keepMoves(args({ data: { status: 'cancelledByClient' }, originalDoc: original as never })),
      ),
    ).resolves.toMatchObject({ status: 'cancelledByClient', holdExpiresAt: null })
    expect(() =>
      keepMoves(args({ data: { status: 'confirmed' }, originalDoc: original as never })),
    ).toThrow(ValidationError)
    expect(() =>
      keepMoves(
        args({ data: { status: 'held' }, originalDoc: { status: 'rescheduled' } as never }),
      ),
    ).toThrow(ValidationError)
  })

  it('needs the time and the practitioner before a staff edit confirms', () => {
    const request = { status: 'requested', type: 'session' }
    expect(() =>
      keepMoves(args({ data: { status: 'confirmed' }, originalDoc: request as never })),
    ).toThrow(ValidationError)
    const data = keepMoves(
      args({
        data: {
          status: 'confirmed',
          practitioner: 3,
          startsAt: '2026-12-07T04:30:00.000Z',
          endsAt: '2026-12-07T05:00:00.000Z',
        },
        originalDoc: request as never,
      }),
    ) as Record<string, unknown>
    expect(typeof data.confirmedAt).toBe('string')
  })

  it('lets a practitioner mark their session attended or a no-show, and nothing else', () => {
    const practitioner = { id: 2, collection: 'users', roles: ['practitioner'], active: true }
    const as = (from: string, to: string) =>
      keepMoves(
        args({
          data: { status: to },
          originalDoc: { status: from, type: 'session' } as never,
          req: { user: practitioner } as never,
        }),
      )
    expect(as('confirmed', 'completed')).toMatchObject({ status: 'completed' })
    expect(as('confirmed', 'noShow')).toMatchObject({ status: 'noShow' })
    for (const [from, to] of [
      ['confirmed', 'cancelledByIiic'],
      ['confirmed', 'rescheduled'],
      ['pendingPayment', 'confirmed'],
      ['held', 'cancelledByClient'],
    ] as const) {
      expect(() => as(from, to), `${from} → ${to}`).toThrow(ValidationError)
    }
  })

  it('confirms a hold, or a lapsed one, only for a captured payment, never by a staff edit', () => {
    const placed = {
      type: 'session',
      practitioner: 3,
      startsAt: '2026-12-07T04:30:00.000Z',
      endsAt: '2026-12-07T05:00:00.000Z',
    }
    for (const from of ['pendingPayment', 'expired']) {
      expect(
        () =>
          keepMoves(
            args({
              data: { status: 'confirmed' },
              originalDoc: { ...placed, status: from } as never,
            }),
          ),
        from,
      ).toThrow(ValidationError)
      // ConfirmBooking marks the write it makes for a capture (an owner may run the poll).
      const captured = keepMoves(
        args({
          data: { status: 'confirmed' },
          originalDoc: { ...placed, status: from } as never,
          context: { [CAPTURE_CONFIRMATION]: true },
        }),
      ) as Record<string, unknown>
      expect(captured.status).toBe('confirmed')
    }
  })

  it('keeps every field but the state to the office, and the payment state to the server', () => {
    const fields = new Map<string, Field>()
    const walk = (list: Field[]) => {
      for (const field of list) {
        if ('name' in field) fields.set(field.name, field)
        else if ('fields' in field) walk(field.fields)
      }
    }
    walk(Bookings.fields)
    const user = (role: string) => ({ id: 9, roles: [role], active: true, _strategy: 'totp' })
    const mayUpdate = (name: string, role: string) => {
      const update = (fields.get(name) as { access?: { update?: FieldAccess } }).access?.update
      if (!update) return true
      return update({ req: { user: user(role) } } as never)
    }
    const officeOnly = ['person', 'bookedBy', 'practitioner', 'startsAt', 'endsAt', 'service']
    for (const name of officeOnly) {
      expect(mayUpdate(name, 'practitioner'), name).toBe(false)
      expect(mayUpdate(name, 'operator'), name).toBe(true)
    }
    for (const name of ['paymentStatus', 'manageTokenHash', 'checkoutKey', 'rescheduledFrom']) {
      for (const role of ['owner', 'operator', 'practitioner']) {
        expect(mayUpdate(name, role), `${name} by ${role}`).toBe(false)
      }
    }
    expect(mayUpdate('status', 'practitioner')).toBe(true)
  })

  it('lets the office book a client as unpaid or needing no payment, and no later state', () => {
    const office = { user: staff, t: (key: string) => key }
    const check = (value: string, overrideAccess: boolean, operation = 'create') =>
      validatePaymentStatus(value, {
        operation,
        overrideAccess,
        req: office,
        options: [...BOOKING_PAYMENT_STATUSES],
        hasMany: false,
        required: true,
      } as never)
    expect(check('unpaid', false)).toBe(true)
    expect(check('notRequired', false)).toBe(true)
    expect(typeof check('paid', false)).toBe('string')
    expect(typeof check('linkSent', false)).toBe('string')
    // The payments module writes with access overridden.
    expect(check('paid', true)).toBe(true)
    expect(check('paid', true, 'update')).toBe(true)
  })

  it('leaves the server’s own writes to the booking module', () => {
    const data = keepMoves(
      args({
        data: { status: 'confirmed' },
        originalDoc: { status: 'held' } as never,
        req: { user: null } as never,
      }),
    )
    expect(data).toEqual({ status: 'confirmed' })
  })
})

describe('B4 · releasing holds past their time (docs/06)', () => {
  it('is a task named by its automation ID, retried, and registered', () => {
    expect(expireHoldsTask.slug).toBe('B4-expire-holds')
    expect(expireHoldsTask.retries).toBe(3)
    expect(bookingTasks.map((task) => task.slug)).toContain('B4-expire-holds')
  })
})
