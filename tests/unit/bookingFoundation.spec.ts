// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { Bookings } from '@/collections/Bookings'
import { Payments } from '@/collections/Payments'
import { Refunds } from '@/collections/Refunds'
import { isIstDay } from '@/fields/istDay'
import {
  BOOKING_MOVES,
  BOOKING_STATUSES,
  INITIAL_BOOKING_STATUSES,
  SLOT_BLOCKING_STATUSES,
} from '@/lib/booking/states'
import { FakeCalendar } from '@/lib/calendar/fakeCalendar'
import { parseEnv } from '@/lib/env'
import { FakeGateway } from '@/lib/payments/fakeGateway'
import {
  PAYMENT_MOVES,
  PAYMENT_STATUSES,
  REFUND_MOVES,
  REFUND_STATUSES,
} from '@/lib/payments/states'

// The foundation M3's builders code against (docs/16-booking-and-payments-design.md): the state
// tables, the double-booking guard's list of states, the fakes and the payment settings in the
// environment. Fake values only.

const MIGRATIONS = path.resolve(process.cwd(), 'src/migrations')

const valuesOf = (options: readonly { value: string }[]) => options.map((option) => option.value)

function selectOptions(fields: readonly unknown[], name: string): string[] {
  for (const field of fields as {
    name?: string
    type?: string
    fields?: unknown[]
    options?: { value: string }[]
  }[]) {
    if (field.name === name && field.type === 'select') return valuesOf(field.options ?? [])
    if (field.fields) {
      const inner = selectOptions(field.fields, name)
      if (inner.length) return inner
    }
  }
  return []
}

describe('the booking states (docs/16 §3)', () => {
  const statuses = valuesOf(BOOKING_STATUSES)

  it('moves only between known states, and starts only where a booking may start', () => {
    for (const [from, targets] of Object.entries(BOOKING_MOVES)) {
      expect(statuses, from).toContain(from)
      for (const to of targets) expect(statuses, `${from} → ${to}`).toContain(to)
    }
    for (const state of [...INITIAL_BOOKING_STATUSES, ...SLOT_BLOCKING_STATUSES]) {
      expect(statuses).toContain(state)
    }
  })

  it('leaves the final states final', () => {
    for (const state of [
      'completed',
      'noShow',
      'cancelledByClient',
      'cancelledByIiic',
      'rescheduled',
    ]) {
      expect(Object.keys(BOOKING_MOVES)).not.toContain(state)
    }
  })

  it('gives the collection the same states', () => {
    expect(selectOptions(Bookings.fields, 'status')).toEqual(statuses)
  })

  it('guards in the database exactly the states that keep a slot taken', () => {
    const file = readdirSync(MIGRATIONS).find((name) => name.endsWith('_bookings_no_overlap.ts'))
    expect(file).toBeDefined()
    const source = readFileSync(path.join(MIGRATIONS, file as string), 'utf8')
    const list = /"status" IN \(([^)]*)\)/.exec(source)?.[1] ?? ''
    const guarded = [...list.matchAll(/'([^']+)'/g)].map((match) => match[1])
    expect(guarded).toEqual([...SLOT_BLOCKING_STATUSES])
    expect(source).toMatch(/EXCLUDE USING gist/)
    expect(source).toMatch(/tstzrange\("starts_at", "ends_at", '\[\)'\) WITH &&/)
  })
})

describe('the payment and refund states (docs/16 §3)', () => {
  it.each([
    ['payments', PAYMENT_MOVES, valuesOf(PAYMENT_STATUSES), Payments],
    ['refunds', REFUND_MOVES, valuesOf(REFUND_STATUSES), Refunds],
  ] as const)('%s move only between known states', (_, moves, statuses, collection) => {
    for (const [from, targets] of Object.entries(moves)) {
      expect(statuses, from).toContain(from)
      for (const to of targets as readonly string[])
        expect(statuses, `${from} → ${to}`).toContain(to)
    }
    expect(selectOptions(collection.fields, 'status')).toEqual(statuses)
  })

  it('never moves a captured payment back to unpaid', () => {
    expect(PAYMENT_MOVES.captured).toEqual(['partRefunded', 'refunded'])
  })
})

describe('days as the admin holds them', () => {
  it('takes a real calendar day as YYYY-MM-DD, and nothing else', () => {
    expect(isIstDay('2026-12-01')).toBe(true)
    expect(isIstDay('2028-02-29')).toBe(true)
    for (const bad of ['2026-02-30', '2026-13-01', '01-12-2026', '2026-1-1', '', null, 20261201]) {
      expect(isIstDay(bad), String(bad)).toBe(false)
    }
  })
})

describe('the fake gateway (docs/16 §11)', () => {
  it('signs its webhooks as the real one does, and refuses a changed body', async () => {
    const gateway = new FakeGateway('fake-secret-for-this-test-only')
    const order = await gateway.createOrder({ amountPaise: 150000, receipt: 'fake-r1', notes: {} })
    expect(order.ok).toBe(true)
    if (!order.ok) return
    const webhook = gateway.pay(order.value.orderId)
    expect(gateway.verifyWebhook(webhook.rawBody, webhook.signature)).toBe(true)
    expect(gateway.verifyWebhook(webhook.rawBody.replace('150000', '1'), webhook.signature)).toBe(
      false,
    )
    expect(gateway.verifyWebhook(webhook.rawBody, 'not-a-signature')).toBe(false)
    expect(
      new FakeGateway('another-secret').verifyWebhook(webhook.rawBody, webhook.signature),
    ).toBe(false)
  })

  it('makes one order per receipt, and refunds only a captured payment', async () => {
    const gateway = new FakeGateway()
    const first = await gateway.createOrder({ amountPaise: 150000, receipt: 'fake-r2', notes: {} })
    const again = await gateway.createOrder({ amountPaise: 150000, receipt: 'fake-r2', notes: {} })
    expect(first.ok && again.ok && first.value.orderId === again.value.orderId).toBe(true)
    if (!first.ok) return
    gateway.pay(first.value.orderId, 'failed')
    const [failed] = gateway.payments.values()
    const refused = await gateway.refund({
      paymentId: failed?.paymentId ?? '',
      amountPaise: 150000,
      receipt: 'fake-refund',
    })
    expect(refused.ok).toBe(false)
  })

  it('answers "unavailable" while it is down', async () => {
    const gateway = new FakeGateway()
    gateway.down = true
    const order = await gateway.createOrder({ amountPaise: 150000, receipt: 'fake-r3', notes: {} })
    expect(order).toEqual({ ok: false, error: { code: 'unavailable' } })
  })
})

describe('the fake calendar (docs/16 §11)', () => {
  const window = { start: new Date('2099-01-05T00:00:00Z'), end: new Date('2099-01-06T00:00:00Z') }
  const event = {
    reference: 'IIIC-S-00001',
    start: new Date('2099-01-05T05:00:00Z'),
    end: new Date('2099-01-05T05:30:00Z'),
    title: 'Fake session',
    location: null,
    meet: true,
  }

  it('writes one event per booking and counts it as busy', async () => {
    const calendar = new FakeCalendar()
    const first = await calendar.createEvent('fake@example.invalid', event)
    const again = await calendar.createEvent('fake@example.invalid', event)
    expect(first.ok && again.ok && first.value.eventId === again.value.eventId).toBe(true)
    const busy = await calendar.freeBusy('fake@example.invalid', window)
    expect(busy).toEqual({ ok: true, value: [{ start: event.start, end: event.end }] })
  })

  it('refuses a calendar it may not reach', async () => {
    const calendar = new FakeCalendar()
    calendar.forbidden.add('fake@example.invalid')
    expect(await calendar.freeBusy('fake@example.invalid', window)).toEqual({
      ok: false,
      error: { code: 'forbidden' },
    })
  })
})

describe('payment settings in the environment (docs/16 §11)', () => {
  const base = {
    PAYLOAD_SECRET: 'a'.repeat(32),
    DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/iiic',
  }
  const razorpay = {
    RAZORPAY_KEY_ID: 'rzp_test_fake0000',
    RAZORPAY_KEY_SECRET: 'fake-secret',
    RAZORPAY_WEBHOOK_SECRET: 'fake-webhook-secret-0000',
  }

  it('takes test keys, all three together', () => {
    expect(parseEnv({ ...base, ...razorpay }).RAZORPAY_KEY_ID).toBe('rzp_test_fake0000')
    expect(() => parseEnv({ ...base, RAZORPAY_KEY_ID: 'rzp_test_fake0000' })).toThrow(/together/)
  })

  it('refuses a live key anywhere but the production deployment', () => {
    const live = { ...base, ...razorpay, RAZORPAY_KEY_ID: 'rzp_live_fake0000' }
    expect(() => parseEnv(live)).toThrow(/live key/)
    expect(() => parseEnv({ ...live, VERCEL_ENV: 'preview' })).toThrow(/live key/)
    expect(parseEnv({ ...live, VERCEL_ENV: 'production' }).RAZORPAY_KEY_ID).toBe(
      'rzp_live_fake0000',
    )
  })

  it('keeps the fake gateway off every Vercel deployment', () => {
    expect(parseEnv({ ...base, PAYMENT_GATEWAY: 'fake' }).PAYMENT_GATEWAY).toBe('fake')
    for (const VERCEL_ENV of ['preview', 'production', 'development']) {
      expect(() => parseEnv({ ...base, PAYMENT_GATEWAY: 'fake', VERCEL_ENV }), VERCEL_ENV).toThrow(
        /fake gateway/,
      )
    }
    expect(parseEnv(base).PAYMENT_GATEWAY).toBe('razorpay')
  })
})
