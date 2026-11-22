import type { CollectionConfig, TextareaFieldValidation, TextFieldSingleValidation } from 'payload'
import { text, textarea } from 'payload/shared'

import { allow, POLICY } from '@/access/policy'
import { appliesPageRules, hasWords } from '@/blocks/pageBlocks'
import { starterAt } from '@/content/starter'
import { revalidateFaqs } from '@/lib/content/revalidate'
import { PAGE_SLUG } from '@/lib/content/slug'

/**
 * The questions people ask, with IIIC's answers (docs/04 `faqs`; docs/05, Content: FAQs; I-20).
 * Each belongs to the page or door it is asked about, by that page's address (counselling for
 * the counselling door), and stands in its order there. A question is drafted, then published,
 * as a page is; the page's questions section shows the published ones (src/blocks/pageBlocks.ts,
 * `faq`), and its structured data names exactly those (D-62).
 */

/** A question goes on the site and into search results as it is written. */
function withoutPlaceholder(value: unknown): true | string {
  return (
    typeof value !== 'string' ||
    !/\[\[|\]\]/.test(value) ||
    'A question and its answer are published whole: write this without a placeholder.'
  )
}

// A custom check replaces Payload's own, so each runs Payload's first. The rules after it apply
// when the question is published and in the admin's live checks (appliesPageRules): a draft is
// saved without them.
const validateQuestion: TextFieldSingleValidation = async (value, options) => {
  const base = await text(value, options)
  if (base !== true || !appliesPageRules(options)) return base
  const words = hasWords(value)
  return words === true ? withoutPlaceholder(value) : 'Write the question.'
}

const validateAnswer: TextareaFieldValidation = async (value, options) => {
  const base = await textarea(value, options)
  if (base !== true || !appliesPageRules(options)) return base
  const words = hasWords(value)
  return words === true ? withoutPlaceholder(value) : 'Write the answer.'
}

/**
 * The page a question belongs to: an address the site has a page at, a starter page or one in
 * the admin, draft or published. While the editor types, the address's shape is checked; the
 * page itself, when the question is published.
 */
export const validatePageAddress: TextFieldSingleValidation = async (value, options) => {
  const base = await text(value, options)
  if (base !== true) return base
  if (typeof value !== 'string' || !PAGE_SLUG.test(value)) {
    return 'Use the page’s address without its first slash, such as counselling or organisations/team-map.'
  }
  if (options.event === 'onChange' || starterAt(value)) return true
  const { totalDocs } = await options.req.payload.count({
    collection: 'pages',
    where: { slug: { equals: value } },
    overrideAccess: true,
    req: options.req,
  })
  return (
    totalDocs > 0 ||
    `The site has no page at /${value}: use the address of one of its pages, such as counselling.`
  )
}

export const Faqs: CollectionConfig = {
  slug: 'faqs',
  labels: { singular: 'FAQ', plural: 'FAQs' },
  admin: {
    group: 'Content',
    useAsTitle: 'question',
    defaultColumns: ['question', 'page', 'order', '_status'],
    listSearchableFields: ['question', 'answer', 'page'],
  },
  // src/access/policy.ts (docs/05): anyone reads a published question; owners, operators and
  // editors read drafts and earlier versions, draft and publish; owners and editors delete.
  access: {
    read: allow(POLICY.faqs.read),
    readVersions: allow(POLICY.faqs.readVersions),
    create: allow(POLICY.faqs.create),
    update: allow(POLICY.faqs.update),
    delete: allow(POLICY.faqs.delete),
  },
  // Visitors read published questions without signing in, so the staff two-factor wrapper
  // (payload-totp) stays off this one operation, and the read rule asks for the code itself
  // before it shows a draft. Every write, and reading earlier versions, still needs the code.
  custom: { totp: { disableAccessWrapper: { read: true } } },
  versions: { drafts: true, maxPerDoc: 25 },
  defaultSort: ['page', 'order'],
  hooks: {
    // A change is on the page, and in its structured data, at the next request (docs/12 §4):
    // the page the question belongs to now, and the one it belonged to before a move.
    afterChange: [
      ({ doc, previousDoc }) => {
        revalidateFaqs(doc?.page, previousDoc?.page)
        return doc
      },
    ],
    afterDelete: [
      ({ doc }) => {
        revalidateFaqs(doc?.page)
        return doc
      },
    ],
  },
  fields: [
    {
      name: 'question',
      type: 'text',
      required: true,
      validate: validateQuestion,
      admin: { description: 'The question as people ask it (I-20).' },
    },
    {
      name: 'answer',
      type: 'textarea',
      required: true,
      validate: validateAnswer,
      admin: {
        description:
          'IIIC’s answer, one paragraph a line, the plainest sentence first. Every fact in it can be pointed to (docs/09).',
      },
    },
    {
      name: 'page',
      type: 'text',
      label: 'Page',
      required: true,
      index: true,
      validate: validatePageAddress,
      admin: {
        position: 'sidebar',
        description:
          'The page it is asked about, by its address without the first slash: counselling for /counselling, organisations/team-map for the Team Map. The page shows it in its questions section.',
      },
    },
    {
      name: 'order',
      type: 'number',
      required: true,
      defaultValue: 1,
      min: 0,
      admin: {
        position: 'sidebar',
        description:
          'Where it stands among its page’s questions: 1 comes first. Questions with the same number keep the order they were added in.',
      },
    },
  ],
}
