// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import { AiSensyWhatsAppSender, AISENSY_CONTACT_NAME, destinationOf } from '@/lib/messaging/aisensy'
import type { OutgoingEmail, OutgoingWhatsApp } from '@/lib/messaging/channels'
import { channelsFor, fakeChannels } from '@/lib/messaging/channelsFor'
import { ResendEmailSender, resendErrorCode } from '@/lib/messaging/resend'

vi.mock('server-only', () => ({}))

// The real senders against a fake `fetch` (docs/19 §3), and which senders a deployment gets.
// Fake keys and the reserved example domain only.

const EMAIL: OutgoingEmail = {
  from: 'IIIC Bookings <bookings@notify.example.test>',
  to: 'someone@example.test',
  replyTo: 'bookings@example.test',
  subject: 'A fake subject',
  html: '<p>fake</p>',
  text: 'fake',
  idempotencyKey: 'B2:bookings:1:email',
  tags: [
    { name: 'automation', value: 'B2' },
    { name: 'template', value: 'booking-confirmed' },
  ],
}

const WHATSAPP: OutgoingWhatsApp = {
  to: '+919800000001',
  templateName: 'fake_campaign',
  language: 'en',
  params: ['one', 'two'],
  idempotencyKey: 'B5:bookings:1:whatsapp',
}

const answer = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }))

describe('ResendEmailSender', () => {
  it('sends with the key as Idempotency-Key and returns the id', async () => {
    const fetcher = answer(200, { id: 'resend-fake-1' })
    const sender = new ResendEmailSender('re_fake_key', fetcher as unknown as typeof fetch)
    const result = await sender.send(EMAIL)
    expect(result).toEqual({ ok: true, value: { providerMessageId: 'resend-fake-1' } })
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers['Idempotency-Key']).toBe('B2:bookings:1:email')
    expect(headers.Authorization).toBe('Bearer re_fake_key')
    const body = JSON.parse(String(init.body))
    expect(body.to).toEqual(['someone@example.test'])
    expect(body.reply_to).toBe('bookings@example.test')
    expect(body.text).toBe('fake')
    expect(body.tags).toEqual([
      { name: 'automation', value: 'B2' },
      { name: 'template', value: 'booking-confirmed' },
    ])
  })

  it('maps refusals to codes, retrying only what may pass later', async () => {
    expect(resendErrorCode(429)).toBe('rate-limited')
    expect(resendErrorCode(503)).toBe('unavailable')
    expect(resendErrorCode(409, 'concurrent_idempotent_requests')).toBe('unavailable')
    expect(resendErrorCode(409, 'invalid_idempotent_request')).toBe('rejected')
    expect(resendErrorCode(422, 'validation_error')).toBe('invalid-recipient')
    expect(resendErrorCode(403)).toBe('rejected')
    const sender = new ResendEmailSender(
      're_fake_key',
      answer(429, { name: 'rate_limit_exceeded' }) as unknown as typeof fetch,
    )
    expect(await sender.send(EMAIL)).toEqual({
      ok: false,
      error: { code: 'rate-limited', retryable: true },
    })
  })

  it('treats a network failure as unavailable, to be retried under the same key', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('network down')
    })
    const sender = new ResendEmailSender('re_fake_key', fetcher as unknown as typeof fetch)
    expect(await sender.send(EMAIL)).toEqual({
      ok: false,
      error: { code: 'unavailable', retryable: true },
    })
  })
})

describe('AiSensyWhatsAppSender', () => {
  it('sends the campaign with the digits of the number and a neutral contact name', async () => {
    const fetcher = answer(200, { success: 'true', submitted_message_id: 'aisensy-fake-1' })
    const sender = new AiSensyWhatsAppSender('fake-aisensy-key', fetcher as unknown as typeof fetch)
    expect(await sender.sendTemplate(WHATSAPP)).toEqual({
      ok: true,
      value: { providerMessageId: 'aisensy-fake-1' },
    })
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({
      campaignName: 'fake_campaign',
      destination: '919800000001',
      userName: AISENSY_CONTACT_NAME,
      templateParams: ['one', 'two'],
    })
  })

  it('refuses a number that is not E.164 without calling AiSensy', async () => {
    const fetcher = answer(200, {})
    const sender = new AiSensyWhatsAppSender('fake-aisensy-key', fetcher as unknown as typeof fetch)
    expect(destinationOf('9800000001')).toBeNull()
    expect(await sender.sendTemplate({ ...WHATSAPP, to: '98000 00001' })).toEqual({
      ok: false,
      error: { code: 'invalid-recipient', retryable: false },
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('never retries a call whose answer did not come back (at most once)', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('timeout')
    })
    const sender = new AiSensyWhatsAppSender('fake-aisensy-key', fetcher as unknown as typeof fetch)
    expect(await sender.sendTemplate(WHATSAPP)).toEqual({
      ok: false,
      error: { code: 'unavailable', retryable: false },
    })
  })
})

describe('channelsFor', () => {
  const base = {
    MESSAGING_TRANSPORT: 'live' as const,
    VERCEL_ENV: undefined,
    RESEND_API_KEY: undefined,
    WHATSAPP_API_KEY: undefined,
  }

  it('gives the fakes for MESSAGING_TRANSPORT=fake, the same pair each time', () => {
    const channels = channelsFor({ ...base, MESSAGING_TRANSPORT: 'fake' })
    expect(channels.email).toBe(fakeChannels().email)
    expect(channels.whatsapp).toBe(fakeChannels().whatsapp)
    expect(channels.configured).toEqual({ email: true, whatsapp: true })
  })

  it('sends nothing from a preview, keys or not', async () => {
    const channels = channelsFor({
      ...base,
      VERCEL_ENV: 'preview',
      RESEND_API_KEY: 're_fake_key',
      WHATSAPP_API_KEY: 'fake-aisensy-key',
    })
    expect(channels.configured).toEqual({ email: false, whatsapp: false })
    expect(await channels.email.send(EMAIL)).toEqual({
      ok: false,
      error: { code: 'not-configured', retryable: false },
    })
  })

  it('sets up each channel whose keys are present', () => {
    expect(channelsFor({ ...base, VERCEL_ENV: 'production' }).configured).toEqual({
      email: false,
      whatsapp: false,
    })
    const email = channelsFor({ ...base, VERCEL_ENV: 'production', RESEND_API_KEY: 're_fake_key' })
    expect(email.configured).toEqual({ email: true, whatsapp: false })
    expect(email.email.provider).toBe('resend')
  })
})
