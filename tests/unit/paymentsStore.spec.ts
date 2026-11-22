// @vitest-environment node
import type { sql } from '@payloadcms/db-postgres'
import type { PayloadRequest } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { claimGatewayEvent, lockRow, slotTakenByAnother } from '@/lib/payments/store'
import type { ParsedGatewayEvent } from '@/lib/payments/webhookEvent'

// The payments module's raw queries (src/lib/payments/store.ts), rendered as Postgres receives
// them: values travel as parameters, never inside the text, and the slot question names exactly
// the states the exclusion constraint covers. Their effect is proved against Postgres in
// tests/int/payments.int.spec.ts; fake ids only.

type Query = ReturnType<typeof sql>

function render(query: Query): { text: string; params: unknown[] } {
  const rendered = query.toQuery({
    escapeName: (name: string) => `"${name}"`,
    escapeParam: (index: number) => `$${index + 1}`,
    escapeString: (value: string) => `'${value}'`,
    casing: undefined as never,
  })
  return { text: rendered.sql.replace(/\s+/g, ' ').trim(), params: rendered.params }
}

function fakeRequest(rows: unknown[] = []) {
  const queries: Query[] = []
  const create = vi.fn(async () => ({}))
  const req = {
    transactionID: undefined,
    payload: {
      db: {
        sessions: {},
        drizzle: {
          execute: vi.fn(async (query: Query) => {
            queries.push(query)
            return { rows }
          }),
        },
      },
      create,
    },
    headers: new Headers(),
    user: null,
  } as unknown as PayloadRequest
  return { req, queries, create }
}

describe('the raw queries', () => {
  it('asks whether another booking in a slot-keeping state overlaps the time', async () => {
    const { req, queries } = fakeRequest([{ '?column?': 1 }])
    const taken = await slotTakenByAnother(req, {
      id: 7,
      practitioner: 3,
      startsAt: '2099-01-01T04:30:00.000Z',
      endsAt: '2099-01-01T05:00:00.000Z',
    })
    expect(taken).toBe(true)
    const { text, params } = render(queries[0] as Query)
    expect(text).toContain('"status"::text IN ($3, $4, $5, $6)')
    expect(text).toContain(
      'tstzrange("starts_at", "ends_at", \'[)\') && tstzrange($7::timestamptz, $8::timestamptz, \'[)\')',
    )
    expect(params).toEqual([
      3,
      7,
      'requested',
      'held',
      'pendingPayment',
      'confirmed',
      '2099-01-01T04:30:00.000Z',
      '2099-01-01T05:00:00.000Z',
    ])
  })

  it('does not ask about a booking with no practitioner or no time', async () => {
    const { req, queries } = fakeRequest()
    expect(
      await slotTakenByAnother(req, { id: 7, practitioner: null, startsAt: 'x', endsAt: 'y' }),
    ).toBe(false)
    expect(
      await slotTakenByAnother(req, { id: 7, practitioner: 3, startsAt: null, endsAt: null }),
    ).toBe(false)
    expect(queries).toHaveLength(0)
  })

  it('claims an event under its unique index without the database refusing anything', async () => {
    const { req, queries, create } = fakeRequest([{ id: 11 }])
    const event: ParsedGatewayEvent = {
      eventId: 'evt_fake1',
      type: 'payment.captured',
      gatewayOrderId: 'order_fake1',
      gatewayPaymentId: 'pay_fake1',
      gatewayPaymentLinkId: null,
      gatewayRefundId: null,
      amountPaise: 50_000,
      currency: 'INR',
      method: 'upi',
      errorCode: null,
      refundReceipt: null,
    }
    expect(await claimGatewayEvent(req, event, 'webhook', new Date('2099-01-01T00:00:00Z'))).toBe(
      11,
    )
    const { text, params } = render(queries[0] as Query)
    expect(text).toContain('ON CONFLICT ("gateway", "event_id") DO NOTHING RETURNING "id"')
    expect(text).not.toContain('evt_fake1')
    expect(params).toContain('evt_fake1')
    // Written past Payload's API, so its audit entry is written beside it.
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'audit-log',
        data: expect.objectContaining({
          action: 'create',
          entity: 'gateway-events',
          entityId: '11',
        }),
      }),
    )
  })

  it('answers a replay with no id, and writes no audit entry for it', async () => {
    const { req, create } = fakeRequest([])
    const event = { eventId: 'evt_fake1', type: 'payment.captured' } as ParsedGatewayEvent
    expect(await claimGatewayEvent(req, event, 'webhook', new Date())).toBeNull()
    expect(create).not.toHaveBeenCalled()
  })

  it('locks one row by its id', async () => {
    const { req, queries } = fakeRequest([{ id: 5 }])
    expect(await lockRow(req, 'payments', 5)).toBe(true)
    expect(render(queries[0] as Query)).toEqual({
      text: 'SELECT "id" FROM "payments" WHERE "id" = $1 FOR UPDATE',
      params: [5],
    })
  })
})
