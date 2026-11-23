import type { CollectionConfig, Field } from 'payload'

import { allow, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { TEMPLATE_KEYS } from '@/emails/registry'
import { AUTOMATION_IDS } from '@/lib/automations/catalogue'
import {
  CHANNELS,
  MESSAGE_KINDS,
  MESSAGE_STATUSES,
  SENDER_KEYS,
  SKIP_REASONS,
  SUBJECT_COLLECTIONS,
} from '@/lib/messaging/types'
import { IST_FIELD } from '@/lib/time/ist'

const options = (values: readonly string[]) => values.map((value) => ({ label: value, value }))

const when = (name: string, label: string, index = false): Field => ({
  name,
  type: 'date',
  label,
  index,
  timezone: IST_FIELD,
  admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
})

/**
 * Every message the platform sends, one row per message and channel (docs/04 `message_log`,
 * widened into the outbox; docs/19 §3). A row is written when an automation decides to send
 * (`deliver`), before anything leaves, under a unique key (`<automation>:<collection>:<id>
 * [:<variant>]:<channel>`), so a message fires once however often its job runs. The row holds
 * what the message is about and to whom, by id, and its state; never its body, its address or
 * anything said in counselling (CLAUDE.md #3; Logs). Only the server writes it (POLICY.messages).
 * Kept one year (docs/04), removed by O5.
 */
export const Messages: CollectionConfig = {
  slug: 'messages',
  labels: { singular: 'Message', plural: 'Messages' },
  admin: {
    group: 'Messages',
    useAsTitle: 'dedupeKey',
    defaultColumns: ['sendAt', 'automation', 'template', 'channel', 'status', 'skipReason'],
    hidden: ({ user }) => !hasRole(user, ...POLICY.messages.read.roles),
    description: 'Every automated message: when it is due, its channel and what happened to it.',
  },
  access: {
    read: allow(POLICY.messages.read),
    create: allow(POLICY.messages.create),
    update: allow(POLICY.messages.update),
    delete: allow(POLICY.messages.delete),
  },
  defaultSort: '-sendAt',
  disableBulkEdit: true,
  lockDocuments: false,
  indexes: [{ fields: ['status', 'sendAt'] }, { fields: ['subjectCollection', 'subjectId'] }],
  fields: [
    {
      name: 'dedupeKey',
      type: 'text',
      label: 'Key',
      required: true,
      unique: true,
      maxLength: 200,
      admin: { readOnly: true, description: 'One message per key: it is never sent twice.' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'automation',
          type: 'select',
          required: true,
          index: true,
          options: options(AUTOMATION_IDS),
          admin: { readOnly: true },
        },
        {
          name: 'template',
          type: 'select',
          required: true,
          options: options(TEMPLATE_KEYS),
          admin: { readOnly: true },
        },
        { name: 'variant', type: 'text', maxLength: 40, admin: { readOnly: true } },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'channel',
          type: 'select',
          required: true,
          options: [...CHANNELS],
          admin: { readOnly: true },
        },
        {
          name: 'fallback',
          type: 'select',
          label: 'Fallback channel',
          options: [...CHANNELS],
          admin: { readOnly: true },
        },
        {
          name: 'kind',
          type: 'select',
          required: true,
          options: [...MESSAGE_KINDS],
          admin: { readOnly: true },
        },
        {
          name: 'sender',
          type: 'select',
          options: options(SENDER_KEYS),
          admin: { readOnly: true, description: 'Email only: the sending identity (docs/13 §1).' },
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
          defaultValue: 'queued',
          index: true,
          options: [...MESSAGE_STATUSES],
          admin: { readOnly: true },
        },
        {
          name: 'skipReason',
          type: 'select',
          label: 'Why not sent',
          options: [...SKIP_REASONS],
          admin: { readOnly: true },
        },
        {
          name: 'lastError',
          type: 'text',
          label: 'Last error',
          maxLength: 64,
          admin: { readOnly: true, description: 'A code from the provider, never its message.' },
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Who and what',
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'recipientKind',
              type: 'select',
              required: true,
              options: [
                { label: 'A person', value: 'person' },
                { label: 'A newsletter subscriber', value: 'subscriber' },
                { label: 'Staff', value: 'staff' },
              ],
              admin: { readOnly: true },
            },
            {
              name: 'person',
              type: 'relationship',
              relationTo: 'people',
              index: true,
              admin: { readOnly: true },
            },
            {
              name: 'subscriber',
              type: 'relationship',
              relationTo: 'subscribers',
              admin: { readOnly: true },
            },
            { name: 'staff', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'subjectCollection',
              type: 'select',
              label: 'About',
              required: true,
              options: options(SUBJECT_COLLECTIONS),
              admin: { readOnly: true },
            },
            {
              name: 'subjectId',
              type: 'number',
              label: 'Record',
              required: true,
              admin: { readOnly: true },
            },
          ],
        },
        {
          name: 'counselling',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            readOnly: true,
            description: 'About a counselling session: no offer, ever (docs/06).',
          },
        },
        {
          name: 'fallbackOf',
          type: 'relationship',
          relationTo: 'messages',
          label: 'Sent instead of',
          admin: { readOnly: true },
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Timing and delivery',
      fields: [
        {
          type: 'row',
          fields: [
            when('sendAt', 'Due', true),
            when('sendBefore', 'Of no use after'),
            {
              name: 'requiresOpenWindow',
              type: 'checkbox',
              label: 'Only in an open WhatsApp conversation',
              defaultValue: false,
              admin: { readOnly: true },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'attempts',
              type: 'number',
              defaultValue: 0,
              min: 0,
              admin: { readOnly: true },
            },
            when('claimedAt', 'Claimed'),
            when('sentAt', 'Sent'),
            when('deliveredAt', 'Delivered'),
            when('readAt', 'Read'),
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'provider',
              type: 'select',
              options: [
                { label: 'Resend', value: 'resend' },
                { label: 'AiSensy', value: 'aisensy' },
                { label: 'Fake (tests)', value: 'fake' },
              ],
              admin: { readOnly: true },
            },
            {
              name: 'providerMessageId',
              type: 'text',
              label: 'Provider’s id',
              unique: true,
              maxLength: 128,
              admin: { readOnly: true },
            },
          ],
        },
      ],
    },
  ],
}
