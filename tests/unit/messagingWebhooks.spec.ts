// @vitest-environment node
import { Webhook } from 'svix'
import { describe, expect, it, vi } from 'vitest'

import type { ProviderReport } from '@/lib/messaging/operations'
import type { WhatsAppNotice } from '@/lib/messaging/webhooks'
import { ok } from '@/lib/result'

vi.mock('server-only', () => ({}))

const { handleResendWebhook, handleWhatsAppWebhook, parseWhatsAppBody, sameSecret } =
  await import('@/lib/messaging/inbound')
const { planFor } = await import('@/lib/messaging/report')

// The providers' webhooks (docs/19 §4, §11): a bad signature is refused before anything is read,
// a signed event is applied once per report, the WhatsApp secret is compared in constant time and
// a STOP is honoured. Obviously fake secrets, ids and numbers.
const SECRET = `whsec_${Buffer.from('fake-resend-webhook-secret-for-tests').toString('base64')}`
/** Locally and in CI there is no VERCEL_ENV. */
const LOCAL = undefined
const OTHER = `whsec_${Buffer.from('another-fake-secret-not-the-one').toString('base64')}`

function signed(body: unknown, secret = SECRET, at = new Date()) {
  const rawBody = JSON.stringify(body)
  const svixId = 'msg_fake_0001'
  const svixSignature = new Webhook(secret).sign(svixId, at, rawBody)
  return { rawBody, svixId, svixTimestamp: String(Math.floor(at.getTime() / 1000)), svixSignature }
}

const bounce = {
  type: 'email.bounced',
  created_at: '2099-01-01T05:00:00.000Z',
  data: {
    email_id: 'fake-email-id-1',
    to: ['Someone@Fake.Example.invalid'],
    bounce: { type: 'Permanent' },
  },
}

describe('the Resend webhook', () => {
  it('refuses a bad signature, a missing one and the wrong secret, applying nothing', async () => {
    const apply = vi.fn(async () => ok({ messageId: 1, moved: true }))
    const good = signed(bounce)
    const forged = { ...good, svixSignature: 'v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' }
    expect(
      (await handleResendWebhook(forged, { secret: SECRET, vercelEnv: LOCAL, apply })).status,
    ).toBe(401)
    const missing = { ...good, svixSignature: null }
    expect(
      (await handleResendWebhook(missing, { secret: SECRET, vercelEnv: LOCAL, apply })).status,
    ).toBe(401)
    const wrongKey = signed(bounce, OTHER)
    expect(
      (await handleResendWebhook(wrongKey, { secret: SECRET, vercelEnv: LOCAL, apply })).status,
    ).toBe(401)
    const tampered = { ...good, rawBody: good.rawBody.replace('Permanent', 'Transient') }
    expect(
      (await handleResendWebhook(tampered, { secret: SECRET, vercelEnv: LOCAL, apply })).status,
    ).toBe(401)
    expect(apply).not.toHaveBeenCalled()
  })

  it('refuses an old signature (a replay outside five minutes)', async () => {
    const apply = vi.fn(async () => ok({ messageId: 1, moved: true }))
    const old = signed(bounce, SECRET, new Date(Date.now() - 10 * 60_000))
    expect(
      (await handleResendWebhook(old, { secret: SECRET, vercelEnv: LOCAL, apply })).status,
    ).toBe(401)
    expect(apply).not.toHaveBeenCalled()
  })

  it('answers 503 without a secret and 413 for a body too large', async () => {
    const apply = vi.fn()
    expect(
      (await handleResendWebhook(signed(bounce), { secret: undefined, vercelEnv: LOCAL, apply }))
        .status,
    ).toBe(503)
    const large = { ...signed(bounce), rawBody: null }
    expect(
      (await handleResendWebhook(large, { secret: SECRET, vercelEnv: LOCAL, apply })).status,
    ).toBe(413)
    expect(apply).not.toHaveBeenCalled()
  })

  it('applies a signed permanent bounce with the address it tried, in small letters', async () => {
    const reports: ProviderReport[] = []
    const apply = vi.fn(async (report: ProviderReport) => {
      reports.push(report)
      return ok({ messageId: 7, moved: true })
    })
    const answer = await handleResendWebhook(signed(bounce), {
      secret: SECRET,
      vercelEnv: LOCAL,
      apply,
    })
    expect(answer).toEqual({ status: 200, body: { received: true, taken: true, matched: true } })
    expect(reports[0]).toMatchObject({
      provider: 'resend',
      providerMessageId: 'fake-email-id-1',
      status: 'bounced',
      bounce: 'permanent',
      address: 'someone@fake.example.invalid',
    })
  })

  it('takes nothing from types it does not act on, and 400s what it cannot read', async () => {
    const apply = vi.fn()
    const opened = signed({ type: 'email.opened', data: { email_id: 'x' } })
    expect(await handleResendWebhook(opened, { secret: SECRET, vercelEnv: LOCAL, apply })).toEqual({
      status: 200,
      body: { received: true, taken: false },
    })
    const unreadable = signed({ type: 'email.delivered', data: {} })
    expect(
      (await handleResendWebhook(unreadable, { secret: SECRET, vercelEnv: LOCAL, apply })).status,
    ).toBe(400)
    expect(apply).not.toHaveBeenCalled()
  })

  it('refuses a preview with 404 before anything is read, even when signed (shared database)', async () => {
    const apply = vi.fn(async () => ok({ messageId: 1, moved: true }))
    for (const vercelEnv of ['preview', 'development']) {
      const answer = await handleResendWebhook(signed(bounce), { secret: SECRET, vercelEnv, apply })
      expect(answer).toEqual({ status: 404, body: { received: false, error: 'not-production' } })
    }
    expect(apply).not.toHaveBeenCalled()
    const live = await handleResendWebhook(signed(bounce), {
      secret: SECRET,
      vercelEnv: 'production',
      apply,
    })
    expect(live.status).toBe(200)
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('answers 500 on a fault so Resend tries again, echoing nothing', async () => {
    const apply = vi.fn(async () => {
      throw new Error('database down: someone@fake.example.invalid')
    })
    const answer = await handleResendWebhook(signed(bounce), {
      secret: SECRET,
      vercelEnv: LOCAL,
      apply,
    })
    expect(answer.status).toBe(500)
    expect(JSON.stringify(answer.body)).not.toContain('fake.example')
  })
})

describe('a report moves a message forward only', () => {
  const base = { provider: 'resend', providerMessageId: 'x', at: new Date(0) } as const
  it('takes delivered and read from sent, never back', () => {
    expect(planFor({ ...base, status: 'delivered' })).toMatchObject({
      from: ['sent'],
      to: 'delivered',
    })
    expect(planFor({ ...base, status: 'read' }).from).toEqual(['sent', 'delivered'])
  })
  it('bounces on a permanent bounce, fails a transient one as soft-bounce', () => {
    expect(planFor({ ...base, status: 'bounced', bounce: 'permanent' }).to).toBe('bounced')
    const soft = planFor({ ...base, status: 'bounced', bounce: 'transient' })
    expect(soft).toMatchObject({ to: 'failed', fields: { lastError: 'soft-bounce' } })
  })
})

const WA_SECRET = 'fake-whatsapp-webhook-secret-0123456789abcdef'

function cloud(value: Record<string, unknown>) {
  return JSON.stringify({ entry: [{ changes: [{ value }] }] })
}

describe('the WhatsApp webhook', () => {
  const deps = () => ({
    secret: WA_SECRET,
    vercelEnv: LOCAL as string | undefined,
    now: () => new Date('2099-01-01T05:00:00.000Z'),
    apply: vi.fn(async () => ok({ messageId: 3, moved: true })),
    inbound: vi.fn(
      async (_notice: Extract<WhatsAppNotice, { kind: 'inbound' }>, _id: string) => {},
    ),
  })

  it('compares the secret in constant time and refuses a wrong or missing one', async () => {
    expect(sameSecret(WA_SECRET, WA_SECRET)).toBe(true)
    expect(sameSecret(`${WA_SECRET}x`, WA_SECRET)).toBe(false)
    expect(sameSecret(null, WA_SECRET)).toBe(false)
    const d = deps()
    const body = cloud({ statuses: [{ id: 'wamid.fake1', status: 'delivered' }] })
    expect((await handleWhatsAppWebhook({ rawBody: body, secretHeader: 'nope' }, d)).status).toBe(
      401,
    )
    expect((await handleWhatsAppWebhook({ rawBody: body, secretHeader: null }, d)).status).toBe(401)
    expect(d.apply).not.toHaveBeenCalled()
    expect(
      (
        await handleWhatsAppWebhook(
          { rawBody: body, secretHeader: WA_SECRET },
          { ...d, secret: undefined },
        )
      ).status,
    ).toBe(503)
  })

  it('applies a status and hands a STOP on as a stop from an E.164 number', async () => {
    const d = deps()
    const body = cloud({
      statuses: [{ id: 'wamid.fake1', status: 'read', timestamp: '4070908800' }],
      messages: [{ id: 'wamid.fake2', from: '919800000000', text: { body: ' Stop ' } }],
    })
    const answer = await handleWhatsAppWebhook({ rawBody: body, secretHeader: WA_SECRET }, d)
    expect(answer).toEqual({ status: 200, body: { received: true, taken: 2 } })
    expect(d.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'aisensy',
        providerMessageId: 'wamid.fake1',
        status: 'read',
      }),
    )
    expect(d.inbound).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'inbound', from: '+919800000000', stop: true }),
      'wamid.fake2',
    )
  })

  it('reads an ordinary message as no stop, and keeps none of its text', () => {
    const parsed = parseWhatsAppBody(
      JSON.parse(
        cloud({ messages: [{ id: 'w1', from: '+919800000000', text: { body: 'Stop by at 5?' } }] }),
      ),
      new Date(0),
    )
    expect(parsed?.notices).toEqual([
      { kind: 'inbound', from: '+919800000000', at: new Date(0), stop: false },
    ])
    expect(JSON.stringify(parsed)).not.toContain('Stop by')
  })

  it('refuses a preview with 404, applying no status and recording no STOP', async () => {
    const d = { ...deps(), vercelEnv: 'preview' }
    const body = cloud({
      statuses: [{ id: 'wamid.fake1', status: 'read' }],
      messages: [{ id: 'wamid.fake2', from: '919800000000', text: { body: 'STOP' } }],
    })
    const answer = await handleWhatsAppWebhook({ rawBody: body, secretHeader: WA_SECRET }, d)
    expect(answer).toEqual({ status: 404, body: { received: false, error: 'not-production' } })
    expect(d.apply).not.toHaveBeenCalled()
    expect(d.inbound).not.toHaveBeenCalled()
    const live = { ...deps(), vercelEnv: 'production' }
    expect(
      (await handleWhatsAppWebhook({ rawBody: body, secretHeader: WA_SECRET }, live)).status,
    ).toBe(200)
  })

  it('400s a body it cannot read', async () => {
    const d = deps()
    const bad = await handleWhatsAppWebhook({ rawBody: '{not json', secretHeader: WA_SECRET }, d)
    expect(bad.status).toBe(400)
    const wrong = await handleWhatsAppWebhook(
      { rawBody: '{"entry":5}', secretHeader: WA_SECRET },
      d,
    )
    expect(wrong.status).toBe(400)
  })
})
