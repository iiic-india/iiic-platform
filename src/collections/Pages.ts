import type { CollectionConfig, TextareaFieldValidation, TextFieldSingleValidation } from 'payload'
import { text, textarea, blocks as validateBlocks } from 'payload/shared'

import { allow, POLICY } from '@/access/policy'
import {
  carriesFixedStatements,
  oneClosingBand,
  oneOpeningHero,
  PAGE_BLOCKS,
  uniqueAnchors,
} from '@/blocks/pageBlocks'
import { copyStarterPage } from '@/lib/content/copyStarter'
import { mistypedPlaceholders } from '@/lib/content/placeholders'
import { revalidatePages } from '@/lib/content/revalidate'
import { PAGE_SLUG } from '@/lib/content/slug'

/**
 * The public pages, built from the kit's blocks (docs/05, Content; docs/04). A page is
 * drafted, then published; visitors see published pages only. Until a page here is first
 * published, its route shows the repository's starter page for it (D-51, D-57).
 */

/** The browser tab and search results show these words as typed, so a placeholder would show as brackets. */
function withoutPlaceholder(value: unknown): true | string {
  return (
    typeof value !== 'string' ||
    !/\[\[|\]\]/.test(value) ||
    'A placeholder cannot show in a browser tab or a search result: write this without one.'
  )
}

// A custom check replaces Payload's own, so each one runs Payload's first: `required` and
// `maxLength` still hold.
const validateTitle: TextFieldSingleValidation = async (value, options) => {
  const base = await text(value, options)
  return base === true ? withoutPlaceholder(value) : base
}

const validateDescription: TextareaFieldValidation = async (value, options) => {
  const base = await textarea(value, options)
  return base === true ? withoutPlaceholder(value) : base
}

export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', '_status', 'updatedAt'],
    // Above the list: the starter pages that are not here yet, each with a way in (D-54).
    components: { beforeListTable: ['/components/admin/StarterPages#StarterPages'] },
  },
  // src/access/policy.ts (docs/05): anyone reads a published page; owners, operators and
  // editors read drafts and earlier versions, draft and publish; owners and editors delete.
  access: {
    read: allow(POLICY.pages.read),
    readVersions: allow(POLICY.pages.readVersions),
    create: allow(POLICY.pages.create),
    update: allow(POLICY.pages.update),
    delete: allow(POLICY.pages.delete),
  },
  // Visitors read published pages without signing in, so the staff two-factor wrapper
  // (payload-totp) stays off this one operation, and the read rule asks for the code itself
  // before it shows a draft. Every write, and reading earlier versions, still needs a
  // verified code.
  custom: { totp: { disableAccessWrapper: { read: true } } },
  versions: { drafts: true, maxPerDoc: 25 },
  // Copies a starter page in as a draft (src/lib/content/copyStarter.ts, D-54).
  endpoints: [{ path: '/from-starter', method: 'post', handler: copyStarterPage }],
  hooks: {
    // An editor's change is on the site at the next request (docs/12 §4).
    afterChange: [
      ({ doc, previousDoc }) => {
        revalidatePages(doc?.slug, previousDoc?.slug)
        return doc
      },
    ],
    afterDelete: [
      ({ doc }) => {
        revalidatePages(doc?.slug)
        return doc
      },
    ],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      maxLength: 53,
      validate: validateTitle,
      admin: {
        description:
          'The name of the page, as the browser tab and this list show it. Up to 53 characters: the tab adds " · IIIC" (docs/12 §3).',
      },
    },
    {
      name: 'slug',
      type: 'text',
      label: 'Address',
      required: true,
      unique: true,
      index: true,
      validate: (value: unknown) =>
        (typeof value === 'string' && PAGE_SLUG.test(value)) ||
        'Use small letters, numbers and hyphens, such as framework or organisations/team-map.',
      admin: {
        position: 'sidebar',
        description: 'Where the page lives: "home" for the first page, "framework" for /framework.',
      },
    },
    {
      // Once set, the page's address shows this page while it is published and the site's 404
      // while it is not, never the starter page again (D-57). Only the server writes it. A page
      // published before the field existed gets it the next time it is saved.
      name: 'firstPublishedAt',
      type: 'date',
      label: 'First published',
      access: { create: () => false, update: () => false },
      admin: {
        position: 'sidebar',
        readOnly: true,
        description:
          'Set when the page is first published. From then on its address shows this page while it is published, and "Page not found" while it is not (D-57).',
      },
      hooks: {
        beforeChange: [
          ({ value, originalDoc, data, operation }) => {
            const publishing = data?._status === 'published'
            // A new page starts unpublished. On a create, the original is the page a
            // duplicate is copied from, so nothing of its history carries over.
            if (operation === 'create') return publishing ? new Date().toISOString() : null
            return (
              value ??
              originalDoc?.firstPublishedAt ??
              (publishing || originalDoc?._status === 'published'
                ? new Date().toISOString()
                : undefined)
            )
          },
        ],
      },
    },
    {
      name: 'legalReview',
      type: 'select',
      label: 'Legal review',
      options: [
        { label: 'Draft, awaiting legal review (I-22)', value: 'draft' },
        { label: 'Reviewed by IIIC’s lawyer', value: 'approved' },
      ],
      admin: {
        position: 'sidebar',
        description:
          'For the legal pages only. A draft carries a marker on the page until the lawyer has reviewed it (I-22).',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      maxLength: 155,
      validate: validateDescription,
      admin: {
        description:
          'One or two sentences for search results and shared links, up to 155 characters.',
      },
    },
    {
      name: 'layout',
      type: 'blocks',
      label: 'Sections',
      labels: { singular: 'Section', plural: 'Sections' },
      required: true,
      minRows: 1,
      blocks: PAGE_BLOCKS,
      // The page rules (src/blocks/pageBlocks.ts), each returning early on failure. They run
      // on publishing, on a status-only publish and on restoring a version; a draft skips them.
      validate: async (value, options) => {
        const base = await validateBlocks(value, options)
        if (base !== true) return base
        const hero = oneOpeningHero(value)
        if (hero !== true) return hero
        const band = oneClosingBand(value)
        if (band !== true) return band
        const anchors = uniqueAnchors(value)
        if (anchors !== true) return anchors
        if (mistypedPlaceholders(value).length > 0) {
          return 'A placeholder is typed another way: write it as [[TODO: what is missing, I-xx]].'
        }
        // The merged document: on a status-only publish the slug comes from the stored page.
        return carriesFixedStatements(value, (options.data as { slug?: unknown } | undefined)?.slug)
      },
    },
    {
      name: 'facts',
      type: 'array',
      labels: { singular: 'Fact', plural: 'Facts' },
      admin: {
        description:
          'Every claim the page makes, with where it comes from (docs/content/README.md). A claim with no source does not go on the page.',
      },
      fields: [
        { name: 'statement', type: 'textarea', required: true },
        {
          type: 'row',
          fields: [
            {
              name: 'source',
              type: 'select',
              required: true,
              options: [
                { label: 'Brochure', value: 'brochure' },
                { label: 'Current site', value: 'site' },
                { label: 'Registration form', value: 'form' },
                { label: 'Founder', value: 'founder' },
                { label: "IIIC's description or philosophy", value: 'description' },
                { label: 'Counted', value: 'counted' },
              ],
            },
            { name: 'checkedAt', type: 'date', label: 'Checked on' },
          ],
        },
      ],
    },
  ],
}
