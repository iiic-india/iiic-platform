import { hasRole, isActive, type MaybeStaff, type Role } from '@/access/roles'

/**
 * Who may use the office's money and calendar actions (docs/16 §12, E; CLAUDE.md #6): checked
 * first, before any input is read, by every endpoint and every view of this slice. Payload's
 * custom endpoints and views are public unless they check for themselves, and payload-totp's
 * wrapper covers collection access only, so the two-factor code is asked for here too.
 *
 * - `office`: an owner or operator (docs/05: bookings, calendar, refunds within the threshold).
 * - `owner`: an owner (docs/05: approvals; a refund above the threshold, or every refund while no
 *   threshold is set, docs/16 §5).
 * - `hours`: the office, or a practitioner for their own profile (docs/05: "own calendar and
 *   availability"); which profile is checked by the action itself.
 *
 * A plain module: the collections that register the endpoints load wherever the config does.
 */

export type Need = 'office' | 'owner' | 'hours'

export type Refusal = {
  status: 401 | 403
  /** `sign-in`: no staff session; `enter-code`: signed in without the two-factor code. */
  code: 'sign-in' | 'enter-code' | 'not-allowed'
}

type StaffUser = MaybeStaff & { collection?: string; _strategy?: string }

const ROLES_FOR: Record<Need, Role[]> = {
  office: ['owner', 'operator'],
  owner: ['owner'],
  hours: ['owner', 'operator', 'practitioner'],
}

/** Why a request may not use an action that needs `need`, or null when it may. */
export function refusalFor(user: unknown, need: Need): Refusal | null {
  const staff = user as StaffUser | null | undefined
  if (!staff || staff.collection !== 'users') return { status: 401, code: 'sign-in' }
  if (!isActive(staff)) return { status: 403, code: 'not-allowed' }
  if (staff._strategy !== 'totp') return { status: 403, code: 'enter-code' }
  if (!hasRole(staff, ...ROLES_FOR[need])) return { status: 403, code: 'not-allowed' }
  return null
}

/** Whether a request may use an action that needs `need`. */
export const may = (user: unknown, need: Need): boolean => refusalFor(user, need) === null

/** Whether the user is the office (owner or operator), rather than a practitioner. */
export const isOfficeUser = (user: unknown): boolean => may(user, 'office')
