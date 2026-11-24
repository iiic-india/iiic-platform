// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { BOOKING_TEMPLATES } from '@/emails/booking'
import { BOOKING_COPY_STATUS, WHATSAPP_PARAMS, WHATSAPP_SCOPE_LINE } from '@/emails/booking/copy'
import type {
  CancelledData,
  ConfirmedData,
  ConsentReceiptData,
  FeedbackData,
  PaymentLinkData,
  ReceiptData,
  RefundData,
  RescheduledData,
  SessionData,
  SlotLostData,
  StaffChangeData,
  TimeRequestData,
} from '@/emails/booking/data'
import { priceAllowed, TEMPLATES, templateSpec, type TemplateKey } from '@/emails/registry'
import { renderEmail } from '@/emails/render'
import type { EmailContext, TemplateImplementation } from '@/emails/types'
import { PLACEHOLDER } from '@/lib/content/placeholders'
import { CRISIS_LINES, SCOPE_STATEMENT } from '@/lib/counselling/scope'
import { showsPrice } from '@/lib/messaging/guards'

// The booking templates (docs/19 §7, §11), rendered with obviously fake data: every key of the
// B-series has its email and WhatsApp parts, the counselling ones carry the scope and the crisis
// numbers and nothing else does, no price shows outside its rule, the WhatsApp variables match the
// texts submitted to Meta, and a missing link is a placeholder with its input id.

const STARTS = new Date('2030-01-04T09:30:00.000Z') // Friday, 4 January 2030, 3 PM IST
const ENDS = new Date('2030-01-04T10:15:00.000Z')

const session = (overrides: Partial<SessionData> = {}): SessionData => ({
  firstName: 'Testname',
  serviceName: 'Fake session',
  serviceType: 'session',
  reference: 'IIIC-S-00000',
  counselling: false,
  startsAt: STARTS,
  endsAt: ENDS,
  format: 'online',
  meetingUrl: 'https://meet.example.invalid/fake-link',
  ...overrides,
})

const paymentLink: PaymentLinkData = {
  firstName: 'Testname',
  serviceName: 'Fake session',
  reference: 'IIIC-S-00000',
  counselling: false,
  startsAt: STARTS,
  amountPaise: 150000,
  linkUrl: 'https://pay.example.invalid/fake',
  expiresAt: new Date('2030-01-03T12:30:00.000Z'),
}

/** One fake data set per key, valid for that template's schema. */
const FAKE: Record<keyof typeof BOOKING_COPY_STATUS, unknown> = {
  'booking-confirmed': { ...session(), paidPaise: 150000 } satisfies ConfirmedData,
  'booking-receipt': {
    firstName: 'Testname',
    reference: 'IIIC-S-00000',
    counselling: false,
    document: 'taxInvoice',
    number: 'FAKE-0001',
    issuedAt: STARTS,
    totalPaise: 150050,
  } satisfies ReceiptData,
  'consent-receipt': {
    firstName: 'Testname',
    serviceName: 'Fake session',
    reference: 'IIIC-S-00000',
    startsAt: STARTS,
    consents: [{ purpose: 'Fake purpose', version: 1, grantedAt: STARTS }],
  } satisfies ConsentReceiptData,
  'reminder-24h': session(),
  'reminder-short': session(),
  'booking-rescheduled': {
    ...session(),
    fromStartsAt: new Date('2030-01-02T09:30:00.000Z'),
  } satisfies RescheduledData,
  'booking-cancelled': { ...session(), by: 'iiic' } satisfies CancelledData,
  'refund-processed': {
    firstName: 'Testname',
    reference: 'IIIC-S-00000',
    counselling: false,
    amountPaise: 150000,
    processedAt: STARTS,
  } satisfies RefundData,
  'booking-change-staff': {
    change: 'rescheduled',
    bookingId: 1,
    reference: 'IIIC-S-00000',
    serviceName: 'Fake session',
    startsAt: STARTS,
    fromStartsAt: new Date('2030-01-02T09:30:00.000Z'),
    by: null,
  } satisfies StaffChangeData,
  'feedback-request': { ...session(), feedbackUrl: null } satisfies FeedbackData,
  'no-show': session(),
  'slot-lost': {
    firstName: 'Testname',
    serviceName: 'Fake session',
    serviceType: 'session',
    counselling: false,
    startsAt: STARTS,
    amountPaise: 150000,
  } satisfies SlotLostData,
  'time-request-received': {
    firstName: 'Testname',
    serviceName: 'Fake session',
    reference: 'IIIC-S-00000',
    counselling: false,
    preferredDays: ['2030-01-04', '2030-01-07'],
  } satisfies TimeRequestData,
  'payment-link': paymentLink,
  'payment-link-reminder': paymentLink,
}

const BOOKING_KEYS = TEMPLATES.filter((spec) => spec.builder === 'B').map(
  (spec) => spec.key,
) as (keyof typeof BOOKING_COPY_STATUS)[]

function contextFor(key: TemplateKey, pricesPublic = false): EmailContext {
  return {
    siteUrl: 'https://example.invalid',
    assetUrl: 'https://example.invalid/email',
    priceAllowed: priceAllowed(key, { pricesPublic }),
    footer: {
      legalLine: 'Fake legal line',
      siteUrl: 'https://example.invalid',
      siteDisplay: 'example.invalid',
      preferences: { href: 'https://example.invalid/w/fake', label: 'Fake preferences' },
    },
  }
}

const implementation = (key: TemplateKey) =>
  BOOKING_TEMPLATES[key] as unknown as TemplateImplementation<unknown> | undefined

async function render(key: TemplateKey, data: unknown, pricesPublic = false) {
  const email = implementation(key)?.email
  if (!email) throw new Error(`No email for ${key}`)
  const parsed = email.schema.parse(data)
  return renderEmail(email, parsed, contextFor(key, pricesPublic))
}

/** The rendered text without the scope statement, whose words are the only clinical ones. */
const withoutScope = (text: string) =>
  SCOPE_STATEMENT.reduce((rest, line) => rest.split(line).join(''), text)

describe('the booking templates', () => {
  it('cover every key of the B-series, each marked candidate until approved', () => {
    expect(new Set(BOOKING_KEYS)).toEqual(new Set(Object.keys(BOOKING_COPY_STATUS)))
    for (const key of BOOKING_KEYS) {
      expect(implementation(key), key).toBeDefined()
      expect(BOOKING_COPY_STATUS[key].status, key).toBe('candidate')
    }
  })

  it('have an email for every key that goes by email, and WhatsApp where submitted', () => {
    for (const key of BOOKING_KEYS) {
      const spec = templateSpec(key)
      const found = implementation(key)
      if (spec.channels.includes('email')) expect(found?.email, key).toBeDefined()
      // The feedback request's WhatsApp waits on M5's feedback link (docs/19 §10).
      if (spec.channels.includes('whatsapp') && key !== 'feedback-request') {
        expect(found?.whatsapp, key).toBeDefined()
      }
      if (!spec.channels.includes('whatsapp')) expect(found?.whatsapp, key).toBeUndefined()
    }
  })

  it('accept their fake data and render HTML with a plain-text part', async () => {
    for (const key of BOOKING_KEYS) {
      if (!implementation(key)?.email) continue
      const rendered = await render(key, FAKE[key])
      expect(rendered.subject.length, key).toBeGreaterThan(0)
      expect(rendered.html, key).toContain('<h1')
      expect(rendered.text, key).toContain('Fake legal line')
      expect(rendered.subject, key).not.toMatch(/!|urgent|hurry|last chance|only \d+ left/i)
    }
  })

  it('carry the scope and the crisis numbers on every counselling booking’s email, and only there', async () => {
    const carriesScope = (text: string, key: string) => {
      expect(text, key).toContain(SCOPE_STATEMENT[1])
      for (const line of CRISIS_LINES) expect(text, key).toContain(line.numbers[0])
    }
    for (const key of BOOKING_KEYS) {
      const data = FAKE[key] as Record<string, unknown>
      if (!implementation(key)?.email) continue
      if (!('counselling' in data)) {
        // The consent receipt is sent for counselling bookings only (B3a); the staff notice is
        // internal and names a reference only.
        const rendered = await render(key, data)
        if (key === 'consent-receipt') carriesScope(rendered.text, key)
        else expect(rendered.text, key).not.toContain(SCOPE_STATEMENT[1])
        continue
      }
      // Every email to the client about a counselling booking carries it, the time request and
      // the money messages included (docs/08 §7; VOICE.md, counselling copy).
      expect(templateSpec(key).counsellingScope, key).toBe(true)
      carriesScope((await render(key, { ...data, counselling: true })).text, key)
      const other = await render(key, { ...data, counselling: false })
      expect(other.text, key).not.toContain(SCOPE_STATEMENT[1])
    }
  })

  it('use no clinical word, no degree or diploma, no exclamation mark', async () => {
    for (const key of BOOKING_KEYS) {
      if (!implementation(key)?.email) continue
      const data = FAKE[key] as Record<string, unknown>
      const rendered = await render(
        key,
        'counselling' in data ? { ...data, counselling: true } : data,
      )
      const words = withoutScope(`${rendered.subject} ${rendered.preheader} ${rendered.text}`)
      expect(words, key).not.toMatch(
        /therap|psycholog|clinical|diagnos|treatment|degree|diploma|!/i,
      )
    }
  })

  it('show no price while prices are hidden, except on a payment link staff sent (D-21, D-24)', async () => {
    for (const key of BOOKING_KEYS) {
      if (!implementation(key)?.email) continue
      const rendered = await render(key, FAKE[key], false)
      const all = `${rendered.subject} ${rendered.preheader} ${rendered.text} ${rendered.html}`
      if (templateSpec(key).price === 'paymentLink') expect(all, key).toContain('₹')
      else expect(showsPrice(all), key).toBe(false)
    }
  })

  it('send the receipt, the refund and the slot-lost notice without their amount while prices are hidden', async () => {
    // What each still says without its amount, so it is sent rather than skipped for its price.
    const said = {
      'booking-receipt': 'It is for your payment for booking IIIC-S-00000.',
      'refund-processed': 'We have refunded your payment to the account you paid from.',
      'slot-lost': 'We are refunding your payment in full, to the account you paid from.',
    } as const
    for (const key of ['booking-receipt', 'refund-processed', 'slot-lost'] as const) {
      const hidden = await render(key, FAKE[key], false)
      const shown = await render(key, FAKE[key], true)
      const hiddenWords = `${hidden.subject} ${hidden.preheader} ${hidden.text} ${hidden.html}`
      expect(showsPrice(hiddenWords), key).toBe(false)
      expect(hidden.text, key).toContain(said[key])
      expect(`${shown.subject} ${shown.preheader} ${shown.text}`, key).toContain('₹')
    }
  })

  it('show what was paid on the confirmation only while prices are public (D-21)', async () => {
    const hidden = await render('booking-confirmed', FAKE['booking-confirmed'], false)
    const shown = await render('booking-confirmed', FAKE['booking-confirmed'], true)
    expect(hidden.text).not.toContain('₹1,500')
    expect(shown.text).toContain('₹1,500')
  })

  it('write the time in India, and the receipt’s total with its paise', async () => {
    const reminder = await render('reminder-24h', FAKE['reminder-24h'])
    expect(reminder.subject).toBe('Your Fake session on Friday, 4 January at 3 PM')
    const receipt = await render('booking-receipt', FAKE['booking-receipt'], true)
    expect(receipt.text).toContain('₹1,500.50')
  })

  it('give an online booking its link as the one button, and an office booking none', async () => {
    const online = await render('booking-confirmed', FAKE['booking-confirmed'])
    expect(online.html).toContain('https://meet.example.invalid/fake-link')
    const office = await render('booking-confirmed', {
      ...(FAKE['booking-confirmed'] as ConfirmedData),
      format: 'office',
      meetingUrl: null,
    })
    expect(office.html).not.toContain('meet.example.invalid')
    expect(office.text).toContain('Ahmedabad')
    const noLinkYet = await render('reminder-24h', session({ meetingUrl: null }))
    expect(noLinkYet.text).not.toContain('The link is below')
  })

  it('give a confirmation or a move the manage link as its one button when the message issued it', async () => {
    const manageUrl = `https://example.invalid/b/${'A'.repeat(43)}`
    for (const key of ['booking-confirmed', 'booking-rescheduled'] as const) {
      const fake = FAKE[key] as ConfirmedData | RescheduledData
      const managed = await render(key, { ...fake, manageUrl })
      expect(managed.html, key).toContain(`href="${manageUrl}"`)
      expect(managed.text, key).toContain('Manage your booking')
      expect(managed.text, key).not.toContain('Join the session')
      // The session's own link stays in the details.
      expect(managed.text, key).toContain('https://meet.example.invalid/fake-link')
      const plain = await render(key, fake)
      expect(plain.text, key).not.toContain('Manage your booking')
      expect(plain.text, key).toContain('Join the session')
    }
  })

  it('stand a placeholder with its input id where the feedback link is missing', async () => {
    const rendered = await render('feedback-request', FAKE['feedback-request'])
    expect([...rendered.text.matchAll(PLACEHOLDER)].map((match) => match[2])).toEqual(['I-17'])
    const linked = await render('feedback-request', {
      ...(FAKE['feedback-request'] as FeedbackData),
      feedbackUrl: 'https://example.invalid/feedback/fake',
    })
    expect(linked.text).not.toMatch(PLACEHOLDER)
    expect(linked.html).toContain('https://example.invalid/feedback/fake')
  })

  it('tell staff of a change by reference, with no client’s name', async () => {
    const rendered = await render('booking-change-staff', FAKE['booking-change-staff'])
    expect(rendered.text).toContain('IIIC-S-00000')
    expect(rendered.text).not.toContain('Testname')
    expect(rendered.html).toContain('/admin/collections/bookings/1')
  })
})

/** The submitted texts, by template key: each `## key · name` heading and its text block. */
function submittedTexts(): Map<string, string> {
  const doc = readFileSync(join(process.cwd(), 'docs/content/whatsapp-templates.md'), 'utf8')
  const texts = new Map<string, string>()
  for (const match of doc.matchAll(
    /^## ([a-z0-9-]+) · `[a-z0-9_]+`[\s\S]*?```text\n([\s\S]*?)```/gm,
  )) {
    texts.set(match[1] as string, match[2] as string)
  }
  return texts
}

const variableCount = (text: string) =>
  Math.max(0, ...[...text.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1])))

describe('the WhatsApp templates', () => {
  it('are the eight of docs/06, each submitted text with as many variables as the code sends', () => {
    const texts = submittedTexts()
    expect(texts.size).toBe(8)
    for (const [key, build] of Object.entries(WHATSAPP_PARAMS)) {
      const text = texts.get(key)
      expect(text, key).toBeDefined()
      const params = (build as (data: never) => string[])(FAKE[key as keyof typeof FAKE] as never)
      expect(params.length, key).toBe(variableCount(text as string))
    }
  })

  it('never send an empty variable or a line break, and start with the first name', () => {
    for (const [key, build] of Object.entries(WHATSAPP_PARAMS)) {
      const params = (build as (data: never) => string[])(FAKE[key as keyof typeof FAKE] as never)
      expect(params[0], key).toBe('Testname')
      for (const param of params) {
        expect(param.trim().length, key).toBeGreaterThan(0)
        expect(param, key).not.toMatch(/[\n\t]| {4}/)
      }
    }
  })

  it('carry the scope line for a counselling booking, and its reference for any', () => {
    const counselling = WHATSAPP_PARAMS['reminder-short'](session({ counselling: true }))
    expect(counselling.at(-1)).toBe(`Booking ID IIIC-S-00000. ${WHATSAPP_SCOPE_LINE}`)
    // The time request and the payment link too (docs/08 §7).
    const request = FAKE['time-request-received'] as TimeRequestData
    expect(WHATSAPP_PARAMS['time-request-received']({ ...request, counselling: true }).at(-1)).toBe(
      `Booking ID IIIC-S-00000. ${WHATSAPP_SCOPE_LINE}`,
    )
    expect(WHATSAPP_PARAMS['payment-link']({ ...paymentLink, counselling: true }).at(-1)).toBe(
      `Booking ID IIIC-S-00000. ${WHATSAPP_SCOPE_LINE}`,
    )
    expect(WHATSAPP_PARAMS['payment-link'](paymentLink).at(-1)).toBe('Booking ID IIIC-S-00000.')
    expect(WHATSAPP_SCOPE_LINE).toContain('Tele-MANAS 14416')
    const other = WHATSAPP_PARAMS['reminder-short'](session())
    expect(other.at(-1)).toBe('Booking ID IIIC-S-00000.')
    const doc = readFileSync(join(process.cwd(), 'docs/content/whatsapp-templates.md'), 'utf8')
    expect(doc).toContain(WHATSAPP_SCOPE_LINE)
  })

  it('send the link of an online booking, and the office for an office one', () => {
    expect(WHATSAPP_PARAMS['reminder-short'](session())[3]).toBe(
      'https://meet.example.invalid/fake-link',
    )
    const office = WHATSAPP_PARAMS['reminder-short'](
      session({ format: 'office', meetingUrl: null }),
    )
    expect(office[3]).toContain('Ahmedabad')
  })
})
