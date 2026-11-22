import { ValidationError, type CollectionBeforeChangeHook } from 'payload'

import { hasRole } from '@/access/roles'

/**
 * The own-profile check for working hours and their exceptions (docs/16 §2, §12; docs/05: a
 * practitioner keeps "own calendar and availability"). The office and owners set anyone's; any
 * other staff member who may write them (a practitioner) sets them only on the profile whose
 * staff account is their own, and cannot move an entry to someone else's profile. A plain module:
 * the collections load wherever the Payload config does.
 */

const idOf = (value: unknown): number | undefined =>
  typeof value === 'number' ? value : (value as { id?: number } | null | undefined)?.id

export const ownProfileOnly: CollectionBeforeChangeHook = async ({
  collection,
  data,
  originalDoc,
  req,
}) => {
  const user = req.user
  if (!user || hasRole(user, 'owner', 'operator')) return data
  const ids = new Set(
    [
      idOf((data as { practitioner?: unknown }).practitioner),
      idOf(originalDoc?.practitioner),
    ].filter((id): id is number => id !== undefined),
  )
  for (const id of ids.size ? ids : new Set([undefined])) {
    const profile =
      id === undefined
        ? null
        : await req.payload
            .findByID({ collection: 'practitioners', id, depth: 0, overrideAccess: true, req })
            .catch(() => null)
    if (!profile || idOf(profile.staff) !== user.id) {
      throw new ValidationError({
        collection: collection.slug,
        errors: [
          { path: 'practitioner', message: 'You can set working hours on your own profile only.' },
        ],
      })
    }
  }
  return data
}
