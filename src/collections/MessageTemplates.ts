import type { CollectionConfig } from 'payload'

import { allow, allowField, FIELD_POLICY, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { TEMPLATE_KEYS } from '@/emails/registry'
import { CHANNELS } from '@/lib/messaging/types'
import { DEFAULT_LANGUAGE, LANGUAGES } from '@/lib/site/languages'
import { IST_FIELD } from '@/lib/time/ist'

const approval = {
  read: allowField(FIELD_POLICY.messageApproval.read),
  update: allowField(FIELD_POLICY.messageApproval.write),
  create: allowField(FIELD_POLICY.messageApproval.write),
}

/**
 * The wording of each automated message, kept in the admin (docs/04 `message_templates`; docs/05
 * Messages → Templates; docs/13 §4: "every automated message has a template in the CMS with a
 * version, an owner and a last-reviewed date"). The layout and the rules are code
 * (src/emails/registry.ts); the words a template's file holds are its defaults, and an approved
 * entry here replaces its subject, preheader and lines (docs/19 §7). For WhatsApp, the entry holds
 * the provider's template name, its category and Meta's decision: a template is sent only while
 * approved, else the message falls back to email. One entry per key, channel and language; Payload
 * keeps its versions.
 */
export const MessageTemplates: CollectionConfig = {
  slug: 'message-templates',
  labels: { singular: 'Message template', plural: 'Message templates' },
  admin: {
    group: 'Messages',
    useAsTitle: 'key',
    defaultColumns: ['key', 'channel', 'language', 'status', 'lastReviewedAt'],
    hidden: ({ user }) => !hasRole(user, ...POLICY.messageTemplates.read.roles),
    description: 'The words of each automated message, and the approved WhatsApp templates.',
  },
  access: {
    read: allow(POLICY.messageTemplates.read),
    create: allow(POLICY.messageTemplates.create),
    update: allow(POLICY.messageTemplates.update),
    delete: allow(POLICY.messageTemplates.delete),
  },
  versions: { maxPerDoc: 50 },
  indexes: [{ fields: ['key', 'channel', 'language'], unique: true }],
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'key',
          type: 'select',
          required: true,
          options: TEMPLATE_KEYS.map((key) => ({ label: key, value: key })),
        },
        { name: 'channel', type: 'select', required: true, options: [...CHANNELS] },
        {
          name: 'language',
          type: 'select',
          required: true,
          defaultValue: DEFAULT_LANGUAGE,
          options: [...LANGUAGES],
        },
      ],
    },
    {
      name: 'subject',
      type: 'text',
      maxLength: 120,
      admin: {
        description: 'Email only. States the fact, with no urgency words (docs/13 §5).',
        condition: (data) => data?.channel === 'email',
      },
    },
    {
      name: 'preheader',
      type: 'text',
      maxLength: 140,
      admin: {
        description: 'Email only: the next step, shown in the inbox after the subject.',
        condition: (data) => data?.channel === 'email',
      },
    },
    {
      name: 'body',
      type: 'textarea',
      maxLength: 4000,
      admin: {
        description:
          'The lines of the message, with {{variables}} the template names. For WhatsApp, exactly the text Meta approved.',
      },
    },
    {
      type: 'row',
      admin: { condition: (data) => data?.channel === 'whatsapp' },
      fields: [
        {
          name: 'providerTemplateName',
          type: 'text',
          label: 'Provider’s template name',
          maxLength: 100,
        },
        {
          name: 'category',
          type: 'select',
          options: [
            { label: 'Utility', value: 'utility' },
            { label: 'Marketing', value: 'marketing' },
            { label: 'Authentication', value: 'authentication' },
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
          access: approval,
          options: [
            { label: 'Draft', value: 'draft' },
            { label: 'Submitted to Meta', value: 'submitted' },
            { label: 'Approved', value: 'approved' },
            { label: 'Rejected', value: 'rejected' },
            { label: 'Paused', value: 'paused' },
          ],
          admin: { description: 'Only approved wording is used. An owner approves.' },
        },
        {
          name: 'owner',
          type: 'relationship',
          relationTo: 'users',
          label: 'Owner of the wording',
        },
        {
          name: 'lastReviewedAt',
          type: 'date',
          label: 'Last reviewed',
          timezone: IST_FIELD,
          access: approval,
        },
      ],
    },
  ],
}
