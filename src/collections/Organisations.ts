import type { CollectionConfig } from 'payload'

import { allow, allowField, FIELD_POLICY, POLICY } from '@/access/policy'
import { hasRole } from '@/access/roles'
import { validateGstin, validatePostalCode, validateWebsite } from '@/lib/pipeline/fields'
import { ORGANISATION_TYPES, TEAM_SIZE_BANDS } from '@/lib/pipeline/values'

const serverOnly = {
  read: allowField(FIELD_POLICY.serverOnly.read),
  create: allowField(FIELD_POLICY.serverOnly.write),
  update: allowField(FIELD_POLICY.serverOnly.write),
}

/**
 * An organisation (docs/04 `organisations`, S1 · operator, owner, finance; docs/17 §2): a company
 * that asks for a Team Map or a proposal, or an institution that partners with the institute.
 * Its people and leads point at it. A public form makes one only when no organisation matches
 * (docs/17 §4), and never changes one: what a form said is kept on its enquiry. Kept seven years
 * after its last invoice (docs/04). The matching keys are the server's (the CRM builder's hooks).
 */
export const Organisations: CollectionConfig = {
  slug: 'organisations',
  labels: { singular: 'Organisation', plural: 'Organisations' },
  admin: {
    group: 'People',
    useAsTitle: 'name',
    defaultColumns: ['name', 'type', 'sector', 'teamSizeBand', 'city', 'updatedAt'],
    listSearchableFields: ['name', 'domain'],
    hidden: ({ user }) => !hasRole(user, ...POLICY.organisations.read.roles),
  },
  access: {
    read: allow(POLICY.organisations.read),
    create: allow(POLICY.organisations.create),
    update: allow(POLICY.organisations.update),
    delete: allow(POLICY.organisations.delete),
  },
  defaultSort: 'name',
  disableBulkEdit: true,
  fields: [
    { name: 'name', type: 'text', required: true, maxLength: 200 },
    {
      type: 'row',
      fields: [
        {
          name: 'type',
          type: 'select',
          required: true,
          defaultValue: 'business',
          options: [...ORGANISATION_TYPES],
        },
        {
          name: 'website',
          type: 'text',
          maxLength: 200,
          validate: validateWebsite,
          admin: { description: 'Its address, such as example.com.' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'sector', type: 'text', maxLength: 100 },
        {
          name: 'teamSizeBand',
          type: 'select',
          label: 'Team size',
          options: [...TEAM_SIZE_BANDS],
        },
        { name: 'city', type: 'text', maxLength: 100 },
      ],
    },
    {
      // What its invoices name (docs/04): the GSTIN and the billing address.
      name: 'billing',
      type: 'group',
      fields: [
        {
          name: 'gstin',
          type: 'text',
          label: 'GSTIN',
          maxLength: 15,
          validate: validateGstin,
          hooks: {
            beforeValidate: [
              ({ value }) =>
                typeof value === 'string' ? value.trim().toUpperCase() || null : value,
            ],
          },
        },
        { name: 'line1', type: 'text', label: 'Address line 1', maxLength: 200 },
        { name: 'line2', type: 'text', label: 'Address line 2', maxLength: 200 },
        {
          type: 'row',
          fields: [
            { name: 'city', type: 'text', maxLength: 100 },
            { name: 'state', type: 'text', maxLength: 100 },
            {
              name: 'postalCode',
              type: 'text',
              label: 'PIN code',
              maxLength: 6,
              validate: validatePostalCode,
            },
          ],
        },
      ],
    },
    {
      // Matching keys (docs/17 §4), written by the server from the website and the name.
      type: 'row',
      fields: [
        {
          name: 'domain',
          type: 'text',
          index: true,
          maxLength: 253,
          access: serverOnly,
          admin: { readOnly: true, description: 'The website’s host, for matching requests.' },
        },
        {
          name: 'nameKey',
          type: 'text',
          index: true,
          maxLength: 200,
          access: serverOnly,
          admin: { readOnly: true, description: 'The name as matching compares it.' },
        },
      ],
    },
    {
      name: 'people',
      type: 'join',
      collection: 'people',
      on: 'organisation',
      admin: { allowCreate: false, defaultColumns: ['fullName', 'jobTitle', 'email'] },
    },
    {
      name: 'leads',
      type: 'join',
      collection: 'leads',
      on: 'organisation',
      defaultSort: '-createdAt',
      admin: { allowCreate: false, defaultColumns: ['kind', 'stage', 'owner', 'updatedAt'] },
    },
  ],
}
