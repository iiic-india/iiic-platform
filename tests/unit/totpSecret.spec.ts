// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  decryptTotpSecret,
  encryptTotpSecret,
  unknowableTotpSecret,
} from '@/lib/security/totpSecret'

// Obviously fake values.
const KEY = 'test-only-payload-secret-00000000000000'
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'

describe('TOTP secret at rest', () => {
  it('round-trips, and never stores the secret itself', () => {
    const stored = encryptTotpSecret(SECRET, KEY)
    expect(stored.startsWith('v1:')).toBe(true)
    expect(stored).not.toContain(SECRET)
    expect(decryptTotpSecret(stored, KEY)).toBe(SECRET)
  })

  it('uses a fresh IV each time', () => {
    expect(encryptTotpSecret(SECRET, KEY)).not.toBe(encryptTotpSecret(SECRET, KEY))
  })

  it('refuses another key, a changed byte or a value it did not write', () => {
    const stored = encryptTotpSecret(SECRET, KEY)
    expect(decryptTotpSecret(stored, `${KEY}-rotated`)).toBeNull()
    const raw = Buffer.from(stored.slice(3), 'base64')
    raw[raw.length - 1] = (raw[raw.length - 1] ?? 0) ^ 1
    expect(decryptTotpSecret(`v1:${raw.toString('base64')}`, KEY)).toBeNull()
    expect(decryptTotpSecret(SECRET, KEY)).toBeNull()
  })

  it('stands in for an unreadable secret with one nobody holds', () => {
    const first = unknowableTotpSecret()
    expect(first).toMatch(/^[A-Z2-7]{32}$/)
    expect(unknowableTotpSecret()).not.toBe(first)
  })
})
