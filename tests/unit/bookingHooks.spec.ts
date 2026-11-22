// @vitest-environment node
import { ValidationError } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { Bookings } from '@/collections/Bookings'
import { bookingTasks, expireHoldsTask } from '@/jobs/booking'
import { assignReference, fillEnd, keepMoves } from '@/lib/booking/bookingHooks'

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
