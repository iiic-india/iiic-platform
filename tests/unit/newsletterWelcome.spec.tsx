// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { newsletterWelcome } = await import('@/emails/other/newsletter')
const { renderEmail } = await import('@/emails/render')
const { SIGNUP_COPY } = await import('@/lib/newsletter/copy')

// The welcome (N2; docs/19 §8) promises what an issue holds, in the signup page's own words: a
// lead article and up to two short pieces, never a fixed "two items and one link".
describe('the newsletter welcome', () => {
  it('says what an issue holds as the signup page does', async () => {
    const email = newsletterWelcome.email
    if (!email) throw new Error('no welcome email')
    const mail = await renderEmail(email, { journalPath: '/journal' }, {
      siteUrl: 'https://example.invalid',
      assetUrl: 'https://example.invalid/email',
      priceAllowed: false,
      footer: {
        legalLine: 'Fake legal line',
        siteUrl: 'https://example.invalid',
        siteDisplay: 'example.invalid',
        unsubscribe: { href: 'https://example.invalid/u/fake', label: 'Unsubscribe' },
      },
    } as never)
    const text = mail.text.replace(/\s+/g, ' ')
    expect(text).toContain(SIGNUP_COPY.lead)
    expect(text).not.toMatch(/two short items|one link/)
  })
})
