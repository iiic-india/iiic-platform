import { render } from '@react-email/render'

import { MSO_CLOSE, MSO_OPEN } from './components/Frame'
import type { EmailContext, EmailTemplate, RenderedEmail } from './types'

/**
 * Renders a template to HTML and its plain-text part (docs/13 §5: the text part always). The
 * Frame's two marker elements become Outlook for Windows' fixed 600 px ghost table, which React
 * cannot write as conditional comments itself (src/brand/templates/email/README.md).
 */
const GHOST_OPEN =
  '<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->'
const GHOST_CLOSE = '<!--[if mso]></td></tr></table><![endif]-->'

function withOutlookGhost(html: string): string {
  return html
    .split(`<span ${MSO_OPEN}=""></span>`)
    .join(GHOST_OPEN)
    .split(`<span ${MSO_CLOSE}=""></span>`)
    .join(GHOST_CLOSE)
}

export async function renderEmail<Data>(
  template: EmailTemplate<Data>,
  data: Data,
  context: EmailContext,
): Promise<RenderedEmail> {
  const element = template.element(data, context)
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ])
  return {
    subject: template.subject(data),
    preheader: template.preheader(data),
    html: withOutlookGhost(html),
    text,
  }
}
