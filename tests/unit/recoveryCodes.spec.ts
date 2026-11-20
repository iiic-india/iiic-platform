// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  hashRecoveryCode,
  matchesRecoveryCode,
  newRecoveryCode,
  RECOVERY_CODE_COUNT,
} from '@/lib/auth/recoveryCodes'
import { isRecoveryCodeShape, normaliseRecoveryCode } from '@/lib/auth/recoveryCodeShape'

const GROUP = '[0-9A-HJKMNP-TV-Z]{4}'

describe('recovery codes', () => {
  it('are sixteen Crockford base32 characters in four groups of four', () => {
    for (let i = 0; i < 50; i++) {
      expect(newRecoveryCode()).toMatch(new RegExp(`^${GROUP}-${GROUP}-${GROUP}-${GROUP}$`))
    }
  })

  it('do not repeat (80 random bits each)', () => {
    const codes = new Set(Array.from({ length: 1000 }, newRecoveryCode))
    expect(codes.size).toBe(1000)
  })

  it('come ten to a set', () => {
    expect(RECOVERY_CODE_COUNT).toBe(10)
  })

  it('match however they are typed: case, spaces, dashes and the letters mistaken for digits', async () => {
    const stored = await hashRecoveryCode('7K2M-9QXR-4T1W-0B3N')
    for (const typed of [
      '7k2m-9qxr-4t1w-0b3n',
      '7K2M 9QXR 4T1W 0B3N',
      '7K2M9QXR4TIW0B3N',
      ' 7k2m9qxr4tlwob3n ',
    ]) {
      expect(await matchesRecoveryCode(typed, stored), typed).toBe(true)
    }
    expect(await matchesRecoveryCode('7K2M-9QXR-4T1W-0B3P', stored)).toBe(false)
    expect(normaliseRecoveryCode('o0-iI-lL')).toBe('001111')
  })

  it('are stored salted and slow to test, never as themselves', async () => {
    const code = newRecoveryCode()
    const first = await hashRecoveryCode(code)
    const second = await hashRecoveryCode(code)
    expect(first).toMatch(/^pbkdf2-sha256\$100000\$[\w-]{22}\$[\w-]{43}$/)
    expect(first).not.toBe(second)
    expect(first).not.toContain(normaliseRecoveryCode(code))
  })

  it('never match a stored value in any other form', async () => {
    const code = newRecoveryCode()
    const [, , salt, hash] = (await hashRecoveryCode(code)).split('$')
    for (const stored of [
      '',
      'a'.repeat(64),
      `sha256$100000$${salt}$${hash}`,
      `pbkdf2-sha256$0$${salt}$${hash}`,
      `pbkdf2-sha256$99999999$${salt}$${hash}`,
      `pbkdf2-sha256$100000$${salt}$`,
      `pbkdf2-sha256$100000$${salt}$${hash?.slice(2)}`,
    ]) {
      expect(await matchesRecoveryCode(code, stored), stored).toBe(false)
    }
  })

  it('are recognised by shape before anything is sent', () => {
    expect(isRecoveryCodeShape('7k2m 9qxr 4tlw ob3n')).toBe(true)
    for (const typed of ['', '7K2M-9QXR-4T1W', '7K2M-9QXR-4T1W-0B3N-AAAA', '7K2M-9QXR-4T1W-0B3U']) {
      expect(isRecoveryCodeShape(typed), typed).toBe(false)
    }
  })
})
