import type { CollectionConfig, Config, Endpoint, Field, PayloadHandler } from 'payload'

import { incidentRules, requestRules } from '@/lib/privacy/hooks'

/**
 * Session notes and privacy (M5 slice A; docs/18 §3, §5): attaches the privacy collections' own
 * rules on save, the panels on the records they belong to, and the routes those panels call. It
 * adds no field that holds data (a `ui` field has no column) and no collection.
 *
 * The routes' modules read keys and the database and are `server-only`, which the Payload CLI
 * cannot load (src/lib/env.ts says why), so each is loaded when a route is first called.
 */

/** A handler from a module loaded on its first call. */
const lazy =
  <K extends string>(load: () => Promise<Record<K, PayloadHandler>>, key: K): PayloadHandler =>
  async (req) =>
    (await load())[key](req)

const notes = () => import('@/lib/notes/endpoints').then((module) => module.notesHandlers)
const privacy = () => import('@/lib/privacy/endpoints').then((module) => module.privacyHandlers)

export const NOTES_AND_PRIVACY_ENDPOINTS: Endpoint[] = [
  { path: '/notes/list', method: 'get', handler: lazy(notes, 'list') },
  { path: '/notes/write', method: 'post', handler: lazy(notes, 'write') },
  { path: '/notes/update', method: 'post', handler: lazy(notes, 'update') },
  { path: '/notes/open', method: 'post', handler: lazy(notes, 'open') },
  { path: '/notes/count', method: 'get', handler: lazy(notes, 'count') },
  { path: '/privacy/erasure-plan', method: 'post', handler: lazy(privacy, 'plan') },
  { path: '/privacy/confirm-erasure', method: 'post', handler: lazy(privacy, 'confirm') },
  { path: '/privacy/export', method: 'post', handler: lazy(privacy, 'export') },
  { path: '/privacy/export-file', method: 'get', handler: lazy(privacy, 'download') },
]

/** A panel on a record's edit view: a `ui` field, which stores nothing. */
const panel = (name: string, component: string): Field => ({
  name,
  type: 'ui',
  admin: { components: { Field: component } },
})

function withRules(collection: CollectionConfig): CollectionConfig {
  const hooks = collection.hooks ?? {}
  switch (collection.slug) {
    case 'data-requests':
      return {
        ...collection,
        hooks: { ...hooks, beforeChange: [requestRules, ...(hooks.beforeChange ?? [])] },
        fields: [
          panel('requestActions', '/components/admin/privacy/RequestActions#RequestActions'),
          ...collection.fields,
        ],
      }
    case 'incidents':
      return {
        ...collection,
        hooks: { ...hooks, beforeChange: [incidentRules, ...(hooks.beforeChange ?? [])] },
      }
    case 'bookings':
      return {
        ...collection,
        fields: [
          ...collection.fields,
          panel('sessionNotes', '/components/admin/notes/BookingNotes#BookingNotes'),
        ],
      }
    case 'people':
      return {
        ...collection,
        fields: [
          ...collection.fields,
          panel('sessionNotes', '/components/admin/notes/PersonNotes#PersonNotes'),
        ],
      }
    default:
      return collection
  }
}

export function notesAndPrivacy() {
  return (config: Config): Config => ({
    ...config,
    collections: (config.collections ?? []).map(withRules),
    endpoints: [...(config.endpoints ?? []), ...NOTES_AND_PRIVACY_ENDPOINTS],
  })
}
