import { describe, expect, it } from 'vitest'

import { VERIFY_TOKEN_PATTERN, verifyToken } from '@/lib/certificates/ids'
import {
  hashVerifyToken,
  newVerifyToken,
  sha256Hex,
  VERIFY_PATH,
  verifyUrl,
} from '@/lib/certificates/token'

// The verify token (docs/18 §4): 128 random bits in base64url, only its SHA-256 stored, and the
// link the QR code opens on the platform domain's fixed path.

describe('the verify token', () => {
  it('is 16 random bytes in base64url, which the verify page accepts', () => {
    const token = newVerifyToken()
    expect(token).toMatch(VERIFY_TOKEN_PATTERN)
    expect(verifyToken.safeParse(token).success).toBe(true)
    expect(newVerifyToken()).not.toBe(token)
  })

  it('refuses anything but 16 bytes', () => {
    expect(() => newVerifyToken(new Uint8Array(15))).toThrow(RangeError)
  })

  it('is stored only as its SHA-256, 64 hex characters, never the token itself', () => {
    const token = newVerifyToken(new Uint8Array(16).fill(7))
    const hash = hashVerifyToken(token)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(token)
    expect(hashVerifyToken(token)).toBe(hash)
    expect(hashVerifyToken(newVerifyToken(new Uint8Array(16).fill(8)))).not.toBe(hash)
  })

  it('opens /institute/verify/<token> on the site, whatever the trailing slash', () => {
    expect(VERIFY_PATH).toBe('/institute/verify')
    expect(verifyUrl('https://example.invalid/', 'AAAAAAAAAAAAAAAAAAAAAA')).toBe(
      'https://example.invalid/institute/verify/AAAAAAAAAAAAAAAAAAAAAA',
    )
  })

  it('hashes a file as hex SHA-256', () => {
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})
