import type { CollectionAfterChangeHook } from 'payload'

import { queueFromHook } from '@/lib/automations/operations/hookEvents'

/**
 * The events M5's records raise for M6 (docs/19 §5; docs/18 §5): a privacy request recorded
 * (`dataRequest.received`, O4 and O7) and an incident recorded in the breach register
 * (`incident.opened`, O8). Each is raised once, when the record is created, inside its
 * transaction, with the record's id only. However the record is made (the office's form, the
 * public form later, the server), the clocks it starts are the ones its deadlines were set from.
 * Free of `server-only`: the collections load in the Payload CLI too.
 */
export const raiseRequestReceived: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation === 'create') {
    await queueFromHook(req, { name: 'dataRequest.received', dataRequestId: Number(doc.id) })
  }
  return doc
}

export const raiseIncidentOpened: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation === 'create') {
    await queueFromHook(req, { name: 'incident.opened', incidentId: Number(doc.id) })
  }
  return doc
}
