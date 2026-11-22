import { sql } from '@payloadcms/db-postgres'
import { createLocalReq, getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { requestClientRefund } from '@/lib/bookingFlow/clientRefund'
import { bookInfoSession } from '@/lib/bookingFlow/info'
import type { Booking, Person, PlatformSettings, Service } from '@/payload-types'
import config from '@/payload.config'

vi.mock('server-only', () => ({}))

// The booking flow's own server pieces against the real Postgres (docs/16 §5, §6, §11): the
// refund a client's cancellation asks for (approved at once only within the threshold in
// Settings, else waiting for an owner; one per payment; never more than the payment can give
// back) and a place at an info session (confirmed at once, free, never past the capacity, a
// double submit booking once). Everything is obviously fake and removed at the end; the
// settings are put back.

let payload: Payload
const TAG = 'int.bookingFlow'
const REF = 'INT-FLOW-'
let service: Service
let person: Person
let made = 0
let saved: Pick<PlatformSettings, 'money'>

const fresh = () => createLocalReq({}, payload)

async function removeTestData() {
  const { docs: events } = await payload.find({
    collection: 'events',
    where: { title: { like: TAG } },
    pagination: false,
    depth: 0,
  })
  const { docs: bookings } = await payload.find({
    collection: 'bookings',
    where: {
      or: [
        { reference: { like: REF } },
        ...(events.length ? [{ event: { in: events.map((event) => event.id) } }] : []),
      ],
    },
    pagination: false,
    depth: 0,
  })
  const ids = bookings.map((booking) => booking.id)
  for (const id of ids) {
    await payload.db.drizzle.execute(
      sql`DELETE FROM "payload_jobs" WHERE "input"->>'bookingId' = ${String(id)}`,
    )
  }
  if (ids.length) {
    const { docs: refunds } = await payload.find({
      collection: 'refunds',
      where: { booking: { in: ids } },
      pagination: false,
      depth: 0,
    })
    for (const refund of refunds) {
      await payload.db.drizzle.execute(
        sql`DELETE FROM "payload_jobs" WHERE "input"->>'refundId' = ${String(refund.id)}`,
      )
    }
    await payload.delete({ collection: 'refunds', where: { booking: { in: ids } } })
    await payload.delete({ collection: 'payments', where: { booking: { in: ids } } })
    await payload.delete({ collection: 'bookings', where: { id: { in: ids } } })
  }
  await payload.delete({ collection: 'events', where: { title: { like: TAG } } })
  await payload.delete({ collection: 'services', where: { slug: { like: 'int-flow' } } })
  await payload.delete({ collection: 'people', where: { fullName: { like: TAG } } })
}

/** A confirmed session with a captured payment of ₹500 on it (all fake). */
async function paidBooking(): Promise<{ booking: Booking; paymentId: number }> {
  made += 1
  const booking = await payload.create({
    collection: 'bookings',
    data: {
      reference: `${REF}${Date.now()}-${made}`,
      type: 'session',
      status: 'cancelledByClient',
      paymentStatus: 'paid',
      service: service.id,
      person: person.id,
    } as Booking,
  })
  const payment = await payload.create({
    collection: 'payments',
    data: {
      booking: booking.id,
      kind: 'checkout',
      gateway: 'razorpay',
      status: 'captured',
      amountPaise: 50_000,
      currency: 'INR',
      refundedPaise: 0,
      receipt: `booking:${booking.id}:checkout`,
      gatewayOrderId: `order_fakeintflow${made}`,
      gatewayPaymentId: `pay_fakeintflow${made}`,
    },
  })
  return { booking, paymentId: payment.id }
}

async function setThreshold(paise: number | null) {
  await payload.updateGlobal({
    slug: 'settings',
    data: { money: { refundApprovalThresholdPaise: paise } },
  })
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await removeTestData()
  saved = await payload.findGlobal({ slug: 'settings', select: { money: true }, depth: 0 })
  service = await payload.create({
    collection: 'services',
    data: {
      name: `Fake service ${TAG}`,
      type: 'info',
      slug: `int-flow-${Date.now()}`,
      register: 'education',
      format: 'online',
    } as Service,
  })
  person = await payload.create({
    collection: 'people',
    data: { fullName: `Fake Person ${TAG}` } as Person,
  })
})

afterAll(async () => {
  await payload.updateGlobal({ slug: 'settings', data: { money: saved.money ?? {} } })
  await removeTestData()
})

describe('the refund a client’s cancellation asks for', () => {
  it('waits for an owner while no threshold is set, and is asked for once per payment', async () => {
    await setThreshold(null)
    const { booking } = await paidBooking()
    const req = await fresh()
    const first = await requestClientRefund(req, { booking, amountPaise: 50_000 })
    expect(first.awaitingOwner).toBe(true)
    expect(first.toSend).toEqual([])
    const [refund] = await Promise.all(
      first.refundIds.map((id) => payload.findByID({ collection: 'refunds', id, depth: 0 })),
    )
    expect(refund?.status).toBe('awaitingApproval')
    expect(refund?.reason).toBe('cancelledByClient')
    expect(refund?.requestedBy ?? null).toBeNull()
    const again = await requestClientRefund(await fresh(), { booking, amountPaise: 50_000 })
    expect(again.refundIds).toEqual(first.refundIds)
    expect(again.toSend).toEqual([])
  })

  it('is approved at once within the threshold, ready to send', async () => {
    await setThreshold(100_000)
    const { booking } = await paidBooking()
    const answer = await requestClientRefund(await fresh(), { booking, amountPaise: 25_000 })
    expect(answer.awaitingOwner).toBe(false)
    expect(answer.toSend).toHaveLength(1)
    const refund = await payload.findByID({
      collection: 'refunds',
      id: answer.toSend[0] as number,
      depth: 0,
    })
    expect(refund.status).toBe('approved')
    expect(refund.amountPaise).toBe(25_000)
  })

  it('never asks for more than the payment can give back, nor for less than ₹1', async () => {
    await setThreshold(1_000_000)
    const { booking } = await paidBooking()
    const capped = await requestClientRefund(await fresh(), { booking, amountPaise: 90_000 })
    const refund = await payload.findByID({
      collection: 'refunds',
      id: capped.refundIds[0] as number,
      depth: 0,
    })
    expect(refund.amountPaise).toBe(50_000)
    const tiny = await paidBooking()
    expect(
      (await requestClientRefund(await fresh(), { booking: tiny.booking, amountPaise: 99 }))
        .refundIds,
    ).toEqual([])
  })
})

describe('a place at an info session', () => {
  it('is confirmed at once and free, never past the capacity, and booked once per checkout', async () => {
    const event = await payload.create({
      collection: 'events',
      data: {
        title: `Fake info session ${TAG}`,
        kind: 'infoSession',
        service: service.id,
        startsAt: new Date(Date.UTC(2099, 2, 3, 6, 30)).toISOString(),
        endsAt: new Date(Date.UTC(2099, 2, 3, 7, 30)).toISOString(),
        format: 'online',
        capacity: 1,
        active: true,
      } as never,
    })
    const now = new Date()
    const first = await bookInfoSession(await fresh(), {
      eventId: event.id,
      checkoutKey: 'int-flow-checkout-key-0001',
      personId: person.id,
      consents: [],
      now,
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.value.booking.status).toBe('confirmed')
    expect(first.value.manageToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const stored = await payload.findByID({
      collection: 'bookings',
      id: first.value.booking.id,
      depth: 0,
    })
    expect(stored.paymentStatus).toBe('notRequired')
    expect(stored.practitioner ?? null).toBeNull()

    const again = await bookInfoSession(await fresh(), {
      eventId: event.id,
      checkoutKey: 'int-flow-checkout-key-0001',
      personId: person.id,
      consents: [],
      now,
    })
    expect(again.ok && again.value.booking.id).toBe(first.value.booking.id)

    const full = await bookInfoSession(await fresh(), {
      eventId: event.id,
      checkoutKey: 'int-flow-checkout-key-0002',
      personId: person.id,
      consents: [],
      now,
    })
    expect(full).toEqual({ ok: false, error: { code: 'full' } })
  })
})
