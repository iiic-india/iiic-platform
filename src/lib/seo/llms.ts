import { CONTACT } from '@/lib/site/contact'

import {
  canonicalPath,
  canonicalUrl,
  fact,
  FOUNDER,
  SITE_DESCRIPTION,
  SITE_NAME,
  siteOrigin,
} from './site'

export type LlmsPage = { path: string; title: string; description?: string | null }

/** The legal pages, which llms.txt lists under their own heading. */
const LEGAL_PATHS = new Set([
  '/legal',
  '/privacy',
  '/terms',
  '/refunds',
  '/grievance',
  '/accessibility',
])

/** A text on one line: an editor may have typed a description on several. */
const oneLine = (text: string) => text.replace(/\s+/g, ' ')

/**
 * One line per page: its title as a link, then its description. A title or a description that
 * is empty or still holds a placeholder is left out: the line then names the page by its
 * address, or stops at the link. Square brackets and backslashes in a title are escaped, so the
 * link stays whole: a title that ends in a backslash would otherwise escape the closing bracket.
 */
function line(page: LlmsPage, origin: string): string {
  const name = oneLine(fact(page.title) ?? canonicalPath(page.path)).replace(/[\\[\]]/g, '\\$&')
  const link = `- [${name}](${canonicalUrl(page.path, origin)})`
  const text = fact(page.description)
  return text ? `${link}: ${oneLine(text)}` : link
}

/**
 * /llms.txt (D-66), in the llmstxt.org format: the name, IIIC's sentence about itself, the
 * contact details and the pages, each with the description its metadata carries. It is built
 * from the same facts as the structured data and the pages' own titles and descriptions, so it
 * says nothing they do not, and no placeholder reaches it. No benefit is claimed for it (D-66).
 */
export function buildLlmsTxt(pages: readonly LlmsPage[], origin: string = siteOrigin()): string {
  const isLegal = (page: LlmsPage) => LEGAL_PATHS.has(canonicalPath(page.path))
  const main = pages.filter((page) => !isLegal(page))
  const legal = pages.filter(isLegal)
  const list = (items: readonly LlmsPage[]) => items.map((page) => line(page, origin))
  return [
    `# ${SITE_NAME}`,
    '',
    `> ${SITE_DESCRIPTION}`,
    '',
    `IIIC is the short name of the ${SITE_NAME}, Ahmedabad, India. Its founder is ${FOUNDER.name}, ${FOUNDER.jobTitle}.`,
    '',
    `- Office: ${CONTACT.address}`,
    `- Phone: ${CONTACT.phone}`,
    `- Email: ${CONTACT.email}`,
    `- Hours: ${CONTACT.hours}`,
    `- Website: ${canonicalUrl('/', origin)}`,
    '',
    '## Pages',
    '',
    ...list(main),
    ...(legal.length > 0 ? ['', '## Legal', '', ...list(legal)] : []),
    '',
  ].join('\n')
}
