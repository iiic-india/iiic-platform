import type { Block, Field } from 'payload'

/**
 * The blocks a page is built from: one for each of the kit's page patterns
 * (src/brand/templates/web/landing.html; gallery.html, "Patterns"). Text fields hold IIIC's
 * words. A fact nobody has supplied is typed as [[TODO: what is missing, I-xx]] and shows as
 * the kit's placeholder chip (CLAUDE.md, non-negotiable 1).
 */

/** On a legal page the page's legal review is the approval (D-52): its sections show no copy status. */
export function showsCopyStatus(data: { legalReview?: unknown } | undefined): boolean {
  return !data?.legalReview
}

/** What Payload hands a field's check, as far as the page rules read it. */
type CheckOptions = { data?: unknown; event?: unknown; siblingData?: unknown }

/**
 * Whether the page rules apply to a check (docs/04): when the page is being published, and in
 * the admin's live checks, which show what publishing would refuse. Payload skips every check
 * on a draft save. A save that leaves the page unpublished, such as an unpublish through the
 * API, checks every field against the page's newest draft, and the page rules there would keep
 * the page on the site (D-57), so they pass it.
 */
export function appliesPageRules({ data, event }: CheckOptions): boolean {
  return (
    event === 'onChange' ||
    (data as { _status?: unknown } | null | undefined)?._status === 'published'
  )
}

/** A page rule as a field's check: it applies as appliesPageRules says, and passes otherwise. */
function pageRule(rule: (value: unknown, options: CheckOptions) => true | string) {
  return (value: unknown, options: CheckOptions): true | string =>
    appliesPageRules(options) ? rule(value, options) : true
}

/** Whether IIIC has approved a block's wording (I-41). Candidate copy carries a visible marker. */
const copyStatus: Field = {
  name: 'copyStatus',
  type: 'select',
  required: true,
  defaultValue: 'approved',
  options: [
    { label: 'Approved by IIIC', value: 'approved' },
    { label: 'Candidate, awaiting approval (I-41)', value: 'candidate' },
  ],
  admin: {
    description: 'Candidate copy is shown with a marker until IIIC approves it (I-41).',
    // Admin only: the stored value stays, so the site and the report do not change.
    condition: (data) => showsCopyStatus(data),
  },
}

const kicker: Field = {
  name: 'kicker',
  type: 'text',
  admin: { description: 'The small line above the heading. Optional.' },
}

/** A heading holds words: one of spaces only would draw an empty heading. */
export function hasWords(value: unknown): true | string {
  return (typeof value === 'string' && value.trim() !== '') || 'Write the heading.'
}

// A custom check replaces Payload's own text check, which accepts spaces; `required` stays for
// the admin's marker. The heading has no length limit, so nothing else is lost.
const heading: Field = {
  name: 'heading',
  type: 'text',
  required: true,
  validate: pageRule(hasWords),
}

const intro: Field = {
  name: 'intro',
  type: 'textarea',
  admin: { description: 'A sentence or two beside the heading. Optional.' },
}

/**
 * The ids the public forms' blocks carry (docs/17 §6): a link to /organisations/team-map#team-map-request
 * opens the Team Map request, one to /institute#partnership-enquiry the partnership enquiry.
 */
export const FORM_ANCHORS = {
  teamMapRequest: 'team-map-request',
  partnershipEnquiry: 'partnership-enquiry',
} as const

/** The fixed blocks, by their type, and the id each carries on its page. */
export const FIXED_BLOCK_IDS = {
  scope: 'scope',
  certificate: 'certificate',
  contact: 'contact',
  legal: 'legal',
  ...FORM_ANCHORS,
} as const

/** The ids the fixed blocks carry (scope, certificate, contact, legal, the forms): no section may take one. */
export const FIXED_ANCHORS: readonly (typeof FIXED_BLOCK_IDS)[keyof typeof FIXED_BLOCK_IDS][] =
  Object.values(FIXED_BLOCK_IDS)

/** A short name a link opens a section by: small letters, numbers and hyphens. */
export function isAnchor(value: unknown): true | string {
  if (value === undefined || value === null || value === '') return true
  return (
    (typeof value === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(value)) ||
    'Use small letters, numbers and hyphens, starting with a letter, such as the-story.'
  )
}

const anchor: Field = {
  name: 'anchor',
  type: 'text',
  label: 'Link name',
  validate: isAnchor,
  admin: {
    description:
      'A short name to link to this section by: with "story", a link to /page#story opens here. Optional.',
  },
}

/**
 * A path on this site. Links to other sites are added when a page needs one. A backslash is
 * refused anywhere: browsers read "/\evil.example" as a link to another site.
 */
export function isSitePath(value: unknown): true | string {
  if (value === undefined || value === null || value === '') return true
  return (
    (typeof value === 'string' && /^\/(?!\/)[^\s\\]*$/.test(value)) ||
    'Use a path on this site, starting with one slash, such as /framework.'
  )
}

/** Button words need the link they open: without one the button is not drawn. */
export function wordsNeedLink(
  value: unknown,
  { siblingData }: { siblingData?: unknown },
): true | string {
  if (value === undefined || value === null || value === '') return true
  const href = (siblingData as { href?: unknown } | undefined)?.href
  return (
    (typeof href === 'string' && href !== '') ||
    'Add the link this button opens, or clear its words.'
  )
}

// The words and the link sit side by side in the group's data: a row does not nest them.
function action(name: string, label: string): Field {
  return {
    name,
    type: 'group',
    label,
    fields: [
      {
        type: 'row',
        fields: [
          { name: 'label', type: 'text', validate: pageRule(wordsNeedLink) },
          { name: 'href', type: 'text', label: 'Link', validate: isSitePath },
        ],
      },
    ],
  }
}

const Hero: Block = {
  slug: 'hero',
  interfaceName: 'HeroBlock',
  labels: { singular: 'Hero', plural: 'Heroes' },
  fields: [
    kicker,
    heading,
    { name: 'lead', type: 'textarea' },
    action('primary', 'Main action'),
    action('secondary', 'Second action'),
    {
      name: 'note',
      type: 'textarea',
      admin: { description: 'A line of small print under the actions. Optional.' },
    },
    copyStatus,
  ],
}

const Doors: Block = {
  slug: 'doors',
  interfaceName: 'DoorsBlock',
  labels: { singular: 'Doors', plural: 'Doors' },
  fields: [
    kicker,
    heading,
    intro,
    {
      name: 'doors',
      type: 'array',
      required: true,
      minRows: 1,
      maxRows: 3,
      labels: { singular: 'Door', plural: 'Doors' },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'glyph',
              type: 'text',
              maxLength: 1,
              admin: { description: 'One letter for the tile.', width: '20%' },
            },
            {
              name: 'audience',
              type: 'text',
              label: 'Who it is for',
              admin: { description: 'The small line, such as For organisations.', width: '40%' },
            },
            {
              name: 'href',
              type: 'text',
              label: 'Link',
              required: true,
              validate: isSitePath,
              admin: { width: '40%' },
            },
          ],
        },
        {
          name: 'question',
          type: 'text',
          label: 'Title',
          required: true,
          admin: {
            description:
              "The card's main line: the reader's own sentence, or the name of a vertical.",
          },
        },
        { name: 'line', type: 'textarea', admin: { description: "IIIC's line for the vertical." } },
        {
          name: 'outcomes',
          type: 'text',
          admin: { description: 'The outcome band, such as Perspective · Acceptance · Growth.' },
        },
        { name: 'action', type: 'text', admin: { description: 'The words on the button.' } },
      ],
    },
    anchor,
    copyStatus,
  ],
}

const Statement: Block = {
  slug: 'statement',
  interfaceName: 'StatementBlock',
  labels: { singular: 'Statement', plural: 'Statements' },
  fields: [
    kicker,
    heading,
    {
      name: 'paragraphs',
      type: 'array',
      required: true,
      minRows: 1,
      labels: { singular: 'Paragraph', plural: 'Paragraphs' },
      fields: [{ name: 'text', type: 'textarea', required: true }],
    },
    action('action', 'Action'),
    anchor,
    copyStatus,
  ],
}

const Steps: Block = {
  slug: 'steps',
  interfaceName: 'StepsBlock',
  labels: { singular: 'Steps', plural: 'Steps' },
  fields: [
    kicker,
    heading,
    { name: 'lead', type: 'textarea', admin: { description: 'The line the steps follow.' } },
    {
      name: 'steps',
      type: 'array',
      required: true,
      minRows: 2,
      labels: { singular: 'Step', plural: 'Steps' },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'text', type: 'textarea' },
      ],
    },
    anchor,
    copyStatus,
  ],
}

/** Two ways of living, line against line: the framework's Object and Subject (docs/11 §3.2). */
const Comparison: Block = {
  slug: 'comparison',
  interfaceName: 'ComparisonBlock',
  labels: { singular: 'Comparison', plural: 'Comparisons' },
  fields: [
    kicker,
    heading,
    {
      type: 'row',
      fields: [
        { name: 'leftLabel', type: 'text', label: 'First column', required: true },
        { name: 'rightLabel', type: 'text', label: 'Second column', required: true },
      ],
    },
    {
      name: 'pairs',
      type: 'array',
      required: true,
      minRows: 1,
      labels: { singular: 'Pair', plural: 'Pairs' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'left', type: 'text', label: 'First column', required: true },
            { name: 'right', type: 'text', label: 'Second column', required: true },
          ],
        },
      ],
    },
    anchor,
    copyStatus,
  ],
}

const Points: Block = {
  slug: 'points',
  interfaceName: 'PointsBlock',
  labels: { singular: 'Points', plural: 'Points' },
  fields: [
    kicker,
    heading,
    { name: 'lead', type: 'textarea', admin: { description: 'The line the points follow.' } },
    {
      name: 'points',
      type: 'array',
      required: true,
      minRows: 1,
      labels: { singular: 'Point', plural: 'Points' },
      fields: [{ name: 'text', type: 'text', required: true }],
    },
    anchor,
    copyStatus,
  ],
}

/** A grid of cards: pillars, services, anything with a name and a line. A card may link. */
const Cards: Block = {
  slug: 'cards',
  interfaceName: 'CardsBlock',
  labels: { singular: 'Cards', plural: 'Cards' },
  fields: [
    kicker,
    heading,
    intro,
    {
      name: 'cards',
      type: 'array',
      required: true,
      minRows: 1,
      labels: { singular: 'Card', plural: 'Cards' },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'text', type: 'textarea' },
        {
          type: 'row',
          fields: [
            { name: 'href', type: 'text', label: 'Link', validate: isSitePath },
            {
              name: 'action',
              type: 'text',
              validate: pageRule(wordsNeedLink),
              admin: { description: 'The words on the button, when the card links.' },
            },
          ],
        },
      ],
    },
    anchor,
    copyStatus,
  ],
}

const FactList: Block = {
  slug: 'factList',
  interfaceName: 'FactListBlock',
  labels: { singular: 'Facts', plural: 'Facts' },
  fields: [
    kicker,
    heading,
    {
      name: 'facts',
      type: 'array',
      required: true,
      minRows: 1,
      maxRows: 3,
      labels: { singular: 'Fact', plural: 'Facts' },
      fields: [
        { name: 'statement', type: 'textarea', required: true },
        {
          name: 'source',
          type: 'text',
          admin: { description: 'Where the fact comes from, as the page shows it.' },
        },
      ],
    },
    anchor,
    copyStatus,
  ],
}

/**
 * The counselling scope statement and the crisis numbers (docs/08 §7). The block has no
 * fields: its wording is fixed in src/lib/counselling/scope.ts, the same on every surface.
 */
const Scope: Block = {
  slug: 'scope',
  interfaceName: 'ScopeBlock',
  labels: {
    singular: 'Counselling scope and crisis numbers',
    plural: 'Counselling scope and crisis numbers',
  },
  fields: [],
}

/**
 * What the certificate is and is not (docs/08 §7). Like the scope block it has no fields:
 * its wording is fixed in src/lib/certificates/statement.ts, the same on every surface.
 */
const Certificate: Block = {
  slug: 'certificate',
  interfaceName: 'CertificateBlock',
  labels: { singular: 'Certificate statement', plural: 'Certificate statements' },
  fields: [],
}

/**
 * IIIC's contact details, and the place the footer's Contact link opens (docs/02, /about).
 * The block has no fields: the details are in src/lib/site/contact.ts, the same as the footer's.
 */
const Contact: Block = {
  slug: 'contact',
  interfaceName: 'ContactBlock',
  labels: { singular: 'Contact details', plural: 'Contact details' },
  fields: [],
}

/**
 * Who runs the site (docs/08 §4; docs/12 §11, `/legal`): the legal name and trade name, the
 * address, the GSTIN, customer care, the grievance officer, the CERT-In point of contact and the
 * dark-pattern audit. The block has no fields: the details are the owner's, in the settings
 * (src/globals/Settings.ts), and each shows its placeholder while it is empty, wherever the
 * block is placed (src/lib/settings/legal.ts).
 */
const Legal: Block = {
  slug: 'legal',
  interfaceName: 'LegalBlock',
  labels: { singular: 'Legal information', plural: 'Legal information' },
  fields: [],
}

/**
 * The Team Map request (docs/03 F5; docs/17 §6). Like the contact block it has no fields: its
 * questions, its consent box and its acknowledgement are fixed in src/lib/enquiryForms/strings.ts,
 * and the consent's wording is the notice in force (Content → Consent texts). While no notice is
 * in force the section shows its placeholder instead of the form.
 */
const TeamMapRequest: Block = {
  slug: 'teamMapRequest',
  interfaceName: 'TeamMapRequestBlock',
  labels: { singular: 'Team Map request form', plural: 'Team Map request forms' },
  fields: [],
}

/** The partnership enquiry (docs/03 F12; docs/17 §6), fixed as the Team Map request is. */
const PartnershipEnquiry: Block = {
  slug: 'partnershipEnquiry',
  interfaceName: 'PartnershipEnquiryBlock',
  labels: { singular: 'Partnership enquiry form', plural: 'Partnership enquiry forms' },
  fields: [],
}

const FounderNote: Block = {
  slug: 'founderNote',
  interfaceName: 'FounderNoteBlock',
  labels: { singular: "Founder's note", plural: "Founder's notes" },
  fields: [
    kicker,
    heading,
    {
      name: 'note',
      type: 'textarea',
      required: true,
      admin: {
        description:
          'His note in his own words, or his biography as IIIC has published it. One paragraph a line. Never written for him (I-10).',
      },
    },
    { name: 'attribution', type: 'text' },
    anchor,
    copyStatus,
  ],
}

/**
 * The questions people ask about the page (docs/02, page anatomy; I-20), as the kit's accordion.
 * The block holds the section's own words only: the questions are kept, drafted and published
 * in Content → FAQs under the page's address, and the section shows the published ones in their
 * order. A page shows its list once, and its structured data names only those questions (D-62).
 */
const Faq: Block = {
  slug: 'faq',
  interfaceName: 'FaqBlock',
  labels: { singular: 'Questions (FAQ)', plural: 'Questions (FAQ)' },
  fields: [
    kicker,
    {
      ...heading,
      admin: {
        description:
          'The heading over the questions, such as Questions people ask. The questions themselves are kept in Content → FAQs, under this page’s address.',
      },
    },
    intro,
    anchor,
    copyStatus,
  ],
}

const Band: Block = {
  slug: 'band',
  interfaceName: 'BandBlock',
  labels: { singular: 'Closing band (yellow)', plural: 'Closing bands' },
  fields: [
    kicker,
    heading,
    { name: 'lead', type: 'textarea' },
    {
      type: 'row',
      fields: [
        {
          name: 'sanskrit',
          type: 'text',
          // The line is drawn inside lang="sa", so a placeholder chip there would be read as
          // Sanskrit: the line is typed, or left empty.
          validate: pageRule(
            (value) =>
              typeof value !== 'string' ||
              !/\[\[|\]\]/.test(value) ||
              'The Sanskrit line is typed in Devanagari, never as a placeholder: type it, or leave it empty.',
          ),
          admin: { description: 'The signature line in Devanagari, once per page.' },
        },
        { name: 'translation', type: 'text', admin: { description: 'Its English.' } },
      ],
    },
    action('primary', 'Action'),
    copyStatus,
  ],
}

export const PAGE_BLOCKS: Block[] = [
  Hero,
  Doors,
  Statement,
  Steps,
  Comparison,
  Points,
  Cards,
  FactList,
  Scope,
  Certificate,
  FounderNote,
  Contact,
  Legal,
  TeamMapRequest,
  PartnershipEnquiry,
  Faq,
  Band,
]

/** Whether a page has a questions section, which shows the questions published for it. */
export function hasQuestions(layout: unknown): boolean {
  const blocks = Array.isArray(layout) ? (layout as { blockType?: unknown }[]) : []
  return blocks.some((block) => block.blockType === 'faq')
}

/*
 * The page rules. src/collections/Pages.ts runs them, with every field's own check, when a
 * page is published (appliesPageRules); a draft is saved without them, and an unpublish passes
 * them.
 */

/** A page opens with its one hero: the hero holds the page's h1 and a draft legal page's marker (D-52). */
export function oneOpeningHero(layout: unknown): true | string {
  const blocks = Array.isArray(layout) ? (layout as { blockType?: string }[]) : []
  const heroes = blocks.filter((block) => block.blockType === 'hero').length
  if (heroes === 0) return 'A page opens with a hero: add one at the top.'
  if (heroes > 1) return 'A page has one hero at most: remove the others.'
  if (blocks[0]?.blockType !== 'hero') return 'The hero opens the page: move it to the top.'
  return true
}

/** The brand kit allows one yellow band a page, and it closes the page. */
export function oneClosingBand(layout: unknown): true | string {
  const blocks = Array.isArray(layout) ? (layout as { blockType?: string }[]) : []
  const bands = blocks.filter((block) => block.blockType === 'band')
  if (bands.length > 1) return 'A page has one yellow band at most: remove the others.'
  if (bands.length === 1 && blocks.at(-1)?.blockType !== 'band') {
    return 'The yellow band closes the page: move it to the end.'
  }
  return true
}

/** The ids the page shell gives its own elements (src/components/site/SiteFrame.tsx, SiteHeader.tsx). */
export const SHELL_IDS = ['main', 'site-nav'] as const

/** A block's name as the admin lists it, such as "Certificate statement". */
function fixedLabel(type: string): string {
  const label = PAGE_BLOCKS.find((block) => block.slug === type)?.labels?.singular
  return typeof label === 'string' ? label : type
}

/**
 * The sections a page carries once at most: the fixed blocks, whose ids are their own, and the
 * questions section, which shows the page's one list of questions.
 */
const ONCE_A_PAGE: readonly string[] = [...Object.keys(FIXED_BLOCK_IDS), 'faq']

/**
 * No two sections answer to the same link name, none takes the shell's or a fixed block's,
 * and each fixed block, like the questions section, comes once.
 */
export function uniqueAnchors(layout: unknown): true | string {
  const blocks = Array.isArray(layout)
    ? (layout as { blockType?: unknown; anchor?: unknown }[])
    : []
  const taken = new Set<string>([...SHELL_IDS, ...FIXED_ANCHORS])
  const once = new Set<string>()
  for (const block of blocks) {
    const type = block.blockType
    if (typeof type === 'string' && ONCE_A_PAGE.includes(type)) {
      if (once.has(type)) {
        return `A page has one "${fixedLabel(type)}" section at most: remove the others.`
      }
      once.add(type)
    }
    if (typeof block.anchor !== 'string' || block.anchor === '') continue
    if (taken.has(block.anchor)) {
      return `The link name "${block.anchor}" is already taken on this page.`
    }
    taken.add(block.anchor)
  }
  return true
}

/**
 * A path someone may follow to counselling: a page under /counselling, or the session booking.
 * Matched without regard to case, so a mistyped capital still counts. The page rule below and
 * the site's 404 (src/app/(platform)/(default)/not-found.tsx) both ask this, so a page and the
 * 404 at the same address agree on carrying the scope statement and the crisis numbers.
 */
export function isCounsellingPath(path: string): boolean {
  return /^\/(counselling|book\/session)(\/|$)/i.test(path)
}

/**
 * The fixed statements a page must carry by its address (docs/08 §7; src/brand/VOICE.md,
 * "Counselling copy"): every page on a counselling path the scope statement and the crisis
 * numbers, and the course page the certificate statement.
 */
export function carriesFixedStatements(layout: unknown, slug: unknown): true | string {
  if (typeof slug !== 'string') return true
  const blocks = Array.isArray(layout) ? (layout as { blockType?: unknown }[]) : []
  const has = (type: string) => blocks.some((block) => block.blockType === type)
  if (isCounsellingPath(`/${slug}`) && !has('scope')) {
    return `A counselling page carries the scope statement and the crisis numbers: add the "${fixedLabel('scope')}" section.`
  }
  if (slug === 'learn' && !has('certificate')) {
    return `The course page carries the certificate statement: add the "${fixedLabel('certificate')}" section.`
  }
  return true
}
