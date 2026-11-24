import type { CollectionAfterChangeHook } from 'payload'

import { queueFromHook } from '@/lib/automations/operations/hookEvents'

/**
 * Attendance marking raises M3's after-the-session events (docs/16 §9; docs/06 B8, B9): a
 * confirmed booking marked completed raises `booking.completed`, marked a no-show raises
 * `booking.noShow`, once, in the change's own transaction, with the booking's id only. The
 * practitioner or the office marks it on the booking (src/lib/booking/bookingHooks.ts holds who
 * may); no other move raises either. Free of `server-only`: the collections load in the Payload
 * CLI too.
 */
export const raiseAttendance: CollectionAfterChangeHook = async ({
  doc,
  operation,
  previousDoc,
  req,
}) => {
  if (operation !== 'update' || previousDoc?.status !== 'confirmed') return doc
  if (doc.status === 'completed') {
    await queueFromHook(req, { name: 'booking.completed', bookingId: Number(doc.id) })
  } else if (doc.status === 'noShow') {
    await queueFromHook(req, { name: 'booking.noShow', bookingId: Number(doc.id) })
  }
  return doc
}
