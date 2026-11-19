// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  hashRecoveryCode,
  newRecoveryCode,
  normaliseRecoveryCode,
  RECOVERY_CODE_COUNT,
} from '@/lib/auth/recoveryCodes'

describe('recovery codes', () => {
  it('are twelve Crockford base32 characters in three groups of four', () => {
    for (let i = 0; i < 50; i++) {
      expect(newRecoveryCode()).toMatch(
        /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/,
      )
    }
  })

  it('do not repeat (60 random bits each)', () => {
    const codes = new Set(Array.from({ length: 1000 }, newRecoveryCode))
    expect(codes.size).toBe(1000)
  })

  it('come ten to a set', () => {
    expect(RECOVERY_CODE_COUNT).toBe(10)
  })

  it('match however they are typed: case, spaces, dashes and the letters mistaken for digits', () => {
    const code = '7K2M-9QXR-4T1W'
    for (const typed of ['7k2m-9qxr-4t1w', '7K2M 9QXR 4T1W', '7K2M9QXR4TIW', ' 7k2m9qxr4tlw ']) {
      expect(hashRecoveryCode(typed), typed).toBe(hashRecoveryCode(code))
    }
    expect(normaliseRecoveryCode('o0-iI-lL')).toBe('001111')
  })

  it('are stored as SHA-256 hashes, never as themselves', () => {
    const code = newRecoveryCode()
    const hash = hashRecoveryCode(code)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(normaliseRecoveryCode(code))
  })
})
