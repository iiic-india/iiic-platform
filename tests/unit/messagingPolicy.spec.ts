// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { reminder24hAt, reminderShortAt } from '@/lib/automations/timing'
import { FakeEmailSender, FakeWhatsAppSender } from '@/lib/messaging/fakes'
import { messageKey } from '@/lib/messaging/operations'
import {
  decideSend,
  plannedSendTime,
  queueTiming,
  quietHoursEnd,
  type SendContext,
} from '@/lib/messaging/policy'
import { senderFor } from '@/lib/messaging/senders'
import { canMove, MAX_ATTEMPTS, nextAttemptAt } from '@/lib/messaging/states'
import { isStopRequest, parseResendEvent } from '@/lib/messaging/webhooks'

// The send-time rules of docs/06 and docs/13 (docs/19 §3, §11). Times are written in IST.
const ist = (iso: string) => new Date(`${iso}+05:30`)

const base: SendContext = {
  now: ist('2026-12-01T12:00:00'),
  channel: 'email',
  kind: 'transactional',
  hasAddress: true,
  suppressed: false,
  under18: false,
  automationEnabled: true,
  channelConfigured: true,
  templateApproved: true,
}

describe('decideSend', () => {
  it('sends a transactional email with no consent asked (docs/06: anyone who booked)', () => {
    expect(decideSend(base)).toEqual({ action: 'send' })
  })

  it('sends nothing for a paused automation', () => {
    expect(decideSend({ ...base, automationEnabled: false })).toEqual({
      action: 'skip',
      reason: 'paused',
    })
  })

  it('sends a promotional message only while its consent is in force, and never to a minor', () => {
    const promo = { ...base, kind: 'promotional' as const }
    expect(decideSend({ ...promo, consent: 'granted' })).toEqual({ action: 'send' })
    expect(decideSend({ ...promo, consent: 'withdrawn' })).toEqual({
      action: 'skip',
      reason: 'no-consent',
    })
    expect(decideSend({ ...promo, consent: 'none' }).action).toBe('skip')
    expect(decideSend({ ...promo, consent: 'granted', under18: true })).toEqual({
      action: 'skip',
      reason: 'under-18',
    })
  })

  it('never moves a promotional message to a channel the person did not consent to', () => {
    const decision = decideSend({
      ...base,
      kind: 'promotional',
      consent: 'granted',
      channel: 'whatsapp',
      suppressed: true,
      fallback: 'email',
    })
    expect(decision).toEqual({ action: 'skip', reason: 'suppressed' })
  })

  it('stops every send to a suppressed address, falling back where it may', () => {
    expect(decideSend({ ...base, suppressed: true })).toEqual({
      action: 'skip',
      reason: 'suppressed',
    })
    expect(
      decideSend({ ...base, channel: 'whatsapp', suppressed: true, fallback: 'email' }),
    ).toEqual({ action: 'fallback', channel: 'email', reason: 'suppressed' })
  })

  it('falls back to email when WhatsApp is not set up or the template is not approved', () => {
    const whatsapp = { ...base, channel: 'whatsapp' as const, fallback: 'email' as const }
    expect(decideSend({ ...whatsapp, channelConfigured: false })).toEqual({
      action: 'fallback',
      channel: 'email',
      reason: 'not-configured',
    })
    expect(decideSend({ ...whatsapp, templateApproved: false })).toEqual({
      action: 'fallback',
      channel: 'email',
      reason: 'template-not-approved',
    })
    expect(decideSend({ ...whatsapp, hasAddress: false }).action).toBe('fallback')
  })

  it('sends WhatsApp only inside an open window when the message needs one (V1)', () => {
    const whatsapp = { ...base, channel: 'whatsapp' as const, requiresOpenWindow: true }
    expect(decideSend({ ...whatsapp, windowOpen: false })).toEqual({
      action: 'skip',
      reason: 'window-closed',
    })
    expect(decideSend({ ...whatsapp, windowOpen: true })).toEqual({ action: 'send' })
  })

  it('defers WhatsApp in quiet hours to 08:00 IST, and leaves email alone', () => {
    const night = ist('2026-12-01T22:00:00')
    expect(decideSend({ ...base, channel: 'whatsapp', now: night })).toEqual({
      action: 'defer',
      until: ist('2026-12-02T08:00:00'),
      reason: 'quiet-hours',
    })
    expect(decideSend({ ...base, now: night })).toEqual({ action: 'send' })
  })

  it('drops a reminder that quiet hours would deliver after the session (docs/06 B6)', () => {
    const decision = decideSend({
      ...base,
      channel: 'whatsapp',
      now: ist('2026-12-01T23:00:00'),
      sendBefore: ist('2026-12-02T07:30:00'),
      fallback: 'email',
    })
    expect(decision).toEqual({ action: 'skip', reason: 'quiet-hours-late' })
  })

  it('sends nothing once its time has passed', () => {
    expect(decideSend({ ...base, sendBefore: ist('2026-12-01T11:59:00') })).toEqual({
      action: 'skip',
      reason: 'too-late',
    })
  })
})

describe('quiet hours', () => {
  it('ends at the next 08:00 IST, across midnight and within the morning', () => {
    expect(quietHoursEnd(ist('2026-12-01T21:00:00'))).toEqual(ist('2026-12-02T08:00:00'))
    expect(quietHoursEnd(ist('2026-12-02T03:17:42'))).toEqual(ist('2026-12-02T08:00:00'))
    expect(quietHoursEnd(ist('2026-12-02T07:59:59'))).toEqual(ist('2026-12-02T08:00:00'))
  })

  it('follows the window in the settings', () => {
    const quiet = { start: '22:30', end: '07:15' }
    expect(quietHoursEnd(ist('2026-12-01T23:00:00'), quiet)).toEqual(ist('2026-12-02T07:15:00'))
    expect(plannedSendTime(ist('2026-12-01T22:00:00'), 'whatsapp', quiet)).toEqual(
      ist('2026-12-01T22:00:00'),
    )
  })

  it('plans a reminder due at 22:00 IST for 08:00 on WhatsApp, at 22:00 by email', () => {
    const due = ist('2026-12-01T22:00:00')
    expect(plannedSendTime(due, 'whatsapp')).toEqual(ist('2026-12-02T08:00:00'))
    expect(plannedSendTime(due, 'email')).toEqual(due)
    expect(plannedSendTime(due, 'whatsapp', undefined, ist('2026-12-02T08:00:00'))).toBeNull()
  })

  it('leaves the quiet hours’ last word to send time: a reminder is never dropped when queued', () => {
    const due = ist('2026-12-01T22:00:00')
    const session = ist('2026-12-02T07:30:00')
    // Planned under the default window (to 08:00), which would deliver it after the session:
    // it is queued for its own time, not skipped.
    expect(
      queueTiming({ sendAt: due, sendBefore: session, channel: 'whatsapp' }, undefined),
    ).toEqual({ sendAt: due })
    // By then the office has narrowed the quiet hours to end at 07:00: it goes at 07:00.
    const narrowed = { start: '22:30', end: '07:00' }
    expect(
      decideSend({
        ...base,
        channel: 'whatsapp',
        now: ist('2026-12-01T23:00:00'),
        sendBefore: session,
        quietHours: narrowed,
      }),
    ).toEqual({ action: 'defer', until: ist('2026-12-02T07:00:00'), reason: 'quiet-hours' })
    // Under the window as planned, it is dropped then, at send time.
    expect(decideSend({ ...base, channel: 'whatsapp', now: due, sendBefore: session })).toEqual({
      action: 'skip',
      reason: 'quiet-hours-late',
    })
    // A message whose use has already passed is the one thing refused when it is queued.
    expect(
      queueTiming({ sendAt: session, sendBefore: session, channel: 'whatsapp' }, undefined),
    ).toEqual({ sendAt: session, skip: 'too-late' })
    // Still in time: moved to the window's end, and checked again when it is due.
    expect(queueTiming({ sendAt: due, channel: 'whatsapp' }, undefined)).toEqual({
      sendAt: ist('2026-12-02T08:00:00'),
    })
  })
})

describe('reminder times (docs/06 B5, B6)', () => {
  const startsAt = ist('2026-12-10T15:00:00')
  const now = ist('2026-12-01T10:00:00')

  it('reminds 24 hours before, unless booked less than 24 hours ahead', () => {
    const confirmedAt = now
    expect(reminder24hAt({ startsAt, confirmedAt, format: 'office', now })).toEqual(
      ist('2026-12-09T15:00:00'),
    )
    const late = ist('2026-12-09T18:00:00')
    expect(reminder24hAt({ startsAt, confirmedAt: late, format: 'office', now: late })).toBeNull()
  })

  it('reminds 2 hours before at the office and 30 minutes before online', () => {
    const input = { startsAt, confirmedAt: now, now }
    expect(reminderShortAt({ ...input, format: 'office' })).toEqual(ist('2026-12-10T13:00:00'))
    expect(reminderShortAt({ ...input, format: 'online' })).toEqual(ist('2026-12-10T14:30:00'))
  })
})

describe('message states and retries', () => {
  it('moves forward only, and lets staff queue a failed message again', () => {
    expect(canMove('queued', 'sending')).toBe(true)
    expect(canMove('sent', 'delivered')).toBe(true)
    expect(canMove('delivered', 'sent')).toBe(false)
    expect(canMove('cancelled', 'queued')).toBe(false)
    expect(canMove('failed', 'queued')).toBe(true)
    expect(canMove('bounced', 'queued')).toBe(false)
  })

  it('retries after 1 minute, 10 minutes and 1 hour, then stops (docs/06)', () => {
    const now = ist('2026-12-01T12:00:00')
    expect(nextAttemptAt(1, now)).toEqual(ist('2026-12-01T12:01:00'))
    expect(nextAttemptAt(2, now)).toEqual(ist('2026-12-01T12:10:00'))
    expect(nextAttemptAt(3, now)).toEqual(ist('2026-12-01T13:00:00'))
    expect(nextAttemptAt(MAX_ATTEMPTS, now)).toBeNull()
    expect(nextAttemptAt(0, now)).toBeNull()
  })

  it('keys a message by automation, subject, variant and channel', () => {
    const subject = { collection: 'bookings' as const, id: 42 }
    expect(messageKey({ automation: 'B5', subject, channel: 'whatsapp' })).toBe(
      'B5:bookings:42:whatsapp',
    )
    expect(messageKey({ automation: 'B13', subject, variant: 'reminder', channel: 'email' })).toBe(
      'B13:bookings:42:reminder:email',
    )
  })
})

describe('senders (docs/13 §1, §3)', () => {
  it('sends from the subdomains and takes replies at the role inboxes', () => {
    expect(senderFor('bookings', 'imagecatalysts.in', 'x@resend.dev')).toEqual({
      from: 'IIIC Bookings <bookings@notify.imagecatalysts.in>',
      replyTo: 'bookings@imagecatalysts.in',
      sendingDomain: 'notify.imagecatalysts.in',
    })
    expect(senderFor('journal', 'imagecatalysts.in', 'x@resend.dev')).toMatchObject({
      from: 'IIIC Journal <journal@news.imagecatalysts.in>',
      replyTo: 'hello@imagecatalysts.in',
    })
    expect(senderFor('platform', 'imagecatalysts.in', 'x@resend.dev').replyTo).toBeUndefined()
  })

  it('falls back to the one development address without a mail domain', () => {
    expect(senderFor('hello', undefined, 'onboarding@resend.dev')).toEqual({
      from: 'IIIC <onboarding@resend.dev>',
      sendingDomain: 'resend.dev',
    })
  })
})

describe('provider webhooks (docs/19 §4)', () => {
  it('reads a permanent bounce, a complaint and a delivery; ignores the rest', () => {
    const bounce = parseResendEvent({
      type: 'email.bounced',
      created_at: '2026-12-01T06:30:00.000Z',
      data: { email_id: 'em_1', to: ['someone@example.com'], bounce: { type: 'Permanent' } },
    })
    expect(bounce).toEqual({
      ok: true,
      value: {
        kind: 'report',
        report: {
          provider: 'resend',
          providerMessageId: 'em_1',
          status: 'bounced',
          at: new Date('2026-12-01T06:30:00.000Z'),
          bounce: 'permanent',
          address: 'someone@example.com',
        },
      },
    })
    const complaint = parseResendEvent({ type: 'email.complained', data: { email_id: 'em_2' } })
    expect(complaint.ok && complaint.value.kind === 'report' && complaint.value.report.status).toBe(
      'complained',
    )
    expect(parseResendEvent({ type: 'email.opened', data: { email_id: 'em_3' } })).toEqual({
      ok: true,
      value: { kind: 'ignored', type: 'email.opened' },
    })
    expect(parseResendEvent({ nope: true })).toEqual({ ok: false, error: { code: 'unreadable' } })
  })

  it('honours a plain STOP at once, and leaves other words to a person', () => {
    expect(isStopRequest('STOP')).toBe(true)
    expect(isStopRequest('  Unsubscribe. ')).toBe(true)
    expect(isStopRequest('please stop the reminders for tomorrow')).toBe(false)
    expect(isStopRequest('Can we stop at 4?')).toBe(false)
  })
})

describe('fake senders', () => {
  it('send once per idempotency key and fail when told to', async () => {
    const email = new FakeEmailSender()
    const message = {
      from: 'IIIC <hello@notify.example>',
      to: 'fake@example.invalid',
      subject: 'Fake',
      html: '<p>Fake</p>',
      text: 'Fake',
      idempotencyKey: 'B2:bookings:1:email',
      tags: [],
    }
    const first = await email.send(message)
    const second = await email.send(message)
    expect(first).toEqual(second)
    expect(email.sent).toHaveLength(1)

    const whatsapp = new FakeWhatsAppSender()
    whatsapp.failNext('unavailable')
    const failed = await whatsapp.sendTemplate({
      to: '+910000000000',
      templateName: 'fake',
      language: 'en',
      params: [],
      idempotencyKey: 'k',
    })
    expect(failed).toEqual({ ok: false, error: { code: 'unavailable', retryable: true } })
  })
})
