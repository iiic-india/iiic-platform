// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { Users } from '@/collections/Users'
import {
  RESET_EMAIL_SUBJECT,
  RESET_REQUEST_INTERVAL_MS,
  resetEmailHtml,
} from '@/lib/auth/resetEmail'

describe('the staff password-reset email', () => {
  it('links to the admin reset page on this site, with the token', () => {
    const html = resetEmailHtml('https://iiic.example', 'abc123')
    expect(html).toContain('href="https://iiic.example/admin/reset/abc123"')
  })

  it('says what it is and what happens if someone else asked', () => {
    expect(RESET_EMAIL_SUBJECT).toBe('Reset your IIIC admin password')
    const html = resetEmailHtml('https://iiic.example', 'abc123')
    expect(html).toContain('one hour')
    expect(html).toContain('your password stays the same')
    expect(html).not.toContain('!')
  })

  it('goes to one account at most once in five minutes', () => {
    const auth = typeof Users.auth === 'object' ? Users.auth : null
    expect(RESET_REQUEST_INTERVAL_MS).toBe(5 * 60 * 1000)
    expect(auth?.forgotPassword?.minRequestInterval).toBe(RESET_REQUEST_INTERVAL_MS)
  })
})
