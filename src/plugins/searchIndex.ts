import { searchPlugin } from '@payloadcms/plugin-search'
import type { BeforeSync } from '@payloadcms/plugin-search/types'
import type {
  CollectionAfterChangeHook,
  CollectionConfig,
  Field,
  FieldAccess,
  Plugin,
} from 'payload'

import { allow, POLICY } from '@/access/policy'
import { indexedFields, staysOutOfIndex } from '@/lib/search/entries'
import {
  isSearchKind,
  SEARCH_INDEX,
  SEARCH_KINDS,
  SEARCHED_COLLECTIONS,
  type SearchKind,
} from '@/lib/search/kinds'

/**
 * Site search's index (docs/04 `search_index`; docs/11 §5.3; D-34), kept by Payload's own
 * search plugin, `@payloadcms/plugin-search` 3.94.0: one entry for each published page, active
 * service, published Journal article and published question, written by the plugin's hooks as a
 * document is published, changed, unpublished or deleted, never for a draft (`syncDrafts` off,
 * `deleteDrafts` on). What an entry holds, and which documents have none, is decided in
 * src/lib/search/entries.ts: a page on a route that is never indexed and a service that is not
 * offered stay out, and when a published document becomes one of them, its entry is removed here.
 * The index is a copy of what visitors may already read, so anyone reads it (/search does, on the
 * server); its words are matched by Payload's `like` (src/lib/search/query.ts).
 */

/** Who reads and changes entries (src/access/policy.ts). Entries are added only by the plugin. */
export const SEARCH_INDEX_ACCESS = {
  read: allow(POLICY.searchIndex.read),
  update: allow(POLICY.searchIndex.update),
  delete: allow(POLICY.searchIndex.delete),
} as const

/**
 * The entry's own words come from its document: nobody writes them through the API or the admin,
 * where they are read-only. The plugin writes them past the access rules.
 */
const derived: { create: FieldAccess; update: FieldAccess } = {
  create: () => false,
  update: () => false,
}

/** The plugin's fields, in IIIC's words, followed by what the results page shows. */
function indexFields({ defaultFields }: { defaultFields: Field[] }): Field[] {
  const named = (field: Field) => ('name' in field ? field.name : undefined)
  const relabel = (field: Field): Field => {
    switch (named(field)) {
      case 'title':
        return { ...field, label: 'Title', access: derived } as Field
      case 'priority':
        return {
          ...field,
          label: 'Priority',
          admin: {
            ...field.admin,
            description:
              'Higher comes first among its kind on /search. Pages start at 40, services at 30, articles at 20 and questions at 10.',
          },
        } as Field
      case 'doc':
        return { ...field, label: 'Document' } as Field
      default:
        return field
    }
  }
  return [
    ...defaultFields.map(relabel),
    {
      name: 'url',
      type: 'text',
      label: 'Address',
      access: derived,
      admin: { readOnly: true, description: 'Where the result leads on the site.' },
    },
    {
      name: 'excerpt',
      type: 'textarea',
      access: derived,
      admin: {
        readOnly: true,
        description: 'Shown under the title when no sentence of the text matches.',
      },
    },
    {
      name: 'content',
      type: 'textarea',
      label: 'Text',
      access: derived,
      admin: {
        readOnly: true,
        description: 'The words a search is matched against, as visitors read them on the site.',
      },
    },
  ]
}

/** An entry's title, address, excerpt and text, from the document as it was just saved. */
const beforeSync: BeforeSync = ({ collectionSlug, originalDoc, searchDoc }) => {
  const fields = isSearchKind(collectionSlug) ? indexedFields(collectionSlug, originalDoc) : null
  return fields ? { ...searchDoc, ...fields } : searchDoc
}

/**
 * Removes the entry of a document that the index must no longer hold: a published page moved to
 * a route that is never indexed, a service no longer offered. Runs before the plugin's own hook,
 * which then leaves the document alone (`skipSync`).
 */
function removeWhenHidden(kind: SearchKind): CollectionAfterChangeHook {
  return async ({ doc, req }) => {
    if (staysOutOfIndex(kind, doc)) {
      await req.payload.delete({
        collection: SEARCH_INDEX,
        where: {
          and: [{ 'doc.relationTo': { equals: kind } }, { 'doc.value': { equals: doc.id } }],
        },
        depth: 0,
        req,
      })
    }
    return doc
  }
}

function withRemoval(collection: CollectionConfig): CollectionConfig {
  if (!isSearchKind(collection.slug)) return collection
  const hooks = collection.hooks ?? {}
  return {
    ...collection,
    hooks: {
      ...hooks,
      afterChange: [...(hooks.afterChange ?? []), removeWhenHidden(collection.slug)],
    },
  }
}

const plugin = searchPlugin({
  collections: [...SEARCHED_COLLECTIONS],
  defaultPriorities: Object.fromEntries(
    SEARCHED_COLLECTIONS.map((kind) => [kind, SEARCH_KINDS[kind].priority]),
  ),
  syncDrafts: false,
  deleteDrafts: true,
  beforeSync,
  skipSync: ({ collectionSlug, doc }) =>
    isSearchKind(collectionSlug) && staysOutOfIndex(collectionSlug, doc),
  searchOverrides: {
    slug: SEARCH_INDEX,
    labels: { singular: 'Search entry', plural: 'Search index' },
    // Create stays the plugin's own rule: nobody, through the API or the admin.
    access: SEARCH_INDEX_ACCESS,
    // Visitors read the index without signing in, so the staff two-factor wrapper (payload-totp)
    // stays off this one operation; changing or removing an entry still needs the code.
    custom: { totp: { disableAccessWrapper: { read: true } } },
    defaultSort: '-priority',
    admin: {
      group: 'Content',
      useAsTitle: 'title',
      defaultColumns: ['title', 'url', 'priority', 'updatedAt'],
      description:
        'What /search finds: an entry for each published page, offered service, published article and published question, kept up to date as they are published, changed and unpublished. "Reindex" builds a kind again from what is published.',
    },
    fields: indexFields,
  },
})

/**
 * The plugin, after the hook that removes hidden documents' entries has joined each searched
 * collection. Listed before payload-totp among the plugins (src/payload.config.ts), so that
 * changing an entry, and the "Reindex" that needs it, waits for the two-factor code.
 */
export function searchIndex(): Plugin {
  return (config) =>
    plugin({
      ...config,
      collections: config.collections?.map((collection) => withRemoval(collection)),
    })
}
