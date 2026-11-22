import { CERTIFICATE_HEADING } from '@/lib/certificates/statement'
import { SCOPE_HEADING } from '@/lib/counselling/scope'
import { STEP_ZERO_QUESTION } from '@/lib/map/stepZero'
import {
  footerLegal,
  LEGAL_INFORMATION_HEADING,
  LEGAL_PLACEHOLDERS,
  legalRows,
  NO_LEGAL_INFORMATION,
  type LegalInformation,
} from '@/lib/settings/legal'
import { CONTACT_HEADING } from '@/lib/site/contact'

import type { PageBlock, PageContent } from './types'

/**
 * What the pages still wait for (docs/05, Content → Placeholders; D-56): the facts nobody has
 * supplied, the copy IIIC has not approved, and the wording a lawyer has yet to review. Pure
 * functions over page data, so the admin's report and the tests read the same thing the site
 * draws.
 */

/** A placeholder as it is typed into a text field: [[TODO: what is missing, I-xx]]. */
export const PLACEHOLDER = /\[\[TODO: (.+?), ([ID]-\d+)\]\]/g

/**
 * The placeholders the components draw themselves, in one place: the components read them
 * from here, so the report cannot name one the site does not show.
 */
export const FIXED_PLACEHOLDERS = {
  footerAffiliation: {
    id: 'I-30',
    what: 'statement that IIIC is privately owned and not affiliated with any Government body',
  },
  // The footer's legal row names the proprietor, the GSTIN and the grievance officer (docs/08
  // §3, §4), in the words the legal pages use for the same facts. Each is drawn only while the
  // settings lack it (src/lib/settings/legal.ts).
  footerLegalName: LEGAL_PLACEHOLDERS.legalName,
  footerGstin: LEGAL_PLACEHOLDERS.gstin,
  footerGrievanceOfficer: LEGAL_PLACEHOLDERS.grievanceOfficer,
  contactAddress: LEGAL_PLACEHOLDERS.address,
  founderPhoto: { id: 'I-10', what: 'the founder’s photograph, as he wants it published' },
  mapLine: { id: 'I-41', what: 'approval of the line under the question' },
} as const

/** The inputs the approvals wait on: IIIC's sign-off on copy, and the lawyer's review. */
export const COPY_APPROVAL = 'I-41'
export const LEGAL_REVIEW = 'I-22'

/** What a draft legal page as a whole is called in the report. */
export const WHOLE_PAGE = 'The whole page'

export type Placeholder = { id: string; what: string; section: string }

/** A page as the report names it, with where a click on it leads. */
export type PageRef = { title: string; path: string; href: string; inAdmin: boolean }

export type ReportSource = { page: PageRef; content: Pick<PageContent, 'layout' | 'legalReview'> }

export type Report = {
  missing: (Placeholder & { page: PageRef })[]
  candidates: { page: PageRef; sections: string[] }[]
  legal: { page: PageRef; items: string[] }[]
}

/** The placeholder a block's own component draws, whatever its fields hold. */
const DRAWN_BY_BLOCK: Partial<Record<PageBlock['blockType'], { id: string; what: string }>> = {
  founderNote: FIXED_PLACEHOLDERS.founderPhoto,
  contact: FIXED_PLACEHOLDERS.contactAddress,
}

const FIXED_HEADINGS: Partial<Record<PageBlock['blockType'], string>> = {
  scope: SCOPE_HEADING,
  certificate: CERTIFICATE_HEADING,
  contact: CONTACT_HEADING,
  legal: LEGAL_INFORMATION_HEADING,
}

/**
 * Every string a block shows, whatever field holds it. The admin's block name and the row ids
 * are left out: the page never draws them.
 */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(strings)
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) =>
      key === 'blockName' || key === 'id' ? [] : strings(inner),
    )
  }
  return []
}

/** Brackets outside a well-formed placeholder: a placeholder typed another way. */
export function hasStrayBrackets(text: string): boolean {
  return /\[\[|\]\]/.test(text.replace(PLACEHOLDER, ''))
}

/** The strings in a page's sections that hold a mistyped placeholder. */
export function mistypedPlaceholders(layout: unknown): string[] {
  return strings(layout).filter((text) => hasStrayBrackets(text))
}

/** The name a section goes by: its heading, or the heading its fixed wording carries. */
export function sectionName(block: PageBlock): string {
  if ('heading' in block && block.heading) return block.heading
  return FIXED_HEADINGS[block.blockType] ?? block.blockType
}

/** The placeholders typed into some text, each with the section it is in. */
function typedIn(texts: string[], section: string): Placeholder[] {
  return texts.flatMap((text) =>
    [...text.matchAll(PLACEHOLDER)].map((match) => ({
      id: match[2] ?? '',
      what: match[1] ?? '',
      section,
    })),
  )
}

/**
 * Every placeholder a page shows: the typed ones, and the ones its blocks draw themselves. The
 * legal information section draws a placeholder for each detail the settings lack, so the page
 * is read with the legal information the site has (none, unless the caller gives it).
 */
export function placeholdersIn(
  page: Pick<PageContent, 'layout'>,
  legal: LegalInformation = NO_LEGAL_INFORMATION,
): Placeholder[] {
  return page.layout.flatMap((block) => {
    const section = sectionName(block)
    if (block.blockType === 'legal') {
      return typedIn(
        legalRows(legal).map((row) => row.text),
        section,
      )
    }
    const drawn = DRAWN_BY_BLOCK[block.blockType]
    const typed = typedIn(strings(block), section)
    return drawn ? [{ ...drawn, section }, ...typed] : typed
  })
}

/** The sections whose copy IIIC has not approved yet (I-41). */
export function candidateSections(page: Pick<PageContent, 'layout'>): string[] {
  return page.layout
    .filter((block) => 'copyStatus' in block && block.copyStatus === 'candidate')
    .map(sectionName)
}

/** What on a page waits for the lawyer (I-22): a draft legal page, and the fixed statements. */
export function legalItems(page: Pick<PageContent, 'layout' | 'legalReview'>): string[] {
  return [
    ...(page.legalReview === 'draft' ? [WHOLE_PAGE] : []),
    ...page.layout
      .filter((block) => block.blockType === 'scope' || block.blockType === 'certificate')
      .map(sectionName),
  ]
}

/** The footer is on every page; the report sends a click on its placeholders home. */
const EVERY_PAGE: PageRef = { title: 'Every page', path: '/', href: '/', inAdmin: false }

/**
 * The placeholders that belong to no page's data: the footer's, and Find your path's. The
 * footer draws its legal details' placeholders only while the settings lack them.
 */
export function codedPlaceholders(
  legal: LegalInformation = NO_LEGAL_INFORMATION,
): Report['missing'] {
  const footer = footerLegal(legal)
  const inFooter = (placeholder: { id: string; what: string }) => ({
    ...placeholder,
    section: 'Footer',
    page: EVERY_PAGE,
  })
  return [
    inFooter(FIXED_PLACEHOLDERS.footerAffiliation),
    ...(footer.legalName ? [] : [inFooter(FIXED_PLACEHOLDERS.footerLegalName)]),
    ...(footer.gstin || footer.gstStatus ? [] : [inFooter(FIXED_PLACEHOLDERS.footerGstin)]),
    ...(footer.grievanceOfficer ? [] : [inFooter(FIXED_PLACEHOLDERS.footerGrievanceOfficer)]),
    {
      ...FIXED_PLACEHOLDERS.mapLine,
      section: STEP_ZERO_QUESTION,
      page: { title: 'Find your path', path: '/map', href: '/map', inAdmin: false },
    },
  ]
}

/** The code's own placeholders while the settings hold no legal information. */
export const CODED_PLACEHOLDERS: Report['missing'] = codedPlaceholders()

/** Inputs (I-) before decisions (D-), each in the order of its number. */
function byInput(a: { id: string }, b: { id: string }): number {
  const rank = (id: string) => (id.startsWith('I') ? 0 : 1) * 10_000 + Number(id.slice(2))
  return rank(a.id) - rank(b.id)
}

/**
 * The report over a set of pages, with the placeholders the code itself draws, read with the
 * legal information the settings hold (none, unless the caller gives it).
 */
export function buildReport(
  sources: ReportSource[],
  coded = CODED_PLACEHOLDERS,
  legal: LegalInformation = NO_LEGAL_INFORMATION,
): Report {
  const missing = [
    ...sources.flatMap(({ page, content }) =>
      placeholdersIn(content, legal).map((placeholder) => ({ ...placeholder, page })),
    ),
    ...coded,
  ]
  return {
    // A stable sort: within one input the pages keep their order.
    missing: missing.sort(byInput),
    candidates: sources
      .map(({ page, content }) => ({ page, sections: candidateSections(content) }))
      .filter((entry) => entry.sections.length > 0),
    legal: sources
      .map(({ page, content }) => ({ page, items: legalItems(content) }))
      .filter((entry) => entry.items.length > 0),
  }
}
