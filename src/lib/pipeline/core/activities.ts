import type { PayloadRequest } from 'payload'

import { POLICY } from '@/access/policy'
import { err, ok } from '@/lib/result'
import { IST } from '@/lib/time/ist'
import type { LeadActivity } from '@/payload-types'

import type { LogActivity } from '../leads'
import { STAFF_ACTIVITY_TYPES, type ActivityType } from '../values'
import { asPlatform, staffWithCode } from './actor'

/**
 * A lead's timeline (docs/17 §2; src/lib/pipeline/leads.ts, LogActivity). The activities' hook
 * keeps the lead's `lastActivityAt`, and its `touchedAt` for an entry by the staff, whichever
 * way the entry is written. Free of `server-only`: the leads' hook writes the stage changes.
 */

export function isStaffActivityType(type: unknown): type is (typeof STAFF_ACTIVITY_TYPES)[number] {
  return (STAFF_ACTIVITY_TYPES as readonly unknown[]).includes(type)
}

/** Whether `by` is the signed-in owner or operator, with the code. */
function isTheSignedInStaff(req: PayloadRequest, by: number): boolean {
  return staffWithCode(req.user, POLICY.leadActivities.create.roles) && req.user?.id === by
}

const write: LogActivity = async (req, input) => {
  const lead = await req.payload.findByID({
    collection: 'leads',
    id: input.leadId,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    req,
  })
  if (!lead) return err({ code: 'not-found' })
  const activity = await asPlatform(req, input.by, () =>
    req.payload.create({
      collection: 'lead-activities',
      data: {
        lead: lead.id,
        type: input.type as ActivityType,
        at: (input.at ?? new Date()).toISOString(),
        at_tz: IST,
        body: input.body,
        by: input.by,
        enquiry: input.about?.enquiryId,
        proposalVersion: input.about?.proposalVersionId,
        booking: input.about?.bookingId,
      },
      depth: 0,
      overrideAccess: true,
      req,
    }),
  )
  return ok(activity as LeadActivity)
}

/**
 * LogActivity: an entry by a member of the staff (`by` set) is one of STAFF_ACTIVITY_TYPES, by an
 * owner or an operator who has entered the code, and is theirs; the platform's own entries
 * (`by: null`) are any type.
 */
export const logActivity: LogActivity = async (req, input) => {
  if (input.by !== null) {
    if (!isStaffActivityType(input.type) || !isTheSignedInStaff(req, input.by)) {
      return err({ code: 'not-allowed' })
    }
  }
  return write(req, input)
}

/**
 * The platform's own entry for something a member of the staff did through one of its
 * operations, such as a proposal version made, sent or answered (docs/17 §5): any type, since
 * the server, not the person, chooses it, recorded as theirs. `by` must still be the signed-in
 * owner or operator with the code; with `by: null` the entry is the platform's alone.
 */
export const logPlatformActivity: LogActivity = async (req, input) => {
  if (input.by !== null && !isTheSignedInStaff(req, input.by)) {
    return err({ code: 'not-allowed' })
  }
  return write(req, input)
}
