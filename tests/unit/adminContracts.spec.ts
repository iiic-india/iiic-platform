// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { calendarQuery, REPORT_FIGURES, searchQuery } from '@/lib/adminViews/contract'
import { issueInput, revokeInput } from '@/lib/certificates/contract'
import {
  CERTIFICATE_ID_PATTERN,
  formatCertificateId,
  luhnDigit,
  parseCertificateId,
  typedCertificateId,
  verifyToken,
} from '@/lib/certificates/ids'
import { CERTIFICATE_STATEMENT } from '@/lib/certificates/statement'
import { parseEnv } from '@/lib/env'
import { writeNoteInput } from '@/lib/notes/contract'
import { BOARD_REPORT_WITHIN_HOURS, CERT_IN_WITHIN_HOURS } from '@/lib/privacy/breaches'
import {
  ACKNOWLEDGE_WITHIN_HOURS,
  COMPLAINT_TYPES,
  recordRequestInput,
  REQUEST_TYPES,
  RESOLVE_WITHIN,
} from '@/lib/privacy/requests'

const BASE = {
  PAYLOAD_SECRET: 'x'.repeat(32),
  DATABASE_URL: 'postgres://localhost/iiic',
}

/** 32 bytes of 0x01 and of 0x02, in base64 (fake keys for the test only). */
const KEY_A = Buffer.alloc(32, 1).toString('base64')
const KEY_B = Buffer.alloc(32, 2).toString('base64url')

describe('the notes key (src/lib/env.ts; docs/18 §3)', () => {
  it('is optional: the app builds and runs without it', () => {
    expect(parseEnv(BASE).NOTES_ENCRYPTION_KEY).toBeUndefined()
    expect(parseEnv({ ...BASE, NOTES_ENCRYPTION_KEY: '' }).NOTES_ENCRYPTION_KEY).toBeUndefined()
  })

  it('takes 32 bytes in base64 or base64url', () => {
    expect(parseEnv({ ...BASE, NOTES_ENCRYPTION_KEY: KEY_A }).NOTES_ENCRYPTION_KEY).toBe(KEY_A)
    expect(parseEnv({ ...BASE, NOTES_ENCRYPTION_KEY: KEY_B }).NOTES_ENCRYPTION_KEY).toBe(KEY_B)
  })

  it('refuses a key of another length or a passphrase', () => {
    const short = Buffer.alloc(16, 1).toString('base64')
    expect(() => parseEnv({ ...BASE, NOTES_ENCRYPTION_KEY: short })).toThrow(/NOTES_ENCRYPTION_KEY/)
    expect(() =>
      parseEnv({ ...BASE, NOTES_ENCRYPTION_KEY: 'correct horse battery staple, all of it!!!!' }),
    ).toThrow(/NOTES_ENCRYPTION_KEY/)
  })

  it('takes the previous key only beside a different current one', () => {
    expect(() => parseEnv({ ...BASE, NOTES_ENCRYPTION_KEY_PREVIOUS: KEY_A })).toThrow(
      /only beside a new NOTES_ENCRYPTION_KEY/,
    )
    expect(() =>
      parseEnv({
        ...BASE,
        NOTES_ENCRYPTION_KEY: KEY_A,
        NOTES_ENCRYPTION_KEY_PREVIOUS: Buffer.alloc(32, 1).toString('base64url'),
      }),
    ).toThrow(/must differ/)
    const rotating = parseEnv({
      ...BASE,
      NOTES_ENCRYPTION_KEY: KEY_B,
      NOTES_ENCRYPTION_KEY_PREVIOUS: KEY_A,
    })
    expect(rotating.NOTES_ENCRYPTION_KEY_PREVIOUS).toBe(KEY_A)
  })
})

describe('certificate IDs and tokens (docs/04 `certificates`; docs/18 §4)', () => {
  it('computes the Luhn digit as ISO/IEC 7812 does', () => {
    // The standard's worked example: 7992739871 carries the check digit 3.
    expect(luhnDigit('7992739871')).toBe(3)
    expect(() => luhnDigit('12a')).toThrow(RangeError)
  })

  it('formats an ID with the year, a four-digit number and the check digit', () => {
    expect(formatCertificateId(2027, 1)).toBe('IIIC-C-2027-0001-9')
    expect(formatCertificateId(2027, 12345)).toMatch(CERTIFICATE_ID_PATTERN)
    expect(() => formatCertificateId(2027, 0)).toThrow(RangeError)
    expect(() => formatCertificateId(27, 1)).toThrow(RangeError)
  })

  it('reads back what it formats and refuses a mistyped digit', () => {
    for (const sequence of [1, 9, 10, 999, 1000, 54321]) {
      const id = formatCertificateId(2026, sequence)
      expect(parseCertificateId(id)).toEqual({ year: 2026, sequence })
      const wrong = id.replace(/-(\d)$/, (_, digit: string) => `-${(Number(digit) + 1) % 10}`)
      expect(parseCertificateId(wrong)).toBeNull()
    }
    expect(parseCertificateId('IIIC-C-2026-1-0')).toBeNull()
  })

  it('accepts a typed ID in any case and with stray spaces', () => {
    expect(typedCertificateId.parse(' iiic-c-2027-0001-9 ')).toBe('IIIC-C-2027-0001-9')
    expect(typedCertificateId.safeParse('IIIC-C-2027-0001-8').success).toBe(false)
    expect(typedCertificateId.safeParse('<script>').success).toBe(false)
  })

  it('takes a token of 22 base64url characters only', () => {
    expect(verifyToken.safeParse(Buffer.alloc(16, 7).toString('base64url')).success).toBe(true)
    expect(verifyToken.safeParse('short').success).toBe(false)
    expect(verifyToken.safeParse('a'.repeat(21) + '/').success).toBe(false)
  })

  it('validates an issue and a revocation at the boundary', () => {
    const issue = {
      programmeName: 'Example programme',
      completedOn: '2027-01-31',
      recipients: [{ personId: 1, nameAsPrinted: 'Example Learner' }],
    }
    expect(issueInput.safeParse(issue).success).toBe(true)
    expect(issueInput.safeParse({ ...issue, completedOn: '2027-02-31' }).success).toBe(false)
    expect(issueInput.safeParse({ ...issue, recipients: [] }).success).toBe(false)
    expect(revokeInput.safeParse({ certificateId: 1, reason: '' }).success).toBe(false)
  })

  it('keeps the certificate statement free of degree, diploma and recognition claims', () => {
    const text = CERTIFICATE_STATEMENT.join(' ')
    expect(text).toMatch(/^Certificate of Completion\./)
    expect(text).toContain('Not a degree or diploma')
    expect(text).not.toMatch(/\baccredited\b/i)
  })
})

describe('privacy clocks (docs/05, docs/08; docs/18 §5)', () => {
  it('acknowledges every kind within 48 hours', () => {
    expect(ACKNOWLEDGE_WITHIN_HOURS).toBe(48)
  })

  it('gives complaints a month and data requests the 30 days IIIC publishes', () => {
    for (const { value } of REQUEST_TYPES) {
      expect(RESOLVE_WITHIN[value]).toEqual(
        COMPLAINT_TYPES.includes(value) ? { months: 1 } : { days: 30 },
      )
    }
  })

  it('reports to CERT-In within 6 hours and the Board within 72', () => {
    expect(CERT_IN_WITHIN_HOURS).toBe(6)
    expect(BOARD_REPORT_WITHIN_HOURS).toBe(72)
  })

  it('validates a recorded request', () => {
    const request = {
      personId: 3,
      type: 'erasure',
      channel: 'email',
      receivedAt: '2027-01-05T10:00:00+05:30',
      summary: 'Asks for their record to be erased.',
    }
    expect(recordRequestInput.safeParse(request).success).toBe(true)
    expect(recordRequestInput.safeParse({ ...request, type: 'other' }).success).toBe(false)
    expect(recordRequestInput.safeParse({ ...request, summary: '  ' }).success).toBe(false)
  })
})

describe('notes and views at the boundary', () => {
  it('takes a note of 1 to 20,000 characters on a booking', () => {
    expect(writeNoteInput.safeParse({ bookingId: 4, body: 'A note.' }).success).toBe(true)
    expect(writeNoteInput.safeParse({ bookingId: 4, body: '   ' }).success).toBe(false)
    expect(writeNoteInput.safeParse({ bookingId: 4, body: 'x'.repeat(20_001) }).success).toBe(false)
    expect(writeNoteInput.safeParse({ bookingId: -1, body: 'A note.' }).success).toBe(false)
  })

  it('reads the calendar query from the address', () => {
    expect(calendarQuery.parse({ day: '2027-01-04', practitionerId: '3' })).toEqual({
      view: 'week',
      day: '2027-01-04',
      practitionerId: 3,
    })
    expect(calendarQuery.safeParse({ view: 'month', day: '2027-01-04' }).success).toBe(false)
  })

  it('searches with two characters or more', () => {
    expect(searchQuery.safeParse({ q: 'a' }).success).toBe(false)
    expect(searchQuery.safeParse({ q: ' ab ' }).success).toBe(true)
  })

  it('names what each report waits on instead of drawing zero', () => {
    expect(REPORT_FIGURES.leadResponseTime).toMatch(/^M4/)
    expect(REPORT_FIGURES.mapCompletion).toMatch(/^R2/)
    expect(REPORT_FIGURES.noShowRate).toBeNull()
  })
})
