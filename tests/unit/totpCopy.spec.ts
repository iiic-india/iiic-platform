// @vitest-environment node
import type { Config } from 'payload'
import { payloadTotp } from 'payload-totp'
import { describe, expect, it } from 'vitest'

import { TOTP_OPTIONS } from '@/lib/auth/totp'
import { TOTP_COPY, totpCopy, TWO_FACTOR_COPY } from '@/plugins/totpCopy'

describe('totpCopy', () => {
  it("replaces payload-totp's English strings when listed after it, and keeps other languages", () => {
    const withPlugin = payloadTotp(TOTP_OPTIONS)({
      collections: [{ slug: 'users', auth: true, fields: [] }],
    } as unknown as Config) as Config
    const translations = (totpCopy()(withPlugin).i18n?.translations ?? {}) as Record<
      string,
      { totpPlugin?: unknown }
    >
    expect(translations.en?.totpPlugin).toEqual(TOTP_COPY)
    const errors = (translations.en as { error?: { userLocked?: string } }).error
    expect(errors?.userLocked).toBe(TWO_FACTOR_COPY.locked)
    expect(translations.de?.totpPlugin).toBeTruthy()
  })

  it('writes in sentence case, without exclamation marks or the word "Setup" as a verb', () => {
    const strings = JSON.stringify(TOTP_COPY)
    expect(strings).not.toMatch(/!|Setup /)
    expect(TOTP_COPY.setup.title).toBe('Set up two-factor sign-in')
  })
})
