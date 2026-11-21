import type { CollectionConfig, DateField } from 'payload'

import { allow, POLICY } from '@/access/policy'
import { createRedirectFromMissingPage } from '@/lib/redirects/createFromMissing'

/**
 * The 404 log (docs/04 `missing_pages`; docs/11 §5.1, item 9; Content → Broken links in
 * docs/05): each address a visitor asked for that the site has no page at, with the host of the
 * site that linked to it, when it was first and last asked for, and how often. Only the 404 page
 * adds to it, on the server, with no query string and nothing about the visitor
 * (src/lib/redirects/log.ts); an entry nobody has asked for in 180 days is removed by the
 * retention job (O5, src/jobs/purgeMissingPages.ts). "Create redirect" sends the address on to
 * a page and marks the entry resolved.
 */

/** Stored in UTC and shown in Asia/Kolkata whatever the browser's zone (CLAUDE.md #8). */
const IST: DateField['timezone'] = {
  defaultTimezone: 'Asia/Kolkata',
  supportedTimezones: [{ label: 'India Standard Time', value: 'Asia/Kolkata' }],
}

/** Kept by the 404 page alone: staff read these, and change only the redirect. */
const readOnly = { access: { update: () => false }, admin: { readOnly: true } } as const

export const MissingPages: CollectionConfig = {
  slug: 'missing-pages',
  labels: { singular: 'Broken link', plural: 'Broken links' },
  admin: {
    group: 'Content',
    useAsTitle: 'path',
    defaultColumns: ['path', 'hits', 'lastSeen', 'firstSeen', 'referrerHost', 'resolved'],
    listSearchableFields: ['path', 'referrerHost'],
    description:
      'Addresses visitors asked for that the site has no page at, most visited first. Open one to send its visitors to a page with a redirect.',
  },
  // src/access/policy.ts (docs/05): only the server adds entries.
  access: {
    read: allow(POLICY.missingPages.read),
    create: allow(POLICY.missingPages.create),
    update: allow(POLICY.missingPages.update),
    delete: allow(POLICY.missingPages.delete),
  },
  defaultSort: '-hits',
  disableDuplicate: true,
  // "Create redirect": makes the redirect and marks the entry resolved, in one step.
  endpoints: [{ path: '/:id/redirect', method: 'post', handler: createRedirectFromMissingPage }],
  fields: [
    {
      name: 'createRedirect',
      type: 'ui',
      admin: { components: { Field: '/components/admin/CreateRedirect#CreateRedirect' } },
    },
    {
      name: 'path',
      type: 'text',
      label: 'Address',
      required: true,
      unique: true,
      index: true,
      ...readOnly,
    },
    {
      name: 'hits',
      type: 'number',
      label: 'Visits',
      required: true,
      defaultValue: 1,
      ...readOnly,
    },
    {
      name: 'firstSeen',
      type: 'date',
      label: 'First asked for',
      required: true,
      timezone: IST,
      access: readOnly.access,
      admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'lastSeen',
      type: 'date',
      label: 'Last asked for',
      required: true,
      // The retention job removes entries by this date.
      index: true,
      timezone: IST,
      access: readOnly.access,
      admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'referrerHost',
      type: 'text',
      label: 'Linked from',
      ...readOnly,
      admin: {
        readOnly: true,
        description:
          'The site the latest visitor came from, when their browser said: its name only, never the page.',
      },
    },
    {
      name: 'resolved',
      type: 'relationship',
      relationTo: 'redirects',
      label: 'Redirect',
      admin: {
        description: 'Set when a redirect sends this address on to a page.',
        components: { Cell: '/components/admin/ResolvedCell#ResolvedCell' },
      },
    },
  ],
}
