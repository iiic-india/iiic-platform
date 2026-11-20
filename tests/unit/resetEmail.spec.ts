// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { RESET_EMAIL_SUBJECT, resetEmailHtml } from '@/lib/auth/resetEmail'

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
})
