// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { Frame, Paragraph } from '@/emails/components/Frame'
import { Button, CounsellingScope, Details } from '@/emails/components/parts'
import { renderEmail } from '@/emails/render'
import type { EmailTemplate } from '@/emails/types'
import { CRISIS_LINES, SCOPE_STATEMENT } from '@/lib/counselling/scope'

// The brand frame and its parts (docs/19 §7), rendered as builders' templates will be, with
// obviously fake data: the HTML keeps Outlook's ghost table, the plain text is always there, the
// counselling scope and crisis numbers come from the one place that holds them.
type Fake = { name: string }

const template: EmailTemplate<Fake> = {
  key: 'booking-confirmed',
  schema: z.object({ name: z.string() }),
  subject: () => 'Fake subject',
  preheader: () => 'Fake preheader',
  element: (data, context) => (
    <Frame
      preheader="Fake preheader"
      eyebrow="Fake eyebrow"
      heading={`Fake heading for ${data.name}`}
      assetUrl={context.assetUrl}
      footer={context.footer}
    >
      <Paragraph>Fake line.</Paragraph>
      <Details rows={[{ label: 'Reference', value: 'IIIC-S-00000', mono: true }]} />
      <Button href="https://example.invalid/b/fake">Fake button</Button>
      <CounsellingScope />
    </Frame>
  ),
}

const context = {
  siteUrl: 'https://example.invalid',
  assetUrl: 'https://example.invalid/email',
  priceAllowed: false,
  footer: {
    legalLine: 'Fake legal line',
    siteUrl: 'https://example.invalid',
    siteDisplay: 'example.invalid',
    preferences: { href: 'https://example.invalid/w/fake', label: 'Fake preferences' },
  },
}

describe('the email frame', () => {
  it('renders light-only HTML with the Outlook ghost table and a heading', async () => {
    const email = await renderEmail(template, { name: 'Fake Person' }, context)
    expect(email.subject).toBe('Fake subject')
    expect(email.html).toContain('lang="en-IN"')
    expect(email.html).toContain('content="light only"')
    expect(email.html).toContain('<!--[if mso]><table role="presentation" width="600"')
    expect(email.html).toContain('<![endif]-->')
    expect(email.html).not.toContain('data-mso-ghost')
    expect(email.html).toMatch(/<h1[^>]*>Fake heading for Fake Person<\/h1>/)
    expect(email.html).toContain('alt="IIIC"')
    expect(email.html).not.toContain('{{')
  })

  it('always has a plain-text part with the footer link and the scope statement', async () => {
    const email = await renderEmail(template, { name: 'Fake Person' }, context)
    expect(email.text).toContain('Fake heading for Fake Person')
    expect(email.text).toContain('Fake preferences')
    for (const line of SCOPE_STATEMENT) expect(email.text).toContain(line)
    for (const line of CRISIS_LINES) expect(email.text).toContain(line.numbers[0])
    expect(email.text).not.toContain('<')
  })
})
