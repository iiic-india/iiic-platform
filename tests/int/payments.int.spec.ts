import { sql } from '@payloadcms/db-postgres'
import { createLocalReq, getPayload, type Payload, type PayloadRequest } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { confirmBooking } from '@/lib/booking/confirm'
import type { DomainEvent } from '@/lib/booking/events'
import type { PaymentsDeps } from '@/lib/payments/deps'
import { FakeGateway } from '@/lib/payments/fakeGateway'
import { makePayments } from '@/lib/payments/service'
import { parseRazorpayEvent, type ParsedGatewayEvent } from '@/lib/payments/webhookEvent'
import { ok } from '@/lib/result'
import type {
  Booking,
  Payment,
  Person,
  PlatformSettings,
  Practitioner,
  Refund,
  Service,
  User,
} from '@/payload-types'
import config from '@/payload.config'

import { removeQueuedJobs } from '../helpers/queuedJobs'

vi.mock('server-only', () => ({}))

// The payments module against the real Postgres (docs/16 §5, §11): each gateway event processed
// once under the unique (gateway, event_id) index, a replay and a concurrent duplicate changing
// nothing, a processing failure rolling the claim back, the late payment for a taken slot
// refunded (B10), the refund threshold and the owner's approval, the price history, the poll and
// B11. The gateway is the fake, which signs as Razorpay does; bookings are confirmed by the
// booking module's own ConfirmBooking, under its savepoint guard. Everything is obviously fake and
// removed at the end, the calendar jobs its confirmations queue included; settings are put back.

let payload: Payload
const TAG = 'int.payments'
const REF = 'INT-PAY-'
let service: Service
let person: Person
let practitioner: Practitioner
const staff = {} as Record<'owner' | 'operator', User>
let made = 0
let savedSettings: Pick<PlatformSettings, 'flags' | 'money'>

const gateway = new FakeGateway('fake-webhook-secret-for-int-tests-only')
const emitted: DomainEvent[] = []

const deps: PaymentsDeps = {
  gateway: () => ok(gateway),
  confirmBooking,
  emit: async (_req, event) => {
    emitted.push(event)
  },
  now: () => new Date(),
}
const payments = makePayments(deps)

/** A fixed hour far ahead, in a day no other test uses: minutes after 2099-02-09 10:00 IST. */
const at = (minutes: number) => new Date(Date.UTC(2099, 1, 9, 4, 30) + minutes * 60_000)

const fresh = (): Promise<PayloadRequest> => createLocalReq({}, payload)
const as = (user: User, strategy = 'totp'): Promise<PayloadRequest> =>
  createLocalReq({ user: { ...user, collection: 'users', _strategy: strategy } as User }, payload)

async function removeTestData() {
  const { docs: bookings } = await payload.find({
    collection: 'bookings',
    where: { reference: { like: REF } },
    pagination: false,
    depth: 0,
  })
  const bookingIds = bookings.map((booking) => booking.id)
  const { docs: profiles } = await payload.find({
    collection: 'practitioners',
    where: { publicName: { like: TAG } },
    pagination: false,
    depth: 0,
  })
  await removeQueuedJobs(payload, {
    bookingIds,
    practitionerIds: profiles.map((profile) => profile.id),
  })
  await payload.delete({ collection: 'gateway-events', where: { eventId: { like: 'fake' } } })
  if (bookingIds.length) {
    await payload.delete({ collection: 'refunds', where: { booking: { in: bookingIds } } })
    await payload.delete({ collection: 'payments', where: { booking: { in: bookingIds } } })
  }
  await payload.delete({ collection: 'bookings', where: { reference: { like: REF } } })
  await payload.delete({ collection: 'practitioners', where: { publicName: { like: TAG } } })
  await payload.delete({ collection: 'services', where: { slug: { like: 'int-payments' } } })
  await payload.delete({ collection: 'people', where: { fullName: { like: TAG } } })
  await payload.delete({ collection: 'users', where: { email: { like: `${TAG}.` } } })
}

/** A booking as the booking flow leaves one at step 4: held, with its total copied in. */
function book(status: Booking['status'], from: number, extra: Partial<Booking> = {}) {
  return payload.create({
    collection: 'bookings',
    data: {
      // Within the field's 20 characters, as the IIIC-S-24117 form is (src/lib/booking/reference.ts).
      reference: `${REF}${(Date.now() % 1_000_000).toString(36)}-${++made}`,
      type: 'session',
      status,
      paymentStatus: 'unpaid',
      service: service.id,
      person: person.id,
      practitioner: practitioner.id,
      startsAt: at(from).toISOString(),
      endsAt: at(from + 30).toISOString(),
      holdExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      price: { totalPaise: 50_000, taxPaise: 7627, gstRateBasisPoints: 1800, sacCode: '000000' },
      ...extra,
    } as Booking,
  })
}

async function setSettings(data: Partial<PlatformSettings>) {
  await payload.updateGlobal({ slug: 'settings', data })
}

/** A held booking with its checkout open, and the order the fake gateway made for it. */
async function checkoutFor(from: number): Promise<{ booking: Booking; orderId: string }> {
  const booking = await book('held', from)
  const opened = await payments.openCheckout(await fresh(), { bookingId: booking.id })
  if (!opened.ok) throw new Error(`checkout refused: ${opened.error.code}`)
  return { booking, orderId: opened.value.orderId }
}

/** The client paying at checkout: the fake captures and signs the webhook Razorpay would send. */
function paid(orderId: string, outcome: 'captured' | 'failed' = 'captured'): ParsedGatewayEvent {
  const sent = gateway.pay(orderId, outcome)
  const parsed = parseRazorpayEvent(sent.rawBody, sent.eventId)
  if (!parsed.ok) throw new Error(parsed.error.code)
  return parsed.value
}

const process = async (event: ParsedGatewayEvent, source: 'webhook' | 'poll' = 'webhook') => {
  const result = await payments.processGatewayEvent(await fresh(), event, source)
  if (!result.ok) throw new Error(result.error.code)
  return result.value
}

const reread = <T extends 'bookings' | 'payments' | 'refunds'>(collection: T, id: number) =>
  payload.findByID({ collection, id, depth: 0 })

async function eventRows(eventId: string) {
  const { docs } = await payload.find({
    collection: 'gateway-events',
    where: { eventId: { equals: eventId } },
    depth: 0,
  })
  return docs
}

async function paymentOf(bookingId: number): Promise<Payment> {
  const { docs } = await payload.find({
    collection: 'payments',
    where: { booking: { equals: bookingId } },
    depth: 0,
  })
  return docs[0] as Payment
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await removeTestData()
  savedSettings = await payload.findGlobal({
    slug: 'settings',
    select: { flags: true, money: true },
    depth: 0,
  })
  for (const role of ['owner', 'operator'] as const) {
    staff[role] = await payload.create({
      collection: 'users',
      data: {
        name: `Fake ${role}`,
        email: `${TAG}.${role}@example.invalid`,
        password: 'test-only-password-payments',
        roles: [role],
      },
    })
  }
  service = await payload.create({
    collection: 'services',
    data: {
      name: `Fake service ${TAG}`,
      type: 'session',
      slug: `int-payments-${Date.now()}`,
      register: 'counselling',
      format: 'online',
    } as Service,
  })
  practitioner = await payload.create({
    collection: 'practitioners',
    data: { publicName: `Fake ${TAG}` } as Practitioner,
  })
  person = await payload.create({
    collection: 'people',
    data: { fullName: `Fake Person ${TAG}` } as Person,
  })
  await setSettings({
    flags: { ...savedSettings.flags, pricesPublic: true, payAtBooking: true },
    money: { refundApprovalThresholdPaise: null },
  })
})

afterAll(async () => {
  await setSettings({ flags: savedSettings.flags, money: savedSettings.money })
  await removeTestData()
})

describe('checkout at booking (docs/16 §5)', () => {
  it('opens one order per held booking, for its own total, and moves it to pendingPayment', async () => {
    const booking = await book('held', 0)
    const first = await payments.openCheckout(await fresh(), { bookingId: booking.id })
    const again = await payments.openCheckout(await fresh(), { bookingId: booking.id })
    expect(first.ok && again.ok).toBe(true)
    if (!first.ok || !again.ok) return
    expect(again.value.orderId).toBe(first.value.orderId)
    expect(first.value.keyId).toBe(gateway.publicKeyId)
    expect(first.value.payment).toMatchObject({ amountPaise: 50_000, status: 'created' })
    expect((await reread('bookings', booking.id)).status).toBe('pendingPayment')
    const { totalDocs } = await payload.count({
      collection: 'payments',
      where: { booking: { equals: booking.id } },
    })
    expect(totalDocs).toBe(1)
  })

  it('takes no payment at booking while payment at booking is off', async () => {
    await setSettings({
      flags: { ...savedSettings.flags, pricesPublic: true, payAtBooking: false },
    })
    const booking = await book('held', 40)
    expect(await payments.openCheckout(await fresh(), { bookingId: booking.id })).toEqual({
      ok: false,
      error: { code: 'prices-hidden' },
    })
    await setSettings({ flags: { ...savedSettings.flags, pricesPublic: true, payAtBooking: true } })
  })

  it('keeps the hold when the gateway is down', async () => {
    const booking = await book('held', 80)
    gateway.down = true
    const refused = await payments.openCheckout(await fresh(), { bookingId: booking.id })
    gateway.down = false
    expect(refused).toEqual({ ok: false, error: { code: 'unavailable' } })
    expect((await reread('bookings', booking.id)).status).toBe('held')
  })
})

describe('each gateway event, once (docs/16 §5)', () => {
  let captured: { booking: Booking; orderId: string; event: ParsedGatewayEvent }

  it('captures the payment, confirms the booking and marks it paid', async () => {
    const opened = await checkoutFor(120)
    const event = paid(opened.orderId)
    captured = { ...opened, event }
    expect(await process(event)).toEqual({ outcome: 'processed', refundsToSend: [] })
    const booking = await reread('bookings', opened.booking.id)
    expect(booking).toMatchObject({ status: 'confirmed', paymentStatus: 'paid' })
    expect(await paymentOf(opened.booking.id)).toMatchObject({
      status: 'captured',
      gatewayPaymentId: event.gatewayPaymentId,
    })
    expect(emitted).toContainEqual(
      expect.objectContaining({ name: 'payment.captured', bookingId: opened.booking.id }),
    )
  })

  it('answers a replay of the same event and changes nothing', async () => {
    expect(await process(captured.event)).toEqual({ outcome: 'replay', refundsToSend: [] })
    expect(await eventRows(captured.event.eventId)).toHaveLength(1)
  })

  it('ignores a second event for the same capture, and a failure reported after it', async () => {
    const orderPaid = {
      ...captured.event,
      eventId: `${captured.event.eventId}x`,
      type: 'order.paid' as const,
    }
    expect((await process(orderPaid)).outcome).toBe('ignored')
    const lateFailure = {
      ...captured.event,
      eventId: `${captured.event.eventId}y`,
      type: 'payment.failed' as const,
      gatewayPaymentId: 'pay_fakeearlier',
      errorCode: 'BAD_REQUEST_ERROR',
    }
    expect((await process(lateFailure)).outcome).toBe('ignored')
    expect((await paymentOf(captured.booking.id)).status).toBe('captured')
    const [row] = await eventRows(lateFailure.eventId)
    expect(row).toMatchObject({ outcome: 'ignored', note: 'out-of-order' })
  })

  it('answers a concurrent duplicate as a replay, under the unique index', async () => {
    const { booking, orderId } = await checkoutFor(160)
    const event = paid(orderId)
    const outcomes = (await Promise.all([process(event), process(event)])).map(
      (result) => result.outcome,
    )
    expect(outcomes.sort()).toEqual(['processed', 'replay'])
    expect(await eventRows(event.eventId)).toHaveLength(1)
    expect((await reread('bookings', booking.id)).status).toBe('confirmed')
  })

  it('flags an amount or a currency that differs from the payment’s, confirming nothing', async () => {
    const { booking, orderId } = await checkoutFor(200)
    const event = paid(orderId)
    const short = { ...event, amountPaise: 100 }
    expect((await process(short)).outcome).toBe('flagged')
    const dollars = { ...event, eventId: `${event.eventId}usd`, currency: 'USD' }
    expect((await process(dollars)).outcome).toBe('flagged')
    expect((await reread('bookings', booking.id)).status).toBe('pendingPayment')
    expect((await paymentOf(booking.id)).status).toBe('created')
    expect((await eventRows(event.eventId))[0]).toMatchObject({ note: 'amount-mismatch' })
  })

  it('rolls the claim back when acting fails, so the retried event is processed', async () => {
    const { booking, orderId } = await checkoutFor(240)
    const event = paid(orderId)
    const failing = makePayments({
      ...deps,
      confirmBooking: async () => {
        throw new Error('the booking module is down')
      },
    })
    await expect(failing.processGatewayEvent(await fresh(), event, 'webhook')).rejects.toThrow()
    expect(await eventRows(event.eventId)).toHaveLength(0)
    expect((await paymentOf(booking.id)).status).toBe('created')
    expect((await process(event)).outcome).toBe('processed')
    expect((await reread('bookings', booking.id)).status).toBe('confirmed')
  })

  it('keeps the hold after a failed attempt, and a second attempt still pays', async () => {
    const { booking, orderId } = await checkoutFor(280)
    expect((await process(paid(orderId, 'failed'))).outcome).toBe('processed')
    expect(await paymentOf(booking.id)).toMatchObject({
      status: 'failed',
      failureCode: 'BAD_REQUEST_ERROR',
    })
    expect((await reread('bookings', booking.id)).status).toBe('pendingPayment')
    expect((await process(paid(orderId))).outcome).toBe('processed')
    expect((await reread('bookings', booking.id)).status).toBe('confirmed')
  })
})

describe('two people paying for one time (B10)', () => {
  it('confirms exactly one and refunds the other in full', async () => {
    const late = await checkoutFor(400)
    await payload.update({
      collection: 'bookings',
      id: late.booking.id,
      data: { status: 'expired' },
    })
    const prompt = await checkoutFor(400)
    const [lateResult, promptResult] = await Promise.all([
      process(paid(late.orderId)),
      process(paid(prompt.orderId)),
    ])
    expect(promptResult.outcome).toBe('processed')
    expect(lateResult.outcome).toBe('flagged')
    expect((await reread('bookings', prompt.booking.id)).status).toBe('confirmed')
    expect((await reread('bookings', late.booking.id)).status).toBe('expired')

    const latePayment = await paymentOf(late.booking.id)
    const { docs } = await payload.find({
      collection: 'refunds',
      where: { payment: { equals: latePayment.id } },
      depth: 0,
    })
    expect(docs).toHaveLength(1)
    const refund = docs[0] as Refund
    expect(refund).toMatchObject({
      status: 'approved',
      reason: 'slotTaken',
      amountPaise: 50_000,
      idempotencyKey: `slotTaken:${latePayment.id}`,
      requestedBy: null,
    })
    expect(lateResult.refundsToSend).toEqual([refund.id])
    expect(emitted).toContainEqual({
      name: 'booking.slotLost',
      bookingId: late.booking.id,
      paymentId: latePayment.id,
    })

    // Sent after the event's transaction committed: refunded to the original payment, once.
    const sent = await payments.sendRefund(payload, refund.id)
    expect(sent.ok && sent.value.status).toBe('processed')
    expect(await reread('payments', latePayment.id)).toMatchObject({
      status: 'refunded',
      refundedPaise: 50_000,
    })
    expect((await reread('bookings', late.booking.id)).paymentStatus).toBe('refunded')
    const again = await payments.sendRefund(payload, refund.id)
    expect(again.ok && again.value.status).toBe('processed')
    expect(
      [...gateway.refunds.values()].filter((r) => r.paymentId === latePayment.gatewayPaymentId),
    ).toHaveLength(1)

    // The gateway's own event for it, arriving afterwards, changes nothing.
    const gatewayRefund = [...gateway.refunds.values()].find(
      (r) => r.paymentId === latePayment.gatewayPaymentId,
    )
    const sentEvent = gateway.webhook('refund.processed', {
      refund: {
        entity: {
          id: gatewayRefund?.refundId,
          payment_id: latePayment.gatewayPaymentId,
          amount: 50_000,
          currency: 'INR',
          receipt: refund.idempotencyKey,
        },
      },
    })
    const parsed = parseRazorpayEvent(sentEvent.rawBody, sentEvent.eventId)
    expect(parsed.ok && (await process(parsed.value)).outcome).toBe('ignored')
  })
  it('lets the constraint settle a true race: two lapsed holds for one time, both paid at once', async () => {
    const first = await checkoutFor(460)
    await payload.update({
      collection: 'bookings',
      id: first.booking.id,
      data: { status: 'expired' },
    })
    const second = await checkoutFor(460)
    await payload.update({
      collection: 'bookings',
      id: second.booking.id,
      data: { status: 'expired' },
    })
    const results = await Promise.all([process(paid(first.orderId)), process(paid(second.orderId))])
    expect(results.map((result) => result.outcome).sort()).toEqual(['flagged', 'processed'])

    const statuses = await Promise.all(
      [first, second].map(async ({ booking }) => (await reread('bookings', booking.id)).status),
    )
    expect(statuses.filter((status) => status === 'confirmed')).toHaveLength(1)
    const loser = statuses[0] === 'confirmed' ? second : first
    const loserPayment = await paymentOf(loser.booking.id)
    expect(loserPayment.status).toBe('captured')
    const { docs } = await payload.find({
      collection: 'refunds',
      where: { payment: { equals: loserPayment.id } },
      depth: 0,
    })
    expect(docs).toHaveLength(1)
    expect(docs[0]).toMatchObject({
      status: 'approved',
      reason: 'slotTaken',
      amountPaise: 50_000,
      idempotencyKey: `slotTaken:${loserPayment.id}`,
    })
    const sent = await payments.sendRefund(payload, (docs[0] as Refund).id)
    expect(sent.ok && sent.value.status).toBe('processed')
    expect((await reread('payments', loserPayment.id)).status).toBe('refunded')
  })
})

describe('refunds the office asks for (docs/05, Money)', () => {
  let payment: Payment

  beforeAll(async () => {
    const { booking, orderId } = await checkoutFor(600)
    await process(paid(orderId))
    payment = await paymentOf(booking.id)
  })

  const ask = async (user: User, amountPaise: number, key: string) =>
    payments.requestRefund(await as(user), {
      paymentId: payment.id,
      amountPaise,
      reason: 'cancelledByIiic',
      idempotencyKey: key,
      by: 'staff',
    })

  it('waits for an owner while no threshold is set, even for the smallest refund', async () => {
    const result = await ask(staff.operator, 100, 'int:fake:unset')
    expect(result.ok && result.value.status).toBe('awaitingApproval')
    expect(emitted).toContainEqual(expect.objectContaining({ name: 'refund.awaitingApproval' }))
    if (result.ok) {
      const declined = await payments.decideRefund(await as(staff.owner), {
        refundId: result.value.id,
        decision: 'decline',
      })
      expect(declined.ok && declined.value.status).toBe('declined')
    }
  })

  it('approves at once within the threshold, and asks an owner above it', async () => {
    await setSettings({ money: { refundApprovalThresholdPaise: 10_000 } })
    const small = await ask(staff.operator, 10_000, 'int:fake:small')
    expect(small.ok && small.value.status).toBe('approved')
    const large = await ask(staff.operator, 20_000, 'int:fake:large')
    expect(large.ok && large.value.status).toBe('awaitingApproval')
    if (!large.ok) return
    expect(
      await payments.decideRefund(await as(staff.operator), {
        refundId: large.value.id,
        decision: 'approve',
      }),
    ).toEqual({ ok: false, error: { code: 'needs-owner' } })
    expect(
      await payments.decideRefund(await as(staff.owner, 'local-jwt'), {
        refundId: large.value.id,
        decision: 'approve',
      }),
    ).toEqual({ ok: false, error: { code: 'needs-owner' } })
    const approved = await payments.decideRefund(await as(staff.owner), {
      refundId: large.value.id,
      decision: 'approve',
    })
    expect(approved.ok && approved.value).toMatchObject({
      status: 'approved',
      approvedBy: staff.owner.id,
    })
  })

  it('never promises more than the payment can give back, and a key is one refund', async () => {
    // 50,000 paid; 10,000 and 20,000 promised: 20,000 left.
    expect(await ask(staff.operator, 20_001, 'int:fake:over')).toEqual({
      ok: false,
      error: { code: 'over-refund', refundablePaise: 20_000 },
    })
    const again = await ask(staff.operator, 10_000, 'int:fake:small')
    expect(again.ok && again.value.amountPaise).toBe(10_000)
    const { totalDocs } = await payload.count({
      collection: 'refunds',
      where: { idempotencyKey: { equals: 'int:fake:small' } },
    })
    expect(totalDocs).toBe(1)
  })

  it('holds a refund made through the admin to the same rules', async () => {
    const outside = async (user: User) => {
      const req = await as(user)
      req.payloadAPI = 'REST'
      return req
    }
    await expect(
      payload.create({
        collection: 'refunds',
        data: { payment: payment.id, amountPaise: 30_000, reason: 'other' } as Refund,
        req: await outside(staff.operator),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    const asked = await payload.create({
      collection: 'refunds',
      data: {
        payment: payment.id,
        amountPaise: 15_000,
        reason: 'other',
        status: 'processed',
      } as Refund,
      req: await outside(staff.operator),
      overrideAccess: false,
    })
    expect(asked).toMatchObject({ status: 'awaitingApproval', requestedBy: staff.operator.id })
    await expect(
      payload.update({
        collection: 'refunds',
        id: asked.id,
        data: { status: 'approved' },
        req: await outside(staff.operator),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    const approved = await payload.update({
      collection: 'refunds',
      id: asked.id,
      data: { status: 'approved' },
      req: await outside(staff.owner),
      overrideAccess: false,
    })
    expect(approved).toMatchObject({ status: 'approved', approvedBy: staff.owner.id })
  })
})

describe('the price in force (docs/16 §5)', () => {
  it('opens a price row when a price is set, closes it when the price changes, and quotes from it', async () => {
    const priced = await payload.create({
      collection: 'services',
      data: {
        name: `Fake priced ${TAG}`,
        type: 'session',
        slug: `int-payments-priced-${Date.now()}`,
        register: 'counselling',
        format: 'online',
        gstRateBasisPoints: 1800,
        sacCode: '000000',
        options: [{ label: 'Fake', duration: 30, price: 118_000, gstInclusive: true }],
      } as Service,
    })
    const optionId = priced.options?.[0]?.id as string
    const quote = await payments.quotePrice(await fresh(), {
      serviceId: priced.id,
      serviceOption: optionId,
      at: new Date(),
    })
    expect(quote.ok && quote.value).toMatchObject({
      totalPaise: 118_000,
      taxPaise: 18_000,
      rate: 1800,
      sacCode: '000000',
    })

    await payload.update({ collection: 'services', id: priced.id, data: { name: priced.name } })
    const rows = () =>
      payload.find({
        collection: 'price-history',
        where: { service: { equals: priced.id } },
        sort: 'validFrom',
        depth: 0,
      })
    expect((await rows()).totalDocs).toBe(1)

    await payload.update({
      collection: 'services',
      id: priced.id,
      data: {
        options: [
          { id: optionId, label: 'Fake', duration: 30, price: 236_000, gstInclusive: true },
        ],
      },
    })
    const after = (await rows()).docs
    expect(after).toHaveLength(2)
    expect(after[0]?.validTo).toBeTruthy()
    expect(after[1]?.pricePaise).toBe(236_000)
    expect(after[1]?.validTo ?? null).toBeNull()
    const requote = await payments.quotePrice(await fresh(), {
      serviceId: priced.id,
      serviceOption: optionId,
      at: new Date(),
    })
    expect(requote.ok && requote.value.totalPaise).toBe(236_000)
  })
})

describe('the order-status poll and B11', () => {
  it('captures through the poll a payment whose webhook never came, once', async () => {
    const { booking, orderId } = await checkoutFor(800)
    gateway.pay(orderId) // the webhook is lost
    const payment = await paymentOf(booking.id)
    await payload.db.drizzle.execute(
      sql`UPDATE "payments" SET "created_at" = now() - interval '10 minutes' WHERE "id" = ${payment.id}`,
    )
    const polled = await payments.pollPendingOrders(await fresh(), new Date())
    expect(polled.checked).toBeGreaterThanOrEqual(1)
    expect((await reread('bookings', booking.id)).status).toBe('confirmed')
    const captured = await reread('payments', payment.id)
    expect(await eventRows(`poll:${captured.gatewayPaymentId}:captured`)).toHaveLength(1)
    await payments.pollPendingOrders(await fresh(), new Date())
    expect(await eventRows(`poll:${captured.gatewayPaymentId}:captured`)).toHaveLength(1)
  })

  it('flags a capture the platform does not know, once however often it runs', async () => {
    const now = new Date()
    gateway.payments.set('pay_fakeorphan', {
      paymentId: 'pay_fakeorphan',
      orderId: 'order_fakeorphan',
      amountPaise: 12_300,
      status: 'captured',
      method: 'upi',
      errorCode: null,
      createdAt: now,
    })
    const window = { from: new Date(now.getTime() - 60_000), to: new Date(now.getTime() + 60_000) }
    const first = await payments.reconcileDay(await fresh(), window)
    expect(first.flagged).toBeGreaterThanOrEqual(1)
    const [row] = await eventRows('reconcile:pay_fakeorphan:unknown-capture')
    expect(row).toMatchObject({
      source: 'reconciliation',
      outcome: 'flagged',
      note: 'unknown-capture',
    })
    await payments.reconcileDay(await fresh(), window)
    expect(await eventRows('reconcile:pay_fakeorphan:unknown-capture')).toHaveLength(1)
  })
})
