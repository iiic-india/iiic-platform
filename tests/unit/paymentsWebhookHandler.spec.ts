// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import { FakeGateway } from '@/lib/payments/fakeGateway'
import type { ProcessedEvent } from '@/lib/payments/webhook'
import { handleRazorpayWebhook, type WebhookDeps } from '@/lib/payments/webhookHandler'
import { ok } from '@/lib/result'

vi.mock('server-only', () => ({}))

// The webhook's answers (docs/16 §5; docs/08 §9): the signature on the raw body comes first and
// nothing is read or processed without it; each event is processed once; Razorpay retries
// anything but a 2xx, so a replay is 200 and a processing failure 500. Fake ids and secrets.

const SECRET = 'fake-webhook-secret-for-this-test'

function setup(outcome: ProcessedEvent['outcome'] = 'processed', refundsToSend: number[] = []) {
  const gateway = new FakeGateway(SECRET)
  gateway.orders.set('order_fake1', {
    orderId: 'order_fake1',
    amountPaise: 50_000,
    status: 'created',
  })
  const process = vi.fn(async () => ok<ProcessedEvent>({ outcome, refundsToSend }))
  const afterCommit = vi.fn(async () => {})
  const log = { info: vi.fn(), error: vi.fn() }
  const deps: WebhookDeps = { gateway: ok(gateway), process, afterCommit, log }
  return { gateway, deps, process, afterCommit, log }
}

describe('POST /api/webhooks/razorpay', () => {
  it('processes a signed event once and answers 200 with its outcome', async () => {
    const { gateway, deps, process } = setup()
    const sent = gateway.pay('order_fake1')
    const answer = await handleRazorpayWebhook(sent, deps)
    expect(answer).toEqual({ status: 200, body: { received: true, outcome: 'processed' } })
    expect(process).toHaveBeenCalledTimes(1)
    expect(process).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: sent.eventId,
        type: 'payment.captured',
        amountPaise: 50_000,
      }),
    )
  })

  it('refuses a missing or wrong signature before reading anything', async () => {
    const { gateway, deps, process } = setup()
    const sent = gateway.pay('order_fake1')
    const tampered = sent.rawBody.replace('50000', '100')
    for (const input of [
      { ...sent, signature: null },
      { ...sent, signature: '' },
      { ...sent, rawBody: tampered },
      {
        ...sent,
        signature: new FakeGateway('another-secret').webhook('payment.captured', {}).signature,
      },
    ]) {
      expect(await handleRazorpayWebhook(input, deps)).toEqual({
        status: 401,
        body: { received: false, error: 'bad-signature' },
      })
    }
    expect(process).not.toHaveBeenCalled()
  })

  it('answers a replay with 200 and changes nothing more', async () => {
    const { gateway, deps } = setup('replay')
    const answer = await handleRazorpayWebhook(gateway.pay('order_fake1'), deps)
    expect(answer).toEqual({ status: 200, body: { received: true, outcome: 'replay' } })
  })

  it('answers 500 when processing fails, so Razorpay sends it again, and logs no body', async () => {
    const { gateway, deps, log } = setup()
    const failing = {
      ...deps,
      process: vi.fn(async () => {
        throw new Error('database down: someone@example.invalid')
      }),
    }
    const answer = await handleRazorpayWebhook(gateway.pay('order_fake1'), failing)
    expect(answer).toEqual({ status: 500, body: { received: false, error: 'processing-failed' } })
    const logged = JSON.stringify(log.error.mock.calls)
    expect(logged).toContain('payment.captured')
    expect(logged).not.toContain('example.invalid')
    expect(logged).not.toContain('50000')
  })

  it('refuses a signed body it cannot read, or one with no event id', async () => {
    const { gateway, deps, process } = setup()
    const sent = gateway.webhook('payment.captured', { nothing: {} })
    expect((await handleRazorpayWebhook(sent, deps)).status).toBe(400)
    const good = gateway.pay('order_fake1')
    expect(await handleRazorpayWebhook({ ...good, eventId: null }, deps)).toEqual({
      status: 400,
      body: { received: false, error: 'bad-event-id' },
    })
    expect(process).not.toHaveBeenCalled()
  })

  it('acknowledges a signed event the platform does not take, without processing it', async () => {
    const { gateway, deps, process } = setup()
    const answer = await handleRazorpayWebhook(gateway.webhook('subscription.charged', {}), deps)
    expect(answer).toEqual({ status: 200, body: { received: true, outcome: 'ignored' } })
    expect(process).not.toHaveBeenCalled()
  })

  it('says payments are off when the gateway is not configured', async () => {
    const { gateway, deps } = setup()
    const answer = await handleRazorpayWebhook(gateway.pay('order_fake1'), {
      ...deps,
      gateway: { ok: false, error: { code: 'not-configured' } },
    })
    expect(answer).toEqual({
      status: 503,
      body: { received: false, error: 'payments-not-configured' },
    })
  })

  it('sends the refunds an event approved only after it committed, and still answers 200 if that fails', async () => {
    const { gateway, deps, afterCommit } = setup('flagged', [41])
    expect((await handleRazorpayWebhook(gateway.pay('order_fake1'), deps)).status).toBe(200)
    expect(afterCommit).toHaveBeenCalledWith([41])
    const failingSend = {
      ...deps,
      afterCommit: vi.fn(async () => Promise.reject(new Error('down'))),
    }
    expect((await handleRazorpayWebhook(gateway.pay('order_fake1'), failingSend)).status).toBe(200)
  })
})
