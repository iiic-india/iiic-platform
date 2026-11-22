// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { formatPhone, PHONE_MESSAGE, phoneField, toE164, validatePhone } from '@/lib/phone'

// Phone numbers in E.164 (CLAUDE.md #8), read with libphonenumber-js. The numbers are IIIC's
// published one (D-31), libphonenumber's own example mobile and a US example number.

const options = { req: { t: (key: string) => key, payload: { config: {} } } } as never

describe('a phone number', () => {
  it('is stored in E.164, a number typed without a country code read as Indian', () => {
    expect(toE164('96240 46464')).toBe('+919624046464')
    expect(toE164('+91 96240 46464')).toBe('+919624046464')
    expect(toE164('+91-81234-56789')).toBe('+918123456789')
    expect(toE164('+1 201 555 0123')).toBe('+12015550123')
  })

  it('is refused when it is not a number its country uses', () => {
    for (const bad of ['12345', '+91 12345', 'call me', '', '+91 00000 00000']) {
      expect(toE164(bad), bad).toBeNull()
    }
  })

  it('is printed as a person reads it', () => {
    expect(formatPhone('+919624046464')).toBe('+91 96240 46464')
    expect(formatPhone('not a number')).toBe('not a number')
  })
})

describe('a phone field', () => {
  it('accepts a number typed with spaces, and nothing that is not a number', async () => {
    expect(await validatePhone('96240 46464', options)).toBe(true)
    expect(await validatePhone('', options)).toBe(true)
    expect(await validatePhone(null as never, options)).toBe(true)
    expect(await validatePhone('12345', options)).toBe(PHONE_MESSAGE)
  })

  it('stores what it accepts in E.164, and nothing for an empty field', () => {
    const field = phoneField('phone')
    const normalise = field.hooks?.beforeValidate?.[0] as (args: { value: unknown }) => unknown
    expect(normalise({ value: ' 96240 46464 ' })).toBe('+919624046464')
    expect(normalise({ value: '   ' })).toBeNull()
    // Left as typed, so the field's check can say what is wrong with it.
    expect(normalise({ value: '12345' })).toBe('12345')
    expect(normalise({ value: undefined })).toBeUndefined()
  })
})
