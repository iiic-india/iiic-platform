import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import {
  type CollectionBeforeChangeHook,
  type CollectionBeforeValidateHook,
  type Field,
  type TextFieldSingleValidation,
  ValidationError,
} from 'payload'
import { text } from 'payload/shared'

import { allow, POLICY } from '@/access/policy'
import { PAGE_SLUG } from '@/lib/content/slug'
import { chainProblem } from '@/lib/redirects/chains'
import {
  answeredBySite,
  cleanPath,
  isSitePath,
  MAX_REDIRECTS,
  REDIRECT_STATUSES,
  requestPath,
} from '@/lib/redirects/paths'
import { revalidateRedirects } from '@/lib/redirects/revalidate'
import { readRedirects, sameId, targetOf, type StoredTarget } from '@/lib/redirects/table'

/**
 * Old addresses and where they lead now (docs/04 `redirects`; docs/12 §3), as Payload's own
 * redirects plugin keeps them: the old address, where it leads (a page, by reference, which
 * follows the page when its address changes, or an address on this site) and the kind of
 * redirect. A visitor who asks for an address the site has no page at is sent on by the
 * redirect from it, before the 404 (src/lib/redirects/lookup.ts). Redirects are made here, from
 * the 404 log in one click (Content → Broken links), and by the site itself when a published
 * page's address changes (src/lib/redirects/pageMoves.ts). None chains or loops, and none
 * leaves the site.
 */

/** What the admin says when it refuses (src/brand/VOICE.md, "Interface copy"). */
export const REDIRECT_MESSAGES = {
  from: 'Write the old address as a path on this site, such as /about-us: no query, no #.',
  answered: 'The site answers that address itself, so a redirect from it would never be followed.',
  to: 'Choose a page on this site, such as /about or /about#contact: small letters, numbers and hyphens.',
  page: 'Choose the page visitors should find.',
  published: (from: string) =>
    `A page is published at ${from}, so a redirect from it would never be followed. Move or unpublish the page first.`,
  full: `The site holds ${MAX_REDIRECTS.toLocaleString('en-IN')} redirects, its limit. Remove ones nobody needs before adding another.`,
} as const

/** "about-us", " /about-us/ " and "/about%2Dus" are one address: "/about-us". */
function asPath(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return requestPath(withSlash) ?? trimmed
}

const tidyAddresses: CollectionBeforeValidateHook = ({ data }) => {
  if (!data) return data
  if ('from' in data) data.from = asPath(data.from)
  const to = data.to as { url?: unknown } | undefined
  if (to && typeof to.url === 'string') {
    const url = to.url.trim()
    to.url = url.startsWith('/') ? url : `/${url}`
  }
  return data
}

/** The admin field a refusal about where a redirect leads belongs to. */
const targetField = (to: StoredTarget) => (to?.type === 'custom' ? 'to.url' : 'to.reference')

/**
 * The checks that need the other redirects and the pages: no chain or loop, no redirect from
 * an address with a published page, and no more than the site reads. Run on every save, those
 * the site makes for a moved page included, against the redirects as this request sees them.
 */
const checkAgainstOthers: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  const from = String(data.from ?? '')
  const id = (originalDoc as { id?: number | string } | undefined)?.id
  const errors: { path: string; message: string }[] = []

  const rules = await readRedirects(req.payload, req)
  if (operation === 'create' && rules.length >= MAX_REDIRECTS) {
    errors.push({ path: 'from', message: REDIRECT_MESSAGES.full })
  }
  const to = await targetOf(data.to as StoredTarget, req.payload, req)
  if (to === null) {
    errors.push({ path: targetField(data.to as StoredTarget), message: REDIRECT_MESSAGES.page })
  } else {
    const problem = chainProblem(
      { id, from, to },
      rules.filter((rule) => !sameId(rule.id, id)),
    )
    if (problem) {
      const path = problem.field === 'to' ? targetField(data.to as StoredTarget) : 'from'
      errors.push({ path, message: problem.message })
    }
  }

  // A published page wins over a redirect from its address (src/lib/content/pages.ts), so such
  // a redirect is refused while it is new; publishing a page removes any redirect from its
  // address (src/lib/redirects/pageMoves.ts). The home page lives at "/", never at "/home".
  const fromChanged = operation === 'create' || (originalDoc as { from?: string }).from !== from
  const slug = from.slice(1)
  if (fromChanged && slug !== 'home' && PAGE_SLUG.test(slug)) {
    const { totalDocs } = await req.payload.count({
      collection: 'pages',
      where: { and: [{ slug: { equals: slug } }, { _status: { equals: 'published' } }] },
      overrideAccess: true,
      req,
    })
    if (totalDocs > 0) errors.push({ path: 'from', message: REDIRECT_MESSAGES.published(from) })
  }

  if (errors.length > 0) throw new ValidationError({ collection: 'redirects', errors, id, req })
  return data
}

/** Payload's own check first (required), then the address rules. */
const validateFrom: TextFieldSingleValidation = async (value, options) => {
  const base = await text(value, options)
  if (base !== true) return base
  if (typeof value !== 'string' || cleanPath(value) !== value) return REDIRECT_MESSAGES.from
  return !answeredBySite(value) || REDIRECT_MESSAGES.answered
}

/** Payload's own check first (required while "An address" is chosen), then a path on this site. */
const validateUrl: TextFieldSingleValidation = async (value, options) => {
  const base = await text(value, options)
  if (base !== true) return base
  return isSitePath(value) || REDIRECT_MESSAGES.to
}

/** The plugin's fields, in IIIC's words and with IIIC's checks (src/brand/VOICE.md). */
function withIiicFields(defaultFields: Field[]): Field[] {
  return defaultFields.map((field) => {
    if (!('name' in field)) return field
    if (field.name === 'from' && field.type === 'text' && !field.hasMany) {
      return {
        ...field,
        label: 'Old address',
        validate: validateFrom,
        admin: { ...field.admin, description: 'The address visitors ask for, such as /about-us.' },
      }
    }
    if (field.name === 'to' && field.type === 'group') {
      return {
        ...field,
        fields: field.fields.map((sub): Field => {
          if (!('name' in sub)) return sub
          if (sub.name === 'type' && sub.type === 'radio') {
            return {
              ...sub,
              label: 'Leads to',
              options: [
                { label: 'A page', value: 'reference' },
                { label: 'An address on this site', value: 'custom' },
              ],
              admin: {
                ...sub.admin,
                description:
                  'A page is followed wherever it moves. Choose an address for a page the admin does not hold, or to open one section of a page.',
              },
            }
          }
          if (sub.name === 'reference' && sub.type === 'relationship') {
            return { ...sub, label: 'Page' }
          }
          if (sub.name === 'url' && sub.type === 'text' && !sub.hasMany) {
            return {
              ...sub,
              label: 'Address',
              validate: validateUrl,
              admin: {
                ...sub.admin,
                description: 'Such as /about, or /about#contact for a section.',
              },
            }
          }
          return sub
        }),
      }
    }
    return field
  })
}

/**
 * The redirects collection (`@payloadcms/plugin-redirects`, pinned with Payload, docs/12 §3).
 * Listed before payload-totp among the plugins, so that its access rules wait for the
 * two-factor code like every other collection's.
 */
export const redirects = redirectsPlugin({
  // A redirect may lead to a page by reference.
  collections: ['pages'],
  redirectTypes: ['308', '307'],
  redirectTypeFieldOverride: {
    label: 'Kind',
    defaultValue: '308',
    options: REDIRECT_STATUSES.map(({ label, value }) => ({ label, value })),
    admin: {
      position: 'sidebar',
      description: 'Permanent tells search engines to list the new address instead.',
    },
  },
  overrides: {
    labels: { singular: 'Redirect', plural: 'Redirects' },
    admin: {
      group: 'Content',
      useAsTitle: 'from',
      defaultColumns: ['from', 'to.type', 'to.reference', 'to.url', 'type', 'updatedAt'],
      listSearchableFields: ['from'],
      description:
        'Old addresses and where each one leads now. The site makes one itself when a published page gets a new address.',
    },
    // src/access/policy.ts (docs/05): the staff who edit content. Visitors never read them
    // through the API; the site reads them on the server (src/lib/redirects/lookup.ts).
    access: {
      read: allow(POLICY.redirects.read),
      create: allow(POLICY.redirects.create),
      update: allow(POLICY.redirects.update),
      delete: allow(POLICY.redirects.delete),
    },
    defaultSort: 'from',
    // Two redirects from one address cannot be: a copy would only be refused.
    disableDuplicate: true,
    hooks: {
      beforeValidate: [tidyAddresses],
      beforeChange: [checkAgainstOthers],
      // The next request follows the change (docs/12 §4).
      afterChange: [
        ({ doc }) => {
          revalidateRedirects()
          return doc
        },
      ],
      afterDelete: [
        ({ doc }) => {
          revalidateRedirects()
          return doc
        },
      ],
    },
    fields: ({ defaultFields }) => withIiicFields(defaultFields),
  },
})
