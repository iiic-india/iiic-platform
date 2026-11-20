import type { CollectionConfig } from 'payload'
import { blocks as validateBlocks } from 'payload/shared'

import { allow, POLICY } from '@/access/policy'
import { oneClosingBand, PAGE_BLOCKS } from '@/blocks/pageBlocks'
import { copyStarterPage } from '@/lib/content/copyStarter'
import { revalidatePages } from '@/lib/content/revalidate'
import { PAGE_SLUG } from '@/lib/content/slug'

/**
 * The public pages, built from the kit's blocks (docs/05, Content; docs/04). A page is
 * drafted, then published; visitors see published pages only. Until a page exists here, its
 * route shows the repository's starter page for it (D-51).
 */
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
  // editors draft and publish; owners and editors delete.
  access: {
    read: allow(POLICY.pages.read),
    create: allow(POLICY.pages.create),
    update: allow(POLICY.pages.update),
    delete: allow(POLICY.pages.delete),
  },
  // Visitors read published pages without signing in, so the staff two-factor wrapper
  // (payload-totp) stays off this one operation; every write still needs a verified code.
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
      admin: { description: 'The name of the page, as the browser tab and this list show it.' },
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
      validate: async (value, options) => {
        const base = await validateBlocks(value, options)
        return base === true ? oneClosingBand(value) : base
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
