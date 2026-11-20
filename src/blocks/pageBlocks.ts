import type { Block, Field } from 'payload'

/**
 * The blocks a page is built from: one for each of the kit's page patterns
 * (src/brand/templates/web/landing.html; gallery.html, "Patterns"). Text fields hold IIIC's
 * words. A fact nobody has supplied is typed as [[TODO: what is missing, I-xx]] and shows as
 * the kit's placeholder chip (CLAUDE.md, non-negotiable 1).
 */

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
  },
}

const kicker: Field = {
  name: 'kicker',
  type: 'text',
  admin: { description: 'The small line above the heading. Optional.' },
}

const heading: Field = { name: 'heading', type: 'text', required: true }

const intro: Field = {
  name: 'intro',
  type: 'textarea',
  admin: { description: 'A sentence or two beside the heading. Optional.' },
}

/** The ids the fixed blocks carry (scope, certificate, contact): no section may take one. */
export const FIXED_ANCHORS = ['scope', 'certificate', 'contact'] as const

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

/** A path on this site. Links to other sites are added when a page needs one. */
export function isSitePath(value: unknown): true | string {
  if (value === undefined || value === null || value === '') return true
  return (
    (typeof value === 'string' && /^\/(?!\/)\S*$/.test(value)) ||
    'Use a path on this site, starting with one slash, such as /framework.'
  )
}

function action(name: string, label: string): Field {
  return {
    name,
    type: 'group',
    label,
    fields: [
      {
        type: 'row',
        fields: [
          { name: 'label', type: 'text' },
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
  Band,
]

/** The brand kit allows one yellow band a page, and it closes the page. */
export function oneClosingBand(layout: unknown): true | string {
  const blocks = Array.isArray(layout) ? (layout as { blockType?: string }[]) : []
  const bands = blocks.filter((block) => block.blockType === 'band')
  if (bands.length > 1) return 'A page has one yellow band at most.'
  if (bands.length === 1 && blocks.at(-1)?.blockType !== 'band') {
    return 'The yellow band closes the page: move it to the end.'
  }
  return true
}

/** No two sections of a page answer to the same link name, and none takes a fixed block's. */
export function uniqueAnchors(layout: unknown): true | string {
  const blocks = Array.isArray(layout) ? (layout as { anchor?: unknown }[]) : []
  const taken = new Set<string>(FIXED_ANCHORS)
  for (const block of blocks) {
    if (typeof block.anchor !== 'string' || block.anchor === '') continue
    if (taken.has(block.anchor)) {
      return `The link name "${block.anchor}" is already taken on this page.`
    }
    taken.add(block.anchor)
  }
  return true
}
