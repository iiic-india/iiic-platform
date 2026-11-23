import type { CollectionConfig } from 'payload'

import { allow, allowField, FIELD_POLICY, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { guardIssue, raiseIssueScheduled } from '@/lib/newsletter/hooks'
import { IST_FIELD } from '@/lib/time/ist'

const serverOnly = {
  read: allowField(FIELD_POLICY.serverOnly.read),
  create: allowField(FIELD_POLICY.serverOnly.write),
  update: allowField(FIELD_POLICY.serverOnly.write),
}

/**
 * The monthly Journal issue (docs/06 N4; docs/13 §5: "written by a person, edited by a person, and
 * sent to confirmed subscribers only"; D-10), in the shape of src/brand/templates/email/newsletter.html:
 * a lead story and two short items from the Journal, one call to action. An editor or an owner
 * schedules it; at its time builder C's task sends it to every subscriber whose consent to marketing
 * email is in force then, with one-click unsubscribe headers (RFC 8058). The send itself is
 * recorded per recipient in `messages`, so a retried run sends nobody twice.
 */
export const NewsletterIssues: CollectionConfig = {
  slug: 'newsletter-issues',
  labels: { singular: 'Newsletter issue', plural: 'Newsletter issues' },
  admin: {
    group: 'Messages',
    useAsTitle: 'title',
    defaultColumns: ['number', 'title', 'status', 'scheduledFor', 'sentAt'],
    hidden: ({ user }) => !hasRole(user, ...POLICY.newsletterIssues.read.roles),
    description: 'The monthly Journal email: written here, sent to confirmed subscribers.',
  },
  access: {
    read: allow(POLICY.newsletterIssues.read),
    create: allow(POLICY.newsletterIssues.create),
    update: allow(POLICY.newsletterIssues.update),
    delete: allow(POLICY.newsletterIssues.delete),
  },
  defaultSort: '-number',
  // An editor drafts, schedules and cancels; scheduling raises N4's event (src/lib/newsletter/hooks.ts).
  hooks: { beforeChange: [guardIssue], afterChange: [raiseIssueScheduled] },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'number',
          type: 'number',
          label: 'Issue number',
          required: true,
          min: 1,
          unique: true,
        },
        { name: 'title', type: 'text', required: true, maxLength: 110 },
      ],
    },
    {
      name: 'preheader',
      type: 'text',
      required: true,
      maxLength: 140,
      admin: { description: 'Shown in the inbox after the subject.' },
    },
    {
      name: 'lead',
      type: 'group',
      label: 'Lead story',
      fields: [
        { name: 'post', type: 'relationship', relationTo: 'posts', required: true },
        {
          name: 'note',
          type: 'textarea',
          maxLength: 600,
          admin: { description: 'Optional: a line of your own above the excerpt.' },
        },
      ],
    },
    {
      name: 'items',
      type: 'array',
      label: 'Short items',
      maxRows: 2,
      fields: [
        { name: 'post', type: 'relationship', relationTo: 'posts', required: true },
        { name: 'note', type: 'textarea', maxLength: 400 },
      ],
    },
    {
      name: 'cta',
      type: 'group',
      label: 'Call to action',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'label', type: 'text', maxLength: 40 },
            {
              name: 'path',
              type: 'text',
              maxLength: 200,
              admin: { description: 'A page on this site, starting with /.' },
              validate: (value: unknown) =>
                value === null ||
                value === undefined ||
                value === '' ||
                (typeof value === 'string' && /^\/(?!\/)[^\s]*$/.test(value)) ||
                'Give a page on this site, starting with a single /.',
            },
          ],
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'status',
          type: 'select',
          required: true,
          defaultValue: 'draft',
          options: [
            { label: 'Draft', value: 'draft' },
            { label: 'Scheduled', value: 'scheduled' },
            { label: 'Sending', value: 'sending' },
            { label: 'Sent', value: 'sent' },
            { label: 'Cancelled', value: 'cancelled' },
          ],
          admin: {
            description: 'Schedule it with a time below; it can be cancelled until it sends.',
          },
        },
        {
          name: 'scheduledFor',
          type: 'date',
          label: 'Send at',
          timezone: IST_FIELD,
          admin: { date: { pickerAppearance: 'dayAndTime' } },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'sentAt',
          type: 'date',
          label: 'Sent',
          timezone: IST_FIELD,
          access: serverOnly,
          admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
        },
        {
          name: 'recipientCount',
          type: 'number',
          label: 'Sent to',
          access: serverOnly,
          admin: { readOnly: true },
        },
      ],
    },
  ],
}
