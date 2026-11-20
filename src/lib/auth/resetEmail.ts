/**
 * The staff password-reset email, in IIIC's words (src/brand/VOICE.md: the subject says what the
 * message is; one message, one action). Payload's reset link expires after one hour.
 */
export const RESET_EMAIL_SUBJECT = 'Reset your IIIC admin password'

export function resetEmailHtml(siteUrl: string, token: string): string {
  const link = `${siteUrl}/admin/reset/${encodeURIComponent(token)}`
  return [
    '<p>Someone asked to reset the password for this IIIC admin account.</p>',
    `<p><a href="${link}">Set a new password</a></p>`,
    '<p>The link works for one hour. If you did not ask for this, ignore this email: your password stays the same.</p>',
  ].join('\n')
}
